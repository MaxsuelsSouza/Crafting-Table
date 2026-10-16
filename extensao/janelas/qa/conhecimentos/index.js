// @ts-check
// Conhecimentos do QA: o que a IA já descobriu (tabelas, seletores, telas, caminhos, endpoints, regras, flows prontos) para não
// descobrir de novo a cada ticket. A IA procura e grava pelo qa-state; a aba Conhecimentos mostra, corrige e apaga.
//   arquivo.js   onde mora (~/.claude/tickets/.conhecimentos/) e os tipos
//   guardar.js   gravar (sem duplicar), apagar, contar uso, tela de início
//   buscar.js    busca por termos
//   indice.js    regra e índice para o prompt
const { TIPOS, ARQ, FLOWS, ler } = require('./arquivo');
const { adicionar, apagar, marcarUso, definirTelaInicio } = require('./guardar');
const { buscar, flow } = require('./buscar');
const { regra, indice } = require('./indice');

module.exports = {
  TIPOS,
  ARQ,
  FLOWS,
  ler,
  adicionar,
  apagar,
  marcarUso,
  definirTelaInicio,
  buscar,
  flow,
  regra,
  indice
};
