// @ts-check
// Aba Spec do refinamento: os passos do SDD, o cartão Agora, a pilha de perguntas (script "Pilha de perguntas" em pagina()),
// o modo refinamento (▶ ⏸ Dar início) e as ações.
//   cabecalho.js     ▶ ⏸ Dar início, pill do modo e controles do Ao vivo
//   corpo.js         corpo da aba (pausa, cartão Agora, caixas de mudança, Ao vivo e os passos)
//   pausa.js         pausas de briefing, tipo e verificação
//   agora.js         cartão Agora e a pilha de perguntas
//   constituicao.js  os 7 passos do SDD
//   abertos.js       passos lidos nesta sessão (libera o Aprovar)
//   anexar.js        anexa o refinamento.md ao ticket quando a spec conclui
//   comum.js         pasta, nome do provedor e cópia aprovada
//   pilha-script.js  script da webview da pilha de perguntas
//   css.js           CSS da aba
//   acoes/           cliques da aba (iniciar, controle, passo, aprovar, responder)
const { emRefino } = require('../../estado');
const { botaoRefino, pillRefino, modo } = require('./cabecalho');
const { STATUS, telaConstituicao } = require('./constituicao');
const { abertos } = require('./abertos');
const { corpoAba } = require('./corpo');
const { scriptPilha } = require('./pilha-script');
const { CSS } = require('./css');
const { acoes } = require('./acoes');

module.exports = {
  STATUS,
  emRefino,
  botaoRefino,
  pillRefino,
  modo,
  abertos,
  telaConstituicao,
  corpoAba,
  scriptPilha,
  CSS,
  acoes
};
