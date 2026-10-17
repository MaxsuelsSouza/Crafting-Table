// @ts-check
// Etapa 2 · Artefatos e input do PO: comentários, anexos (prints, vídeos) e a observação do PO, com a "Massa de dados" e o
// "Comportamento relatado" literais. Grava 2-artefatos.md. Os anexos do ticket precisam estar baixados (portão do orquestrador: leTicket).
const artefatos = require('../../../infra/reproducao/artefatos-prompt');
const { ETAPAS } = require('./index');
const { CONTEXTO } = require('../estado');

const tarefa = (d, o) => artefatos.tarefa(d, o, { contexto: CONTEXTO, arq: ETAPAS[1].arq }); // texto: infra/reproducao/artefatos-prompt.js

// analisaAnexos: no ticket-documento, os anexos extras (.anexos/) entram todos nesta etapa (prompt.js, BLOCO_DOC).
module.exports = { n: 2, leTicket: true, analisaAnexos: true, tarefa };
