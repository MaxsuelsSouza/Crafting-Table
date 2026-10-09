#!/usr/bin/env node
// Hooks do plugin sdd.
// PreToolUse: o Claude não edita sdd-state.json nem roda `sdd-state aprovar` (aprovação é só humana, pela aba).
// PostToolUse: depois de escrever um arquivo de spec/constituição, recalcula hashes e aplica a cascata.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const negar = (motivo) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: motivo } }));
  process.exit(0);
};

let dados;
try { dados = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exit(0); }
const entrada = dados.tool_input || {};
const arquivo = entrada.file_path || entrada.notebook_path || '';

if (dados.hook_event_name === 'PreToolUse') {
  if (/sdd-state\.json$/.test(arquivo)) negar('O estado da spec só muda pelo sdd-state (iniciar/concluir/pergunta/achado/tarefa).');
  if (/\.(tarefas|impactos)\.json$/.test(arquivo)) negar('Cards e impactos só mudam pelo sdd-state (card / impacto registrar); aprovar e aplicar no Jira é do humano, na aba Tarefas.');
  if (/\.(duvidas|respostas)\.json$/.test(arquivo)) negar('Dúvidas só mudam pelo sdd-state (duvida add / comentario classificar); responder é do humano, na aba Dúvidas.');
  const cmd = String(entrada.command || '');
  if (/\.(tarefas|impactos)\.json/.test(cmd) &&/(>|\btee\b|sed\s+-i|\bmv\b|\bcp\b|python|node\s+-e|perl|\bjq\b.*>)/.test(cmd)) negar('Não altere .tarefas.json diretamente; use sdd-state card.');
  if (/\.(duvidas|respostas)\.json/.test(cmd) && /(>|\btee\b|sed\s+-i|\bmv\b|\bcp\b|python|node\s+-e|perl|\bjq\b.*>)/.test(cmd)) negar('Não altere as dúvidas diretamente; use sdd-state duvida.');
  if (/sdd-state\b[^|;&]*\baprovar\b/.test(cmd)) negar('Aprovar um passo é exclusivo do humano, pela aba Constituição da Crafting Table. Diga que o passo está pronto para revisão.');
  if (/sdd-state\.json/.test(cmd) && /(>|\btee\b|sed\s+-i|\bmv\b|\bcp\b|python|node\s+-e|perl|\bjq\b.*>)/.test(cmd)) negar('Não altere sdd-state.json diretamente; use o sdd-state.');
  process.exit(0);
}

// Stop (asyncRewake): roda em segundo plano depois que o Claude termina a resposta. Se a spec desta conversa tem um
// passo aguardando revisão, vigia o estado; quando o humano aprova (ou pede ajuste) na aba, sai com código 2 e a
// mensagem no stderr — o Claude Code acorda o Claude nesta mesma conversa com ela.
// SessionStart também: reabrir a conversa (reload, painel novo) mata o vigia do Stop junto com o processo antigo.
// Pedido de início do ticket (▶ / Dar início / Retomar sem vigia vivo): a extensão grava tickets/.inicio.json e abre
// a conversa; o SessionStart dela vincula a conversa ao ticket e acorda o Claude com a mensagem (a extensão do Claude
// não tem como enviar a mensagem sozinha). Conversa nova: qualquer SessionStart que não seja retomada; conversa
// reaberta: só a do sid pedido.
const os = require('os');
const TICKETS = path.join(os.homedir(), '.claude', 'tickets');
function pedidoDeInicio() {
  const arq = path.join(TICKETS, '.inicio.json');
  let p;
  try { p = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return null; }
  if (Date.now() - p.em > 120000) return null;
  if (p.sid ? p.sid !== dados.session_id : ['resume', 'compact'].includes(dados.source)) return null;
  try { fs.renameSync(arq, `${arq}.${process.pid}`); fs.unlinkSync(`${arq}.${process.pid}`); } catch { return null; } // outro hook pegou antes
  return p;
}
const inicio = dados.hook_event_name === 'SessionStart' && pedidoDeInicio();
if (inicio) {
  const sid = dados.session_id;
  try {
    const arqT = path.join(TICKETS, inicio.chave, '.ticket.json');
    const t = JSON.parse(fs.readFileSync(arqT, 'utf8'));
    if (!t.conversas.includes(sid)) fs.writeFileSync(arqT, JSON.stringify({ ...t, conversas: [...t.conversas, sid] }, null, 2));
    fs.mkdirSync(path.join(TICKETS, '.conversas'), { recursive: true });
    fs.writeFileSync(path.join(TICKETS, '.conversas', sid), inicio.chave);
  } catch {}
  setTimeout(() => { process.stderr.write(inicio.mensagem); process.exit(2); }, 1500); // dá tempo de a sessão ficar pronta
} else if (dados.hook_event_name === 'Stop' || dados.hook_event_name === 'SessionStart') {
  // Spec desta conversa: ticket da Crafting Table (.ticket.json, conversas[]) ou refinamento antigo (meta.json, sid).
  let ref = null;
  const fontes = [['tickets', '.ticket.json', (m) => (m.conversas || []).includes(dados.session_id)],
    ['refinamentos', 'meta.json', (m) => m.tipo === 'spec' && m.sid === dados.session_id]];
  for (const [dir, arq, dela] of fontes) {
    const raiz = path.join(os.homedir(), '.claude', dir);
    let ids = [];
    try { ids = fs.readdirSync(raiz); } catch {}
    for (const id of ids) {
      let m;
      try { m = JSON.parse(fs.readFileSync(path.join(raiz, id, arq), 'utf8')); } catch { continue; }
      if (m.spec?.dir && dela(m)) { ref = { pasta: path.join(raiz, id), m }; break; }
    }
    if (ref) break;
  }
  if (!ref) process.exit(0);
  const arqEstado = path.join(ref.m.spec.repo, ref.m.spec.dir, 'sdd-state.json');
  const ler = () => { try { return JSON.parse(fs.readFileSync(arqEstado, 'utf8')); } catch { return null; } };
  const foto = (e) => e.passos.map((p) => `${p.n}:${p.status}`).join(',');
  // Modo refinamento do ticket (.ticket.json refinamento.estado): aguardando_inicio/pausado seguram o Claude até o
  // humano clicar em Dar início/▶; rodando segue normal (acorda a cada aprovação).
  const modoDe = () => { try { return JSON.parse(fs.readFileSync(path.join(ref.pasta, '.ticket.json'), 'utf8')).refinamento?.estado || null; } catch { return null; } };
  const PARADO = ['aguardando_inicio', 'pausado'];
  let modo0 = modoDe();
  const inicial = ler();
  const revisao = (e) => e?.passos.some((p) => p.status === 'aguardando_revisao');
  if (!inicial || (!revisao(inicial) && !PARADO.includes(modo0))) process.exit(0); // nada esperando o humano
  const antes = foto(inicial);
  // .vigia avisa a extensão que tem alguém esperando a aprovação (reload/fechar o VS Code mata este processo).
  // Um vigia antigo desta spec ainda vivo sai de cena: só um acorda o Claude.
  const arqVigia = path.join(ref.pasta, '.vigia');
  try { const v = JSON.parse(fs.readFileSync(arqVigia, 'utf8')); if (v.pid !== process.pid) process.kill(v.pid); } catch {}
  fs.writeFileSync(arqVigia, JSON.stringify({ pid: process.pid, sid: dados.session_id }));
  process.on('exit', () => { try { if (JSON.parse(fs.readFileSync(arqVigia, 'utf8')).pid === process.pid) fs.unlinkSync(arqVigia); } catch {} });
  // ponytail: log de diagnóstico do vigia; remover quando o fluxo estiver estável.
  const log = (m) => { try { fs.appendFileSync(path.join(ref.pasta, '.vigia.log'), `${new Date().toISOString()} ${process.pid} ${m}\n`); } catch {} };
  log(`inicio modo=${modo0} aguardando=${inicial.passos.filter((p) => p.status === 'aguardando_revisao').map((p) => p.n)}`);
  process.on('exit', (c) => log(`saida codigo=${c}`));
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGPIPE']) process.on(sig, () => { log(`sinal ${sig}`); process.exit(0); });
  const fim = Date.now() + 12 * 3600 * 1000;
  const vigiar = () => {
    const e = ler(), modo = modoDe();
    const mudouSpec = e && foto(e) !== antes;
    let liberou = PARADO.includes(modo0) && !PARADO.includes(modo); // clicou Dar início / ▶ Retomar
    // Retomou com um passo ainda esperando revisão e nada aprovado: não há o que fazer; segue esperando a aprovação.
    if (liberou && !mudouSpec && revisao(e)) { modo0 = modo; liberou = false; log('retomado; esperando aprovacao'); }
    if (e && !PARADO.includes(modo) && (mudouSpec || liberou)) {
      const mudou = e.passos.filter((p) => !antes.split(',').includes(`${p.n}:${p.status}`));
      const linhas = mudou.map((p) => {
        if (p.status === 'aprovado') return `Passo ${p.n} (${p.titulo}) APROVADO na aba Constituição por ${p.aprovadoPor}.`;
        if (p.status === 'em_andamento') return `Passo ${p.n} (${p.titulo}): o humano PEDIU AJUSTE na aba — espere a instrução dele na conversa.`;
        if (p.status === 'desatualizado') return `Passo ${p.n} (${p.titulo}) ficou DESATUALIZADO: ${p.motivoDesatualizado}.`;
        return `Passo ${p.n} (${p.titulo}): ${p.status}.`;
      });
      if (liberou) linhas.unshift(`O humano clicou em ${modo0 === 'aguardando_inicio' ? 'Dar início' : '▶ Retomar'} no ticket.`);
      const ajuste = mudou.some((p) => p.status === 'em_andamento'); // pediu ajuste: espera o humano, não segue
      const segue = ajuste ? '' : (liberou || mudou.some((p) => p.status === 'aprovado')) && e.proximoPasso <= 6
        ? `Siga agora com a skill sdd, sem pedir confirmação: rode ${path.join(__dirname, '..', 'bin', 'sdd-state')} iniciar ${e.proximoPasso} --ref ${ref.pasta} e faça: ${e.proximaAcao}.`
        : e.proximoPasso > 6 ? 'Todos os passos estão aprovados: avise o humano que a spec terminou.' : '';
      process.stderr.write(`[Crafting Table · spec ${e.feature}] ${linhas.join(' ')} ${segue}`.trim());
      process.exit(2);
    }
    if (Date.now() > fim) process.exit(0);
    setTimeout(vigiar, 2000);
  };
  vigiar();
} else if (dados.hook_event_name === 'PostToolUse' && arquivo) {
  // Acha o estado: o próprio diretório da spec, ou todas as specs do repo quando é a constituição.
  const estados = [];
  let d = path.dirname(arquivo);
  if (path.basename(arquivo) === 'constitution.md') {
    try { for (const f of fs.readdirSync(path.join(d, 'specs'))) estados.push(path.join(d, 'specs', f, 'sdd-state.json')); } catch {}
  } else estados.push(path.join(d, 'sdd-state.json'));
  for (const e of estados) {
    try {
      const ref = JSON.parse(fs.readFileSync(e, 'utf8')).refinamento;
      if (ref) execFileSync(path.join(__dirname, '..', 'bin', 'sdd-state'), ['check', '--ref', ref], { stdio: 'ignore', timeout: 10000 });
    } catch {}
  }
}
