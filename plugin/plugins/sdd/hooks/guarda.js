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
  const cmd = String(entrada.command || '');
  if (/sdd-state\b[^|;&]*\baprovar\b/.test(cmd)) negar('Aprovar um passo é exclusivo do humano, pela aba Constituição da Crafting Table. Diga que o passo está pronto para revisão.');
  if (/sdd-state\.json/.test(cmd) && /(>|\btee\b|sed\s+-i|\bmv\b|\bcp\b|python|node\s+-e|perl|\bjq\b.*>)/.test(cmd)) negar('Não altere sdd-state.json diretamente; use o sdd-state.');
  process.exit(0);
}

// Stop (asyncRewake): roda em segundo plano depois que o Claude termina a resposta. Se a spec desta conversa tem um
// passo aguardando revisão, vigia o estado; quando o humano aprova (ou pede ajuste) na aba, sai com código 2 e a
// mensagem no stderr — o Claude Code acorda o Claude nesta mesma conversa com ela.
// SessionStart também: reabrir a conversa (reload, painel novo) mata o vigia do Stop junto com o processo antigo.
if (dados.hook_event_name === 'Stop' || dados.hook_event_name === 'SessionStart') {
  const os = require('os');
  const raiz = path.join(os.homedir(), '.claude', 'refinamentos');
  let ref = null;
  try {
    for (const id of fs.readdirSync(raiz)) {
      const m = JSON.parse(fs.readFileSync(path.join(raiz, id, 'meta.json'), 'utf8'));
      if (m.tipo === 'spec' && m.sid === dados.session_id && m.spec?.dir) { ref = { pasta: path.join(raiz, id), m }; break; }
    }
  } catch {}
  if (!ref) process.exit(0);
  const arqEstado = path.join(ref.m.spec.repo, ref.m.spec.dir, 'sdd-state.json');
  const ler = () => { try { return JSON.parse(fs.readFileSync(arqEstado, 'utf8')); } catch { return null; } };
  const foto = (e) => e.passos.map((p) => `${p.n}:${p.status}`).join(',');
  const inicial = ler();
  if (!inicial || !inicial.passos.some((p) => p.status === 'aguardando_revisao')) process.exit(0); // nada esperando o humano
  const antes = foto(inicial);
  // .vigia avisa a extensão que tem alguém esperando a aprovação (reload/fechar o VS Code mata este processo).
  // Um vigia antigo desta spec ainda vivo sai de cena: só um acorda o Claude.
  const arqVigia = path.join(ref.pasta, '.vigia');
  try { const v = JSON.parse(fs.readFileSync(arqVigia, 'utf8')); if (v.pid !== process.pid) process.kill(v.pid); } catch {}
  fs.writeFileSync(arqVigia, JSON.stringify({ pid: process.pid, sid: dados.session_id }));
  process.on('exit', () => { try { if (JSON.parse(fs.readFileSync(arqVigia, 'utf8')).pid === process.pid) fs.unlinkSync(arqVigia); } catch {} });
  // ponytail: log de diagnóstico do vigia; remover quando o fluxo estiver estável.
  const log = (m) => { try { fs.appendFileSync(path.join(ref.pasta, '.vigia.log'), `${new Date().toISOString()} ${process.pid} ${m}\n`); } catch {} };
  log(`inicio aguardando=${inicial.passos.filter((p) => p.status === 'aguardando_revisao').map((p) => p.n)}`);
  process.on('exit', (c) => log(`saida codigo=${c}`));
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGPIPE']) process.on(sig, () => { log(`sinal ${sig}`); process.exit(0); });
  const fim = Date.now() + 12 * 3600 * 1000;
  const vigiar = () => {
    const e = ler();
    if (e && foto(e) !== antes) {
      const mudou = e.passos.filter((p) => !antes.split(',').includes(`${p.n}:${p.status}`));
      const linhas = mudou.map((p) => {
        if (p.status === 'aprovado') return `Passo ${p.n} (${p.titulo}) APROVADO na aba Constituição por ${p.aprovadoPor}.`;
        if (p.status === 'em_andamento') return `Passo ${p.n} (${p.titulo}): o humano PEDIU AJUSTE na aba — espere a instrução dele na conversa.`;
        if (p.status === 'desatualizado') return `Passo ${p.n} (${p.titulo}) ficou DESATUALIZADO: ${p.motivoDesatualizado}.`;
        return `Passo ${p.n} (${p.titulo}): ${p.status}.`;
      });
      const segue = mudou.some((p) => p.status === 'aprovado') && e.proximoPasso <= 6
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
