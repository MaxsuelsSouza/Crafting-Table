const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Maestro do modo refinamento: roda o Claude em segundo plano (`claude -p`, uma execução por etapa) e grava o que ele
// faz em <pasta do ticket>/.ao-vivo.jsonl ({ em, tipo, texto }), que a aba Spec mostra ao vivo.
// Sem AskUserQuestion (não existe em -p): perguntas passam pelo sdd-state e pela aba.
// A sessão fica em .ao-vivo.sid para continuar a mesma conversa (--resume) quando precisar.
const VIVO = '.ao-vivo.jsonl', SID = '.ao-vivo.sid', PID = '.ao-vivo.pid';
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
const DOCS = [ // caminho → nome que o usuário entende
  [/constitution\.md$/, 'a constituição'],
  [/constituicao-wms-mapeamento\.md$/, 'o mapeamento do código (base da constituição)'],
  [/spec\.md$/, 'a especificação'], [/plan\.md$/, 'o plano técnico'], [/tasks\.md$/, 'as tarefas'],
  [/analise\.md$/, 'a análise de consistência'], [/\.ticket\.json$/, 'os dados do ticket'], [/SKILL\.md$/, 'o método SDD'],
  [/\.notas\.html$/, 'as notas do ticket'], [/\.handoff-backend\.md$/, 'a análise do backend'], [/\.handoff-mobile\.md$/, 'a análise do mobile']
];
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
function rodar(dir, { prompt, titulo = 'Claude trabalhando', cwd, ferramentas = [], extras = [], env = {}, continuar = false, aoMudar = () => {} }) {
  if (rodandoEm(dir)) return false;
  const gravar = (l) => anotar(dir, l);
  let sid = null;
  try { sid = continuar ? fs.readFileSync(path.join(dir, SID), 'utf8').trim() : null; } catch {}
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
    ...(ferramentas.length ? ['--allowedTools', ...ferramentas] : []), ...extras, ...(sid ? ['--resume', sid] : [])];
  const p = spawn(claudeBin(), args, { cwd: cwd || dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
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

// Linha no Ao vivo (do Claude ou de passos da própria extensão). Fila por pasta: uma linha a cada meio segundo, para dar
// tempo de ler (o Claude e o ▶ escrevem em rajada). Fila acima de 20 linhas acelera para não ficar minutos atrasada.
const INTERVALO = 500, INTERVALO_FILA_LONGA = 100;
const filas = new Map(); // pasta -> { linhas, ultimo, timer }
function anotar(dir, l) {
  const f = filas.get(dir) || { linhas: [], ultimo: 0, timer: null };
  filas.set(dir, f);
  f.linhas.push(l);
  escoar(dir, f);
}
function escoar(dir, f) {
  if (f.timer || !f.linhas.length) return;
  const passo = f.linhas.length > 20 ? INTERVALO_FILA_LONGA : INTERVALO;
  f.timer = setTimeout(() => {
    f.timer = null;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, VIVO), JSON.stringify({ em: new Date().toISOString(), ...f.linhas.shift() }) + '\n');
    } catch {}
    f.ultimo = Date.now();
    escoar(dir, f);
  }, Math.max(0, f.ultimo + passo - Date.now()));
}

// n = Infinity: o log inteiro (caixa expandida). Linha corrompida não derruba a caixa.
const aoVivo = (dir, n = 40) => {
  let linhas;
  try { linhas = fs.readFileSync(path.join(dir, VIVO), 'utf8').trim().split('\n'); } catch { return []; }
  return linhas.slice(-n).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
};
const totalVivo = (dir) => { try { return fs.readFileSync(path.join(dir, VIVO), 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } };
// Caixa expandida (todo o log, do primeiro ao mais recente): marcada por arquivo, para a tela que vigia a pasta redesenhar sozinha.
const EXPANDIDO = '.ao-vivo.expandido';
const expandido = (dir) => fs.existsSync(path.join(dir, EXPANDIDO));
const alternarExpandido = (dir) => (expandido(dir) ? fs.rmSync(path.join(dir, EXPANDIDO), { force: true }) : fs.writeFileSync(path.join(dir, EXPANDIDO), ''));
// Caixa pronta para a tela: lê o log (40 linhas, ou tudo se expandida) e põe o botão Ver tudo/Recolher (alvo: 'qa' | 'spec').
const caixaVivo = (dir, rodandoAgora, alvo) => {
  const exp = expandido(dir);
  return aoVivoHtml(aoVivo(dir, exp ? Infinity : 40), rodandoAgora, { expandido: exp, total: totalVivo(dir), alvo });
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Caixa "Ao vivo" (aba Spec e Evidências do QA): o que o Claude em segundo plano (maestro.js) está fazendo.
// Tipos antigos (antes da padronização) caem no equivalente novo.
const TIPO_VIVO = { texto: 'fala', ferramenta: 'acao', bloqueio: 'aviso', inicio: 'etapa' };
const ICONE_VIVO = { fala: '✦', acao: '›', aviso: '⛔', erro: '⚠', fim: '✓', etapa: '▶' };
const hora = (em) => new Date(em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
// Mais recente em cima: blocos por etapa (a etapa mais nova primeiro), o título da etapa no topo do bloco e as linhas dele da mais nova para a mais antiga.
const recentesPrimeiro = (l) => l.reduce((g, x) => ((TIPO_VIVO[x.tipo] || x.tipo) === 'etapa' || !g.length ? g.push([x]) : g.at(-1).push(x), g), [])
  .reverse().flatMap(([cab, ...resto]) => ((TIPO_VIVO[cab.tipo] || cab.tipo) === 'etapa' ? [cab, ...resto.reverse()] : [...resto.reverse(), cab]));
const aoVivoHtml = (l, vivo, o = {}) => (l.length ? `<div class="caixa-t">Ao vivo<span>${vivo ? '<span class="vivo-bola"></span>Claude trabalhando' : 'parado'}
  ${o.alvo && (o.expandido || o.total > l.length) ? `<button class="vivo-exp" data-painel="vivoExpandir" data-id="${esc(o.alvo)}" title="${o.expandido ? 'Voltar às últimas 40 linhas' : 'Mostrar o log inteiro, do primeiro ao mais recente'}">${o.expandido ? 'Recolher' : `Ver tudo (${o.total})`}</button>` : ''}</span></div>
  <div class="folha ao-vivo ${o.expandido ? 'expandido' : ''}" id="aoVivo">${recentesPrimeiro(l).map((x) => {
    const tipo = TIPO_VIVO[x.tipo] || x.tipo;
    return tipo === 'etapa' ? `<div class="vivo v-etapa"><span class="vt">${esc(x.texto)}</span><span class="vq">${esc(hora(x.em))}</span></div>`
      : `<div class="vivo v-${esc(tipo)}" ${x.detalhe ? `title="${esc(x.detalhe)}"` : ''}><span class="vi">${ICONE_VIVO[tipo] || '·'}</span>
        <span class="vt">${esc(x.texto.slice(0, 220))}</span><span class="vq">${esc(hora(x.em))}</span></div>`;
  }).join('')}</div>` : '');

const CSS_VIVO = `
  .ao-vivo.expandido { max-height: 70vh; }
  .vivo-exp { margin-left: 8px; height: 18px; padding: 0 7px; border: 1px solid var(--border); border-radius: var(--r-md); background: none; color: var(--text);
    font: inherit; font-size: 10.5px; cursor: pointer; }
  .vivo-exp:hover { background: var(--surface-2); }
  .ao-vivo { max-height: 260px; overflow: auto; font-size: 11.5px; line-height: 1.45; padding: 8px 10px; }
  .vivo { display: flex; gap: 6px; padding: 2px 0; }
  .vivo .vi { flex: none; width: 12px; text-align: center; color: var(--text-dim); }
  .vivo .vt { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; }
  .vivo .vq { flex: none; color: var(--text-dim); font-size: 10px; }
  .v-etapa { margin: 8px 0 2px; padding: 3px 6px; border-radius: var(--r-md); background: color-mix(in srgb, var(--ia) 14%, transparent);
    color: var(--ia); font-weight: 600; font-size: 11.5px; }
  .v-etapa:first-child { margin-top: 0; }
  .v-acao { padding-left: 8px; } .v-acao .vt { color: var(--text-dim); }
  .v-fala .vt { font-style: italic; }
  .v-aviso .vt { color: var(--warn); } .v-erro .vt { color: var(--danger); }
  .v-fim .vi { color: var(--ok, var(--ok)); }
  .vivo-bola { display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: var(--ia); animation: pulsa 1.2s infinite; }
  @keyframes pulsa { 50% { opacity: .3; } }
`;
// Mata todas as execuções em segundo plano (claude -p); devolve quantas eram.
const matarTodos = () => { const n = rodando.size; for (const p of rodando.values()) p.kill('SIGTERM'); return n; };
const parar = (dir) => { if (rodando.has(dir)) return rodando.get(dir).kill('SIGTERM'); const pid = pidDe(dir); if (vivo(pid)) process.kill(pid, 'SIGTERM'); };

module.exports = { rodar, anotar, aoVivo, aoVivoHtml, caixaVivo, alternarExpandido, expandido, CSS_VIVO, parar, matarTodos, rodando: rodandoEm, vivo, VIVO, claudeBin, _teste: { linhas, linhaFerramenta, fraseSdd, recentesPrimeiro } };
