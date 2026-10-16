// @ts-check
// O que o ticket traz além do título (sobreTicket) e se o tipo do ticket pede a Reprodução do bug (ehBug).
// Usado por: o dossiê (montar.js), o Refinamento (refinamento/abas/spec/acoes/iniciar.js), os Incidentes (incidentes/entrada.js) e a
// Reprodução da Implementação (implementacoes/etapas/01-dossie/reproducao/, abas/reproducao.js).
const fs = require('fs');
const path = require('path');
const tickets = require('../tickets');
const { html2txt } = require('../texto');

const LIMIAR_TEXTO = 40; // caracteres de descrição+comentários para virar "bruto"

/**
 * O que o ticket traz além do título: descrição + comentários (caracteres) e o documento anexado. Usado pelo dossiê e pela entrada do
 * Refinamento (refinamento/spec.js): ticket que só tem título vira pergunta ao dev, nunca invenção.
 * @param {any} t ticket local (chave, documento?)  @param {any} [j] ticket normalizado (jira.buscar / documento.buscarSync)
 */
function sobreTicket(t, j) {
  const texto = html2txt(j?.descricao) + (j?.comentarios || []).map((c) => html2txt(c.corpo)).join('\n');
  const doc = t.documento?.arquivo ? path.join(tickets.pasta(t.chave), t.documento.arquivo) : null;
  const temDoc = !!doc && fs.existsSync(doc);
  const caracteres = texto.trim().length;
  return { caracteres, doc, temDoc, suficiente: caracteres >= LIMIAR_TEXTO || temDoc };
}

/** Tipos de ticket que pedem confirmação do erro antes de desenvolver (nome do tipo no Jira: Bug, Defeito, Incidente…). */
const tipoTicket = require('../tipo-ticket');
const ehBug = (tipo) => tipoTicket.exigeReproducao(tipoTicket.classificar(tipo));

module.exports = { LIMIAR_TEXTO, sobreTicket, ehBug };
