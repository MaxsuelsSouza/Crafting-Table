// @ts-check
// Teams: abre a janela do Teams (janela.js) e encaminha os avisos do 🔔 como Adaptive Cards (card.js monta, envio.js envia).
// Lê as linhas novas de <pasta do ticket>/.notificacoes.jsonl e faz POST de um Adaptive Card na URL guardada no Cofre
// (TEAMS_WEBHOOK). A URL é segredo: nunca entra em log, mensagem de erro nem notificação.
//
// Um arquivo por regra:
//   janela.js   abre (ou traz para frente) a janela do Teams
//   card.js     o que vai para o Teams: tipos, níveis e o card de cada grupo de linhas
//   envio.js    POST na URL do Cofre, falhas seguidas, o ciclo de 30 s e o card de teste
const janela = require('./janela');
const envio = require('./envio');
const { card, mensagens } = require('./card');

exports.abrir = janela.abrir;
exports.encaminhar = envio.encaminhar;
exports.testar = envio.testar;
exports._teste = { card, mensagens, ciclo: envio.ciclo, enviar: envio.enviar, reset: envio.reset };
