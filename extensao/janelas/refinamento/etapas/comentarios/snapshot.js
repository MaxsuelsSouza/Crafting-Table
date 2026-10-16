// @ts-check
// Snapshot da spec e dos cards antes de aplicar uma mudança (ou de analisar): guardar, voltar e conferir se mudou.
const fs = require('fs');
const path = require('path');

const TAREFAS = '.tarefas.json';

// Snapshot do estado antes de aplicar: arquivos da pasta da spec (nível raiz, onde moram spec/plan/tasks/testes/sdd-state)
// e os cards do ticket. aprovados/ e subpastas não entram.
function snapshot(pastaTicket, dirSpec, id) {
  const dest = path.join(pastaTicket, 'snapshots', String(id));
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.join(dest, 'spec'), { recursive: true });
  for (const n of dirSpec && fs.existsSync(dirSpec) ? fs.readdirSync(dirSpec) : []) {
    if (fs.statSync(path.join(dirSpec, n)).isFile()) fs.copyFileSync(path.join(dirSpec, n), path.join(dest, 'spec', n));
  }
  if (fs.existsSync(path.join(pastaTicket, TAREFAS)))
    fs.copyFileSync(path.join(pastaTicket, TAREFAS), path.join(dest, TAREFAS));
  return dest;
}

// Volta ao snapshot: apaga os arquivos que surgiram depois, devolve os que existiam e os cards. false = sem snapshot.
function restaurar(pastaTicket, dirSpec, id) {
  const src = path.join(pastaTicket, 'snapshots', String(id));
  if (!fs.existsSync(path.join(src, 'spec'))) return false;
  const eram = new Set(fs.readdirSync(path.join(src, 'spec')));
  for (const n of fs.existsSync(dirSpec) ? fs.readdirSync(dirSpec) : []) {
    if (fs.statSync(path.join(dirSpec, n)).isFile() && !eram.has(n)) fs.rmSync(path.join(dirSpec, n));
  }
  for (const n of eram) fs.copyFileSync(path.join(src, 'spec', n), path.join(dirSpec, n));
  if (fs.existsSync(path.join(src, TAREFAS))) fs.copyFileSync(path.join(src, TAREFAS), path.join(pastaTicket, TAREFAS));
  else fs.rmSync(path.join(pastaTicket, TAREFAS), { force: true });
  return true;
}

// A análise é só leitura: confere se os arquivos da spec (menos o estado, que o status regrava) e os cards mudaram desde o snapshot.
function alterou(pastaTicket, dirSpec, id) {
  const src = path.join(pastaTicket, 'snapshots', String(id));
  if (!fs.existsSync(path.join(src, 'spec'))) return false;
  const igual = (a, b) => fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
  const estado = 'sdd-state.json';
  const eram = fs.readdirSync(path.join(src, 'spec')).filter((n) => n !== estado);
  const hoje = (fs.existsSync(dirSpec) ? fs.readdirSync(dirSpec) : []).filter(
    (n) => n !== estado && fs.statSync(path.join(dirSpec, n)).isFile()
  );
  return (
    hoje.length !== eram.length ||
    eram.some((n) => !igual(path.join(src, 'spec', n), path.join(dirSpec, n))) ||
    (fs.existsSync(path.join(src, TAREFAS)) && !igual(path.join(src, TAREFAS), path.join(pastaTicket, TAREFAS)))
  );
}

module.exports = { snapshot, restaurar, alterou };
