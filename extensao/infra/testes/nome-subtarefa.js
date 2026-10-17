// @ts-check
// Nome da subtarefa de QA pelo tipo do pai e qual subtarefa existente é a de planejamento (SKILL do jira-qa-planner, Passos 3 e 4).
// Usado pelo QA (janelas/qa/etapas/01-planejamento: regras/subtarefa.js e subetapas/1.3-aprovar.js).

const PLANEJAMENTO = '[QA] Planejamento dos Casos de Testes',
  QUALIDADE = '[QA] Teste de Qualidade';
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const ehHistoria = (tipo) => /^(stor(y|ies)|hist[óo]ria)$/.test(norm(tipo));
/** Summary da subtarefa a criar: história → planejamento; qualquer outro tipo (melhoria, bug, incidente…) → teste de qualidade. */
const nomeSubtarefa = (tipoPai) => (ehHistoria(tipoPai) ? PLANEJAMENTO : QUALIDADE);
/** Casamento do plugin: summary igual ao esperado OU começa com [QA] e tem planejamento|planning|plano (sem caixa). */
const casaSubtarefa = (resumo, tipoPai) => {
  const r = norm(resumo);
  return r === norm(nomeSubtarefa(tipoPai)) || (/^\[qa\]/.test(r) && /planejamento|planning|plano/.test(r));
};

module.exports = { PLANEJAMENTO, QUALIDADE, nomeSubtarefa, casaSubtarefa };
