// @ts-check
// O plano de CTs serve para a etapa 7? (PURO) Precisa de CTs, de ao menos um crítico, da tabela CA × CT e, com diff grande, de um CT de
// regressão. Usado pela 7.1 (com erro: pausa) e para aceitar o plano do QA sem IA.
const { cenariosDo } = require('../../../../../infra/testes');
const { casDo } = require('./cobertura');

/** CTs do plano (os exploratórios ficam de fora: a esteira não executa exploração livre). */
const ctsDo = (md) => cenariosDo(md || '').filter((c) => c.id.startsWith('CT'));
/** @returns {string[]} o que falta (vazio = serve) */
function errosDoPlano(md, { exigeRegressao = false } = {}) {
  const cts = ctsDo(md),
    erros = [];
  if (!cts.length) return ['nenhum CT (#### CT01 – …)'];
  if (!cts.some((c) => c.criticidade === 'critica')) erros.push('nenhum CT com "Criticidade: critica"');
  if (!casDo(md)?.length) erros.push('sem a tabela "## Critérios de aceite cobertos" (CA × CT)');
  if (exigeRegressao && !cts.some((c) => c.tipo === 'regressao'))
    erros.push('diff grande sem nenhum CT com "Tipo: regressao"');
  return erros;
}

module.exports = { ctsDo, errosDoPlano };
