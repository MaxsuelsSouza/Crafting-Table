// @ts-check
const { usar } = require('./servicos');
const { vigiarComentarios } = require('../etapas/comentarios/vigia');

// Liga o vigia: uma olhada 20 s depois de abrir e a cada 5 min; o dispose para o relógio. ctx = ExtensionContext.
const iniciar = (servicos, ctx) => {
  usar(servicos);
  const relogio = setInterval(vigiarComentarios, 5 * 60 * 1000);
  setTimeout(vigiarComentarios, 20000);
  ctx.subscriptions?.push({ dispose: () => clearInterval(relogio) });
};

module.exports = { iniciar };
