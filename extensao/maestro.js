const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Maestro do modo refinamento: roda o Claude em segundo plano (`claude -p`, uma execução por etapa) e grava o que ele
// faz em <pasta do ticket>/.ao-vivo.jsonl ({ em, tipo, texto }), que a aba Spec mostra ao vivo.
// Sem AskUserQuestion (não existe em -p): perguntas passam pelo sdd-state e pela aba.
// A sessão fica em .ao-vivo.sid para continuar a mesma conversa (--resume) quando precisar.
const VIVO = '.ao-vivo.jsonl', SID = '.ao-vivo.sid';
const rodando = new Map(); // pasta do ticket -> processo

const claudeBin = () => [path.join(os.homedir(), '.local', 'bin', 'claude'), '/usr/local/bin/claude', '/usr/bin/claude'].find((p) => fs.existsSync(p)) || 'claude';
const curto = (s) => String(s || '').replaceAll(os.homedir(), '~').replace(/\s+/g, ' ').trim();
const nome = (p) => path.basename(String(p || ''));

// Uma ferramenta do Claude em uma linha legível.
function linhaFerramenta(f) {
  const i = f.input || {};
  if (f.name === 'Read') return `lendo ${nome(i.file_path)}`;
  if (f.name === 'Write') return `escrevendo ${nome(i.file_path)}`;
  if (f.name === 'Edit' || f.name === 'MultiEdit') return `editando ${nome(i.file_path)}`;
  if (f.name === 'Glob' || f.name === 'Grep') return `procurando ${curto(i.pattern).slice(0, 80)}`;
  if (f.name === 'Skill') return `skill ${i.skill}`;
  if (f.name === 'Bash') return `$ ${curto(i.command).replace(/\S*\/bin\/sdd-state/g, 'sdd-state').replace(/--ref \S+/g, '').slice(0, 120)}`;
  return f.name;
}

// Evento do stream-json → linhas { tipo, texto } (vazio = ignora).
function linhas(e) {
  if (e.type === 'assistant') return (e.message?.content || []).flatMap((c) => (c.type === 'text' && c.text.trim() ? [{ tipo: 'texto', texto: c.text.trim() }]
    : c.type === 'tool_use' ? [{ tipo: 'ferramenta', texto: linhaFerramenta(c) }] : []));
  if (e.type === 'system' && e.subtype === 'permission_denied') return [{ tipo: 'bloqueio', texto: `bloqueado: ${curto(e.message).slice(0, 160)}` }];
  if (e.type === 'user') return (Array.isArray(e.message?.content) ? e.message.content : [])
    .filter((c) => c.type === 'tool_result' && /hook error/.test(String(c.content))).map((c) => ({ tipo: 'bloqueio', texto: curto(c.content).slice(0, 200) }));
  if (e.type === 'result') return [{ tipo: e.is_error ? 'erro' : 'fim', texto: `${e.is_error ? 'Terminou com erro' : 'Etapa terminada'} · ${Math.round((e.duration_ms || 0) / 1000)} s · US$ ${(e.total_cost_usd || 0).toFixed(2)}` }];
  return [];
}

// Roda uma etapa. ferramentas: lista do --allowedTools. continuar: retoma a última sessão do ticket.
function rodar(dir, { prompt, cwd, ferramentas = [], continuar = false, aoMudar = () => {} }) {
  if (rodando.has(dir)) return false;
  const log = path.join(dir, VIVO);
  const gravar = (l) => fs.appendFileSync(log, JSON.stringify({ em: new Date().toISOString(), ...l }) + '\n');
  let sid = null;
  try { sid = continuar ? fs.readFileSync(path.join(dir, SID), 'utf8').trim() : null; } catch {}
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
    ...(ferramentas.length ? ['--allowedTools', ...ferramentas] : []), ...(sid ? ['--resume', sid] : [])];
  const p = spawn(claudeBin(), args, { cwd: cwd || dir, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  rodando.set(dir, p);
  gravar({ tipo: 'inicio', texto: 'Claude trabalhando…' });
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
  p.on('close', (code) => {
    rodando.delete(dir);
    if (code && !falhou) gravar({ tipo: 'erro', texto: `Claude saiu com código ${code}${erro.trim() ? `: ${curto(erro).slice(0, 200)}` : ''}` });
    aoMudar();
  });
  p.on('error', (e) => { falhou = true; rodando.delete(dir); gravar({ tipo: 'erro', texto: `Não consegui rodar o Claude: ${e.message}` }); aoMudar(); });
  return true;
}

const aoVivo = (dir, n = 40) => {
  try { return fs.readFileSync(path.join(dir, VIVO), 'utf8').trim().split('\n').slice(-n).map((l) => JSON.parse(l)); } catch { return []; }
};

module.exports = { rodar, aoVivo, rodando: (dir) => rodando.has(dir), VIVO, _teste: { linhas, linhaFerramenta } };
