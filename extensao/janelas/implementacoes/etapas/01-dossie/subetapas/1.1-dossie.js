// @ts-check
// 1.1 · Dossiê (extensão, sem IA): relê o ticket (ou o documento), grava .contexto-ticket.md e monta e grava o dossiê (infra/dossie/).
const fs = require('fs');
const path = require('path');
const dossie = require('../../../../../infra/dossie');
const { CONTEXTO } = require('../../../estado');
const { ambiente } = require('../../../orquestrador/ambiente');

const ehDocumento = (t) => require('../../../../../infra/provedores/documento').ehDocumento(t);

async function prepararDossie(s, t) {
  const dir = s.pastaAba(t.id),
    contexto = require('../../../../../infra/ticket/contexto');
  s.cacheJira = s.cacheJira || {};
  let j = s.cacheJira[t.id];
  if (ehDocumento(t)) {
    await contexto.prepararDocumento(t);
    j = s.cacheJira[t.id] = require('../../../../../infra/provedores/documento').buscarSync({ key: t.chave });
  } else if (!j && s.atualizarJira) {
    await s.atualizarJira(t.id);
    j = s.cacheJira[t.id];
  }
  if (j && !j.erro) contexto.gravarContexto(dir, CONTEXTO, j, t); // no Jira o refinamento não grava a descrição em arquivo: a esteira grava
  const env = ambiente(s, t),
    d = dossie.montar(t, { j: j && !j.erro ? j : undefined, banco: env.banco, repos: env.repos });
  dossie.gravar(dir, d);
  return d;
}
const briefingExiste = (dir) => {
  try {
    return fs.statSync(path.join(dir, dossie.BRIEFING)).size > 0;
  } catch {
    return false;
  }
};

module.exports = { prepararDossie, briefingExiste };
