// @ts-check
// Prompt da 1.3 Roteiro (claude -p, só planeja): transforma evidencias-ticket.md em cenários registrados por reproducao-fluxo plano,
// cada passo com a fonte. Sem passo a passo nas fontes: pausa perguntando (o veredito fica INCONCLUSIVO até o dev responder).
const path = require('path');
const { EVIDENCIAS_MD } = require('./evidencias-ticket');
const { BIN } = require('./prompt');

/** @param {{ dir: string, t: any, gravar: string, respostas: string }} c respostas: o que o dev já respondeu (.respostas.md) */
const promptRoteiro = (c) =>
  `[segundo plano] [Crafting Table · Implementação ${c.t.chave}] REPRODUÇÃO 1.3 · ROTEIRO (só planejar: não execute nada).\n` +
  `Leia ${path.join(c.dir, EVIDENCIAS_MD)} e ${path.join(c.dir, 'dossie.md')}${c.respostas ? ` e as respostas do dev em ${c.respostas}` : ''}.\n` +
  `Monte os cenários que reproduzem o erro relatado: cada passo/condição relatada vira um cenário, com o resultado esperado e a FONTE ` +
  `(comentário de quem, anexo, quadro do vídeo, resposta do dev). Use a massa de dados literal. Registre com ${BIN} plano <<'FIM' ` +
  `[{"titulo":"...","texto":"o que fazer, com que dados, e o que esperar","fonte":"de onde veio"}] FIM (a pasta vem em IMPLEMENTACAO_DIR).\n` +
  `Sem passo a passo nas fontes (não dá para saber o que fazer para ver o erro): NÃO invente nem registre plano; grave ${c.gravar} .pausa.md <<'FIM' ` +
  `com "motivo: sem-passo-a-passo", "pergunta:" dizendo o que falta saber e termine.\n` +
  `Proibido: alterar código, consultar banco, subir a aplicação, publicar na ferramenta de tickets.`;

module.exports = { promptRoteiro };
