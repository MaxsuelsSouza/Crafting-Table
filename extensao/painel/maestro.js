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
const { anotar, anexarConversa } = require('../componentes/ao-vivo'); // caixa "Ao vivo": o que o claude -p faz vai para lá
const rodando = new Map(); // pasta do ticket -> processo (desta janela)
const erros = new Map(); // pasta -> motivo do último erro do Claude (is_error do stream, código de saída ou falha ao subir); o QA lê para pausar a fila
const ultimas = new Map(); // pasta -> opções da última execução (para o ⚡ retomar a sessão com uma instrução)
const reiniciando = new Set(); // pastas cujo processo foi morto pelo ⚡: o fim dele não avança a etapa (a retomada herda o aoMudar)
// Execução de outra janela do VS Code (ou de antes de recarregar): o pid fica em .ao-vivo.pid enquanto o claude roda.
// Confere que o pid ainda é um claude (o executável, não um caminho com "claude" no meio): pid pode ser reaproveitado.
const vivo = (pid) => { try { process.kill(pid, 0); return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').slice(0, 2).some((a) => path.basename(a) === 'claude'); } catch { return false; } };
const pidDe = (dir) => { try { return Number(fs.readFileSync(path.join(dir, PID), 'utf8')) || null; } catch { return null; } };
const rodandoEm = (dir) => rodando.has(dir) || vivo(pidDe(dir));

// Git só de leitura liberado em toda execução com lista de ferramentas (todos os módulos); as formas `git -C <repo> ...` também, que é como o Claude chama.
// fetch entra porque conferir origin/<branch> exige atualizar as referências remotas (não toca em branch nem arquivo).
const GIT_LEITURA = ['status', 'log', 'diff', 'show', 'branch', 'fetch', 'rev-parse', 'rev-list', 'ls-remote', 'for-each-ref', 'merge-base', 'cherry', 'describe', 'blame', 'ls-files', 'cat-file', 'name-rev']
  .flatMap((c) => [`Bash(git ${c}:*)`, `Bash(git -C * ${c}:*)`]);
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
// Decisões do Claude: toda execução em segundo plano recebe esta instrução; as linhas "DECISÃO: título | motivo" viram linha 'decisao' no Ao vivo,
// que o componente (ao-vivo.js) também grava na aba Decisões.
const PEDIDO_DECISAO = '\n\nDecisões: sempre que tomar uma decisão relevante (escolher entre alternativas, interpretar algo ambíguo, assumir uma premissa, desviar do pedido), escreva numa linha própria, no formato: DECISÃO: <título curto> | <o que decidiu, por quê e o que descartou>. Só decisões de verdade, não passos de rotina.';
const RE_DECISAO = /^\s*[*_`#>\s-]*DECIS[ÃA]O[*_`\s]*:[*_`\s]*(.+?)\s*$/i;
const decisao = (l) => { const [titulo, ...motivo] = l.split(/\s+[|—]\s+/); return { tipo: 'decisao', texto: titulo.replace(/[*`]/g, '').trim().slice(0, 120), detalhe: (motivo.join(' — ') || titulo).replace(/[*`]/g, '').trim().slice(0, 1500) }; };
const falas = (t) => {
  const ls = t.split('\n'), achadas = ls.map((l) => l.match(RE_DECISAO)?.[1]).filter(Boolean);
  const resto = ls.filter((l) => !RE_DECISAO.test(l)).join('\n').trim();
  return [...(resto ? [fala(resto)] : []), ...achadas.map(decisao)];
};
const fala = (t) => ({ tipo: 'fala', texto: (t.replace(/[*`#>]/g, '').split(/(?<=[.!?:])\s|\n/)[0] || t).trim().slice(0, 180), detalhe: t.slice(0, 2000) });

// MODO DE TESTE (ligado): todo arquivo que o Claude lê (Read) e todo comando que ele tenta rodar (Bash) vira uma decisão na aba Decisões, para conferir a
// ligação Ao vivo → Decisões sem depender de o modelo escrever "DECISÃO:". Desligue com CRAFTING_DECISOES_TESTE=0 no ambiente do VS Code.
const DECISOES_DE_TESTE = process.env.CRAFTING_DECISOES_TESTE !== '0';
const decisaoDeTeste = (c) => {
  const l = linhaFerramenta(c);
  if (!l || !DECISOES_DE_TESTE || !['Read', 'Bash'].includes(c.name)) return [l].filter(Boolean);
  return [{ ...l, tipo: 'decisao', detalhe: String(c.name === 'Read' ? c.input?.file_path : c.input?.command || l.texto).slice(0, 1500) }];
};

// Evento do stream-json → linhas { tipo, texto, detalhe? } (vazio = ignora).
function linhas(e) {
  if (e.type === 'assistant') return (e.message?.content || []).flatMap((c) => (c.type === 'text' && c.text.trim() ? falas(c.text.trim())
    : c.type === 'tool_use' ? decisaoDeTeste(c) : []));
  if (e.type === 'system' && e.subtype === 'permission_denied') return [{ tipo: 'aviso', texto: `Bloqueado: ação fora do permitido nesta etapa (${e.tool_name || 'ferramenta'})`, detalhe: curto(e.message) }];
  if (e.type === 'user') return (Array.isArray(e.message?.content) ? e.message.content : [])
    .filter((c) => c.type === 'tool_result' && /hook error/.test(String(c.content)))
    .map((c) => ({ tipo: 'aviso', texto: `Regra do SDD: ${curto(String(c.content).replace(/^.*hook error:\s*/, '')).slice(0, 160)}` }));
  if (e.type === 'result') return [{ tipo: e.is_error ? 'erro' : 'fim', texto: `${e.is_error ? 'Etapa terminou com erro' : 'Etapa concluída'} · ${Math.round((e.duration_ms || 0) / 1000)} s · US$ ${(e.total_cost_usd || 0).toFixed(2).replace('.', ',')}` }];
  return [];
}

// Roda uma etapa. ferramentas: lista do --allowedTools. continuar: retoma a última sessão do ticket.
// extras: argumentos a mais do claude (ex.: --plugin-dir, --add-dir).
function rodar(dir, opcoes) {
  const { prompt, titulo = 'Claude trabalhando', cwd = dir, ferramentas = [], proibidas = [], extras = [], env = /** @type {Record<string, string>} */ ({}), continuar = false, aoMudar = () => {} } = opcoes;
  if (rodandoEm(dir)) return false;
  ultimas.set(dir, opcoes); erros.delete(dir);
  const gravar = (l) => anotar(dir, l);
  let sid = null, anterior = null;
  try { anterior = fs.readFileSync(path.join(dir, SID), 'utf8').trim() || null; } catch {}
  if (anterior) anexarConversa(dir, anterior); // a sessão que terminou antes desta vai para a aba Conversas (idempotente)
  if (continuar) sid = anterior;
  let sessaoId = null; // desta execução
  const args = ['-p', prompt + PEDIDO_DECISAO, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
    ...(ferramentas.length ? ['--allowedTools', ...new Set([...ferramentas, ...GIT_LEITURA])] : []), ...(proibidas.length ? ['--disallowedTools', ...proibidas] : []), ...extras, ...(sid ? ['--resume', sid] : [])];
  const p = spawn(claudeBin(), args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  rodando.set(dir, p);
  try { fs.writeFileSync(path.join(dir, PID), String(p.pid)); } catch {}
  gravar({ tipo: 'etapa', texto: titulo });
  aoMudar();
  let resto = '';
  p.stdout.on('data', (b) => {
    p.viuSaida = true; // o claude já falou (init): o ⚡ confere isto para detectar partida travada
    const partes = (resto + b).split('\n');
    resto = partes.pop();
    for (const l of partes) {
      let e;
      try { e = JSON.parse(l); } catch { continue; }
      if (e.type === 'system' && e.subtype === 'init' && e.session_id) { sessaoId = e.session_id; fs.writeFileSync(path.join(dir, SID), e.session_id); }
      if (e.type === 'result' && e.is_error) erros.set(dir, String(e.result || e.subtype || 'erro').slice(0, 300));
      linhas(e).forEach(gravar);
    }
  });
  let erro = '';
  p.stderr.on('data', (b) => { erro += b; });
  let falhou = false;
  const soltar = () => { rodando.delete(dir); if (pidDe(dir) === p.pid) fs.rmSync(path.join(dir, PID), { force: true }); };
  p.on('close', (code) => {
    soltar();
    if (sessaoId) anexarConversa(dir, sessaoId, titulo); // terminou (ou foi pausada): vira conversa da aba, com o título da etapa
    if (reiniciando.has(dir)) return; // morto pelo ⚡: quem segue é a retomada
    if (code && !falhou) erros.set(dir, erros.get(dir) || `código ${code}${erro.trim() ? `: ${curto(erro).slice(0, 200)}` : ''}`);
    if (code && !falhou) gravar({ tipo: 'erro', texto: `O Claude parou com erro (código ${code})`, detalhe: `código ${code}${erro.trim() ? `: ${curto(erro).slice(0, 200)}` : ''}` });
    aoMudar();
  });
  p.on('error', (e) => { falhou = true; erros.set(dir, e.message); soltar(); gravar({ tipo: 'erro', texto: `Não consegui rodar o Claude: ${e.message}` }); aoMudar(); });
  return true;
}

// Mata todas as execuções em segundo plano (claude -p); devolve quantas eram.
const parar = (dir) => { if (rodando.has(dir)) return rodando.get(dir).kill('SIGTERM'); const pid = pidDe(dir); if (vivo(pid)) process.kill(pid, 'SIGTERM'); };

// ⚡ Instrução direta: mata o claude -p desta pasta (se estiver rodando) e retoma a mesma sessão (--resume) com a mensagem, com as mesmas opções
// e o mesmo aoMudar da etapa, então o fim dela segue o fluxo normal do módulo. Só vale para execução desta janela (as opções ficam em memória).
const podeInstruir = (dir) => ultimas.has(dir);
// Partida travada: depois de uma retomada o claude pode não emitir nem o init (visto: 5 min mudo, a CLI só se reiniciou sozinha); sem saída em
// VIGIA_MS a retomada é refeita uma vez e o Ao vivo avisa.
const VIGIA_MS = Number(process.env.CRAFTING_VIGIA_MS) || 45000;
async function instruir(dir, texto, tentativa = 1) {
  const o = ultimas.get(dir);
  texto = String(texto || '').trim();
  if (!o || !texto) return false;
  const p = rodando.get(dir);
  if (p) {
    reiniciando.add(dir);
    await new Promise((ok) => { p.once('close', ok); p.kill('SIGTERM'); });
    reiniciando.delete(dir);
  } else if (rodandoEm(dir)) return false; // claude de outra janela: não dá para retomar daqui
  const ok = rodar(dir, { ...o, continuar: true, titulo: `${o.titulo || 'Claude trabalhando'} · instrução`,
    prompt: `Instrução direta do usuário, vale mais que o que você estava fazendo; atenda e depois retome a etapa de onde parou:\n${texto}` });
  ultimas.set(dir, o); // a próxima instrução parte das opções da etapa, não desta retomada
  if (!ok) return false;
  if (tentativa === 1) anotar(dir, { tipo: 'voce', texto });
  const novo = rodando.get(dir);
  setTimeout(() => {
    if (rodando.get(dir) !== novo || novo.viuSaida) return;
    if (tentativa === 1) { anotar(dir, { tipo: 'aviso', texto: 'O Claude não iniciou a tempo: tentando de novo' }); instruir(dir, texto, 2); }
    else anotar(dir, { tipo: 'aviso', texto: 'O Claude ainda não iniciou: pause e retome, ou recarregue a janela' });
  }, VIGIA_MS).unref?.();
  return true;
}

module.exports = { rodar, parar, erroDe: (dir) => erros.get(dir) || null, instruir, podeInstruir, rodando: rodandoEm, vivo, claudeBin, _teste: { GIT_LEITURA, VIGIA_MS, DECISOES_DE_TESTE, falas, linhas, linhaFerramenta, fraseSdd } };
