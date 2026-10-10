// @ts-check
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Maestro do modo refinamento: roda o Claude em segundo plano (`claude -p`, uma execução por etapa) e grava o que ele
// faz em <pasta do ticket>/.ao-vivo.jsonl ({ em, tipo, texto }), que a aba Spec mostra ao vivo.
// Sem AskUserQuestion (não existe em -p): perguntas passam pelo sdd-state e pela aba.
// A sessão fica em .ao-vivo.sid para continuar a mesma conversa (--resume) quando precisar.
const SID = '.ao-vivo.sid', PID = '.ao-vivo.pid';
const { anotar } = require('./componentes/ao-vivo'); // caixa "Ao vivo": o que o claude -p faz vai para lá
const rodando = new Map(); // pasta do ticket -> processo (desta janela)
// Execução de outra janela do VS Code (ou de antes de recarregar): o pid fica em .ao-vivo.pid enquanto o claude roda.
// Confere que o pid ainda é um claude (o executável, não um caminho com "claude" no meio): pid pode ser reaproveitado.
const vivo = (pid) => { try { process.kill(pid, 0); return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').slice(0, 2).some((a) => path.basename(a) === 'claude'); } catch { return false; } };
const pidDe = (dir) => { try { return Number(fs.readFileSync(path.join(dir, PID), 'utf8')) || null; } catch { return null; } };
const rodandoEm = (dir) => rodando.has(dir) || vivo(pidDe(dir));

const claudeBin = () => [path.join(os.homedir(), '.local', 'bin', 'claude'), '/usr/local/bin/claude', '/usr/bin/claude'].find((p) => fs.existsSync(p)) || 'claude';
const curto = (s) => String(s || '').replaceAll(os.homedir(), '~').replace(/\s+/g, ' ').trim();
const nome = (p) => path.basename(String(p || ''));

// ── Textos do Ao vivo: tudo o que o usuário lê sai daqui (padronize/ajuste só neste bloco) ──
// Tipos: etapa (título da execução), fala (o que o Claude diz), acao (o que ele faz), aviso (bloqueio), erro, fim.
const PASSOS = ['Constituição', 'Especificação', 'Clarificação', 'Plano técnico', 'Tarefas', 'Análise de qualidade', 'Implementação'];
/** @type {[RegExp, string][]} */
const DOCS = [ // caminho → nome que o usuário entende
  [/constitution\.md$/, 'a constituição'],
  [/constituicao-wms-mapeamento\.md$/, 'o mapeamento do código (base da constituição)'],
  [/spec\.md$/, 'a especificação'], [/plan\.md$/, 'o plano técnico'], [/tasks\.md$/, 'as tarefas'],
  [/analise\.md$/, 'a análise de consistência'], [/\.ticket\.json$/, 'os dados do ticket'], [/SKILL\.md$/, 'o método SDD'],
  [/\.notas\.html$/, 'as notas do ticket'], [/\.handoff-backend\.md$/, 'a análise do backend'], [/\.handoff-mobile\.md$/, 'a análise do mobile']
];
/** @type {[RegExp, string][]} */
const REPOS = [[/novo-wms-backend/, 'backend'], [/wms-mobile/, 'mobile'], [/WMS\/specs/, 'specs']];
const doc = (p) => {
  const achado = DOCS.find(([r]) => r.test(p || ''));
  if (achado) return achado[1];
  const repo = REPOS.find(([r]) => r.test(p || ''));
  return `${nome(p)}${repo ? ` (${repo[1]})` : ''}`;
};
const STATUS_TAREFA = { pendente: 'pendente', em_andamento: 'em andamento', feita: 'feita' };
// Comandos do sdd-state → frase. a = { sub, n, opt }.
const SDD = {
  init: () => 'Criando a pasta da spec no repositório de specs',
  status: () => 'Conferindo onde a spec parou', json: () => 'Conferindo onde a spec parou',
  check: () => 'Conferindo se algum arquivo da spec mudou',
  iniciar: (a) => `Começando o passo ${a.n} · ${PASSOS[a.n] || ''}`,
  concluir: (a) => `Passo ${a.n} · ${PASSOS[a.n] || ''} pronto para sua revisão`,
  ajuste: (a) => `Reabrindo o passo ${a.n} para ajuste`,
  aprovar: () => 'Tentou aprovar um passo (só você aprova)',
  pergunta: (a) => (a.sub === 'add' ? `Pergunta para você: “${a.opt.texto || ''}”` : a.sub === 'responder' ? 'Registrando sua resposta' : 'Descartando uma pergunta'),
  comentario: (a) => `Comentário classificado: ${({ resposta: 'responde uma pergunta', mudanca: 'pede mudança', ruido: 'sem ação' })[a.opt.tipo] || ''}`,
  impacto: (a) => (a.sub === 'aplicado' ? 'Mudança aplicada na spec' : `Análise do comentário registrada (impacto ${a.opt.nivel || ''})`),
  duvida: (a) => `Dúvida registrada: “${a.opt.texto || ''}”`,
  achado: (a) => (a.sub === 'add' ? `Achado ${a.opt.severidade || ''}: ${a.opt.descricao || ''}` : a.sub === 'resolver' ? 'Achado resolvido' : 'Achado aceito com justificativa'),
  tarefa: (a) => `Tarefa ${a.sub}: ${STATUS_TAREFA[a.opt.status] || a.opt.status || ''}`
};
const aspas = (cmd) => [...String(cmd).matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
function fraseSdd(cmd) {
  const t = aspas(cmd), k = t.findIndex((x) => /\/sdd-state$|^sdd-state$/.test(x));
  const [c, sub] = [t[k + 1], t[k + 2]];
  const opt = {};
  for (let i = k + 2; i < t.length; i++) if (t[i].startsWith('--')) opt[t[i].slice(2)] = t[i + 1];
  return SDD[c]?.({ sub, n: Number(sub), opt }) || `Atualizando a spec (${c})`;
}
// Uma ferramenta do Claude → { tipo, texto } (null = não mostra).
function linhaFerramenta(f) {
  const i = f.input || {};
  const acao = (texto) => ({ tipo: 'acao', texto });
  if (f.name === 'Read') return acao(`Lendo ${doc(i.file_path)}`);
  if (f.name === 'Write') return acao(`Escrevendo ${doc(i.file_path)}`);
  if (f.name === 'Edit' || f.name === 'MultiEdit') return acao(`Atualizando ${doc(i.file_path)}`);
  if (f.name === 'Glob') return acao(`Procurando arquivos ${curto(i.pattern).slice(0, 60)}`);
  if (f.name === 'Grep') return acao(`Buscando “${curto(i.pattern).slice(0, 60)}” no código`);
  if (f.name === 'Skill') return acao(/sdd/.test(i.skill) ? 'Carregando o método SDD' : /mapa/.test(i.skill) ? 'Carregando o método de mapeamento do código' : `Usando a skill ${i.skill}`);
  if (f.name === 'Bash') {
    const c = curto(i.command);
    if (/sdd-state/.test(c)) return acao(fraseSdd(i.command));
    if (/mapa-conferir/.test(c)) return acao(`Conferindo as evidências do mapeamento${/handoff-(backend|mobile)/.test(c) ? ` (${c.match(/handoff-(backend|mobile)/)[1]})` : ''}`);
    if (/mapa-db/.test(c)) return acao(/\bstatus\b/.test(c) ? 'Conferindo a configuração do banco' : 'Consultando o banco (só leitura)');
    if (/mapa-git/.test(c)) return acao(`Consultando o histórico do ${/wms-mobile/.test(c) ? 'mobile' : /novo-wms-backend/.test(c) ? 'backend' : 'repositório'} (só leitura)`);
    if (/^git\b/.test(c)) return acao('Consultando o histórico do repositório');
    if (/^(ls|find)\b/.test(c)) return acao('Listando arquivos');
    if (/^(cat|head|tail)\b/.test(c)) return acao(`Lendo ${doc(aspas(c)[1])}`);
    return acao(`Rodando um comando (${c.split(' ')[0]})`);
  }
  if (['ToolSearch', 'TodoWrite'].includes(f.name)) return null;
  return acao(`Usando ${f.name}`);
}
// Fala do Claude: a primeira frase vira a linha; o texto inteiro fica no detalhe (passar o mouse).
const fala = (t) => ({ tipo: 'fala', texto: (t.replace(/[*`#>]/g, '').split(/(?<=[.!?:])\s|\n/)[0] || t).trim().slice(0, 180), detalhe: t.slice(0, 2000) });

// Evento do stream-json → linhas { tipo, texto, detalhe? } (vazio = ignora).
function linhas(e) {
  if (e.type === 'assistant') return (e.message?.content || []).flatMap((c) => (c.type === 'text' && c.text.trim() ? [fala(c.text.trim())]
    : c.type === 'tool_use' ? [linhaFerramenta(c)].filter(Boolean) : []));
  if (e.type === 'system' && e.subtype === 'permission_denied') return [{ tipo: 'aviso', texto: `Bloqueado: ação fora do permitido nesta etapa (${e.tool_name || 'ferramenta'})`, detalhe: curto(e.message) }];
  if (e.type === 'user') return (Array.isArray(e.message?.content) ? e.message.content : [])
    .filter((c) => c.type === 'tool_result' && /hook error/.test(String(c.content)))
    .map((c) => ({ tipo: 'aviso', texto: `Regra do SDD: ${curto(String(c.content).replace(/^.*hook error:\s*/, '')).slice(0, 160)}` }));
  if (e.type === 'result') return [{ tipo: e.is_error ? 'erro' : 'fim', texto: `${e.is_error ? 'Etapa terminou com erro' : 'Etapa concluída'} · ${Math.round((e.duration_ms || 0) / 1000)} s · US$ ${(e.total_cost_usd || 0).toFixed(2).replace('.', ',')}` }];
  return [];
}

// Roda uma etapa. ferramentas: lista do --allowedTools. continuar: retoma a última sessão do ticket.
// extras: argumentos a mais do claude (ex.: --plugin-dir, --add-dir).
function rodar(dir, { prompt, titulo = 'Claude trabalhando', cwd = dir, ferramentas = [], extras = [], env = /** @type {Record<string, string>} */ ({}), continuar = false, aoMudar = () => {} }) {
  if (rodandoEm(dir)) return false;
  const gravar = (l) => anotar(dir, l);
  let sid = null;
  try { sid = continuar ? fs.readFileSync(path.join(dir, SID), 'utf8').trim() : null; } catch {}
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
    ...(ferramentas.length ? ['--allowedTools', ...ferramentas] : []), ...extras, ...(sid ? ['--resume', sid] : [])];
  const p = spawn(claudeBin(), args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  rodando.set(dir, p);
  try { fs.writeFileSync(path.join(dir, PID), String(p.pid)); } catch {}
  gravar({ tipo: 'etapa', texto: titulo });
  aoMudar();
  let resto = '';
  p.stdout.on('data', (b) => {
    const partes = (resto + b).split('\n');
    resto = partes.pop();
    for (const l of partes) {
      let e;
      try { e = JSON.parse(l); } catch { continue; }
      if (e.type === 'system' && e.subtype === 'init' && e.session_id) fs.writeFileSync(path.join(dir, SID), e.session_id);
      linhas(e).forEach(gravar);
    }
  });
  let erro = '';
  p.stderr.on('data', (b) => { erro += b; });
  let falhou = false;
  const soltar = () => { rodando.delete(dir); if (pidDe(dir) === p.pid) fs.rmSync(path.join(dir, PID), { force: true }); };
  p.on('close', (code) => {
    soltar();
    if (code && !falhou) gravar({ tipo: 'erro', texto: `O Claude parou com erro (código ${code})`, detalhe: `código ${code}${erro.trim() ? `: ${curto(erro).slice(0, 200)}` : ''}` });
    aoMudar();
  });
  p.on('error', (e) => { falhou = true; soltar(); gravar({ tipo: 'erro', texto: `Não consegui rodar o Claude: ${e.message}` }); aoMudar(); });
  return true;
}

// Mata todas as execuções em segundo plano (claude -p); devolve quantas eram.
const matarTodos = () => { const n = rodando.size; for (const p of rodando.values()) p.kill('SIGTERM'); return n; };
const parar = (dir) => { if (rodando.has(dir)) return rodando.get(dir).kill('SIGTERM'); const pid = pidDe(dir); if (vivo(pid)) process.kill(pid, 'SIGTERM'); };

module.exports = { rodar, parar, matarTodos, rodando: rodandoEm, vivo, claudeBin, _teste: { linhas, linhaFerramenta, fraseSdd } };
