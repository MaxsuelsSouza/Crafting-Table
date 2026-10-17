// @ts-check
// Nível do resultado de um cenário (CT) pela última execução: passou · passou-com-aviso · falhou · nao-verificavel · bloqueado · pendente.
// Usado pelo veredito do QA (janelas/qa/etapas/07-publicar/veredito.js) e pelo score da etapa de teste da Implementação.

function nivelCenario(c) {
  const ex = c.execucoes?.at(-1);
  if (c.status === 'passou') return ex?.avisos?.length ? 'passou-com-aviso' : 'passou';
  if (c.status === 'falhou') return 'falhou';
  if (['nao-executavel', 'dispensado'].includes(c.status)) return 'nao-verificavel';
  if (c.status === 'bloqueado') return 'bloqueado';
  return 'pendente';
}

module.exports = { nivelCenario };
