// @ts-check
// Resposta do usuário à pausa: a etapa dona do motivo resolve (responder); senão vai para .respostas.md e a mesma etapa roda de novo.
const fs = require('fs');
const path = require('path');
const { ETAPAS, logica } = require('../etapas');
const { estado, mudar, RESPOSTAS, OPCOES } = require('../estado');

const responder = (s, t, resposta) => {
  const { seguir } = require('./seguir'),
    { avancarEtapa } = require('./avancar');
  const dir = s.pastaAba(t.id),
    e = estado(dir);
  if (!e.pausa || !String(resposta || '').trim()) return;
  for (const x of ETAPAS) {
    const r = logica(x.n).responder?.({ s, t, dir, e, resposta });
    if (r === undefined) continue;
    if (r === 'seguir') return seguir(s, t);
    if (r === 'avancar') return avancarEtapa(s, t, e.etapa);
    if (r === 'render') return s.render();
    return; // null: resposta que não resolve a pausa
  }
  if (e.pausa.motivo === 'ticket') {
    if (resposta !== OPCOES.TENTAR) return;
    mudar(dir, { pausa: null });
    s.cacheJira[t.id] = undefined;
    return seguir(s, t);
  }
  fs.appendFileSync(
    path.join(dir, RESPOSTAS),
    `## Etapa ${e.etapa} · ${e.pausa.pergunta}\n${String(resposta).trim()}\n\n`
  );
  mudar(dir, { pausa: null });
  return seguir(s, t);
};

module.exports = { responder };
