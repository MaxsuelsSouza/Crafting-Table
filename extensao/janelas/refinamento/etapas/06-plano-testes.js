// @ts-check
// Passo 6 · Plano de testes (QA): o método de QA da vaga refinamento.metodoQa, acrescentado ao prompt genérico do passo (orquestrador/seguir.js).
const path = require('path');
const vagas = require('../../../infra/agentes/etapas');

// Passo 6: o método de QA da vaga refinamento.metodoQa (padrão: plugin fcx-qa-test-planning, jira-qa-planner + test-estimation), lido do plugin instalado.
const qaCaminhos = () => {
  const qa = vagas.raiz('refinamento.metodoQa'),
    nome = vagas.rotulo('refinamento.metodoQa');
  if (!qa) return ` Plugin ${nome} não instalado: siga as regras do passo 6 da skill sdd sem ele.`;
  const fim = ' Não use twg nem a ferramenta de tickets: o card [QA] é criado pela extensão.';
  if (!vagas.ehPadrao('refinamento.metodoQa'))
    return ` Método de QA: skill ${nome} (${vagas.pastaSkill('refinamento.metodoQa')}/SKILL.md e as referências dela).${fim}`;
  return (
    ` Método de QA: ${path.join(qa, 'skills', 'jira-qa-planner', 'SKILL.md')} (Passos 3, 6 e 7) e ${path.join(qa, 'skills', 'jira-qa-planner', 'reference', 'test-plan-templates.md')};` +
    ` estimativa: ${path.join(qa, 'skills', 'test-estimation', 'reference', 'modelo-estimativa.md')} (modo detalhado).${fim}`
  );
};

module.exports = { qaCaminhos };
