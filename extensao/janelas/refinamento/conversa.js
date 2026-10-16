// @ts-check
// Pedido da conversa aberta pelo ticket no Refinamento (modulos/conversas.js, pelo registro): onde moram notas, análises e tarefas.
const { NOTAS } = require('../../infra/ticket/pasta-ticket');
const { HANDOFF, TAREFAS } = require('../../infra/ticket/spec');

const pedidoConversa = (s, t) =>
  `Ticket ${t.chave}: ${t.titulo || ''}\n${t.link}\nPasta do ticket: ${s.pasta(t.chave)} (documentos, notas em ${NOTAS}, ` +
  `análise do backend em ${HANDOFF.backend} e do mobile em ${HANDOFF.mobile} (na pasta da spec), tarefas do passo 4 da spec em ${TAREFAS})\n`;

module.exports = { pedidoConversa };
