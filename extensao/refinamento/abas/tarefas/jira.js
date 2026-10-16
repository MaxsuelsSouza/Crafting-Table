// @ts-check
// Subtarefa de QA que já existe no ticket / texto que vai para a descrição da subtarefa no Jira.
const QA_EXISTENTE = /^\[QA\]\s*(Planejamento|Teste de Qualidade)/i; // subtarefa de QA que já existe no ticket
const descricaoJira = (t, c) =>
  [
    c.descricao || '',
    '',
    c.pronto && `Pronto quando: ${c.pronto}`,
    (c.rf || []).length && `Requisitos: ${c.rf.join(', ')}`,
    (c.depende || []).length && `Depende de: ${c.depende.join(', ')}`,
    c.camada && `Camada: ${c.camada}`,
    `Origem: spec ${t.spec?.dir || ''} · tarefa ${c.id} (Crafting Table)`
  ]
    .filter((x) => x !== false && x !== undefined && x !== 0)
    .join('\n');

module.exports = { QA_EXISTENTE, descricaoJira };
