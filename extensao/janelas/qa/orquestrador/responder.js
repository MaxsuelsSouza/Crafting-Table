// @ts-check
const fs = require('fs');
const path = require('path');
const { estado, mudar } = require('../estado');
const { RESPOSTAS } = require('./prompt-comum');

// Resposta do humano: vai para .respostas.md (os prompts citam) e libera a retomada.
function responder(dir, resposta) {
  const e = estado(dir),
    r = String(resposta || '').trim();
  if (!e.pausa || !r) return false;
  fs.appendFileSync(path.join(dir, RESPOSTAS), `## ${e.pausa.etapa || 'QA'} · ${e.pausa.pergunta}\n${r}\n\n`);
  mudar(dir, { pausa: null });
  return true;
}

module.exports = { responder };
