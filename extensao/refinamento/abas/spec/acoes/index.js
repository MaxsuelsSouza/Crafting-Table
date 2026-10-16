// @ts-check
// Ações da aba Spec (handlers da webview), na ordem de sempre. Contrato: acoes(servicos), ver teste-acoes.js.
//   iniciar.js    ▶ refinar
//   pausas.js     respostas às pausas do início (briefing e tipo do ticket)
//   controle.js   Dar início, Pausar e Retomar
//   passo.js      cliques do cartão do passo e Pedir ajuste
//   aprovar.js    botão Aprovar do passo
//   responder.js  resposta às perguntas do Claude
const iniciar = require('./iniciar');
const pausas = require('./pausas');
const controle = require('./controle');
const passo = require('./passo');
const aprovar = require('./aprovar');
const responder = require('./responder');

const acoes = (s) => ({
  ...iniciar.acoes(s),
  ...pausas.acoes(s),
  ...controle.acoes(s),
  ...passo.acoes(s),
  ...aprovar.acoes(s),
  ...responder.acoes(s)
});

module.exports = { acoes };
