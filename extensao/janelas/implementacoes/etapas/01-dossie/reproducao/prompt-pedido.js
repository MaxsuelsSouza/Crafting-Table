// @ts-check
// Prompt do rascunho do pedido de mais dados (claude -p, só leitura): um comentário curto para o ticket com as lacunas que impediram
// confirmar o erro. A IA só grava comentario-jira.md; quem publica é a extensão, depois de o dev aprovar (regras/pedir-dados.js).
const path = require('path');
const { REPRODUCAO } = require('../../../../../infra/dossie/arquivos');
const { EVIDENCIAS_MD } = require('./evidencias-ticket');

const RASCUNHO = 'comentario-jira.md';

/** @param {{ dir: string, t: any, gravar: string, motivo: string }} c motivo: o veredito e o porquê */
const promptPedido = (c) =>
  `[segundo plano] [Crafting Table · Implementação ${c.t.chave}] REPRODUÇÃO · PEDIDO DE MAIS DADOS (rascunho; você NÃO publica nada).\n` +
  `A reprodução terminou assim: ${c.motivo}. Leia ${path.join(c.dir, EVIDENCIAS_MD)}, ${path.join(c.dir, REPRODUCAO)} e ${path.join(c.dir, '.contexto-ticket.md')}.\n` +
  `Escreva um comentário curto e educado para quem abriu o ticket pedindo SÓ o que falta para reproduzir (passo a passo, massa de dados, ` +
  `ambiente/versão, print ou vídeo, horário): uma lista objetiva, sem jargão interno, sem citar a extensão nem a IA. ` +
  `Grave com ${c.gravar} ${RASCUNHO} <<'FIM' … FIM (Markdown simples) e termine.`;

module.exports = { promptPedido, RASCUNHO };
