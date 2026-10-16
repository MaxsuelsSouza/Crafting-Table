// @ts-check
// Dúvidas do refinamento: aba Dúvidas, envio ao ticket (com menções do Jira), resposta manual e sugestão vinda de comentário.
//   mencoes.js  QuickPick das menções do comentário
//   fechar.js   fecha a dúvida e, se era a última, a spec segue
//   acoes.js    cliques da aba (enviar, responder, confirmar, rejeitar)
//   tela.js     corpo da aba
//   css.js      regras exclusivas das dúvidas
const { acoes } = require('./acoes');
const { corpo } = require('./tela');
const { CSS } = require('./css');

module.exports = { acoes, corpo, CSS };
