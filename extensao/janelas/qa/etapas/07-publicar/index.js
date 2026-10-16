// @ts-check
// Etapa 7 · Publicar: com a execução concluída (nada pendente nem bloqueado), a IA escreve o relatório, você confere o nível
// (aprovado, aprovado com ressalvas, reprovado) e publica, com qualquer nível (ação qaPublicar em abas/acoes/publicar.js).
//   veredito.js   nível do card e de cada cenário, por regra
//   relatorio/    dados (sem IA), prompt e a sessão que escreve o texto
const { veredito } = require('./veredito');

// Publicar com a execução concluída e ao menos um cenário com resultado; o nível vai no relatório (o portão é a sua aprovação).
function podePublicar(lista) {
  const v = veredito(lista);
  return v.publicavel && v.cenarios.some((c) => c.nivel !== 'nao-verificavel');
}

module.exports = { n: 7, podePublicar, veredito, relatorio: () => require('./relatorio') };
