// @ts-check
// Etapa 2 · Cenários: o mapa .cenarios.json (um item por CT do plano aprovado), o ↻ Refazer e a dispensa por decisão do usuário.
//   regras/parser.js  cenariosDo (formato do plano)
//   mapa.js           .cenarios.json e a sincronia com o plano
//   refazer.js        ↻ Refazer de um cenário e o lote (falhou/bloqueado)
//   dispensar.js      Pedir ajuste / Excluir / Não testável
const { cenariosDo } = require('./regras/parser');
const { CENARIOS, cenarios, sincronizar } = require('./mapa');
const {
  refazer,
  PARA_REFAZER,
  loteRefazer,
  iniciarRefazerLote,
  responderRefazer,
  cancelarRefazerLote
} = require('./refazer');
const { dispensar } = require('./dispensar');

module.exports = {
  n: 2,
  cenariosDo,
  CENARIOS,
  cenarios,
  sincronizar,
  refazer,
  PARA_REFAZER,
  loteRefazer,
  iniciarRefazerLote,
  responderRefazer,
  cancelarRefazerLote,
  dispensar
};
