// @ts-check
// Qual subtarefa do provedor é a de QA e se a descrição já tem plano. Nome e casamento do plugin em infra/testes/nome-subtarefa.js:
// história → "[QA] Planejamento dos Casos de Testes", outros tipos → "[QA] Teste de Qualidade"; casa o nome esperado ou [QA] + planejamento.
const { nomeSubtarefa, casaSubtarefa } = require('../../../../../infra/testes/nome-subtarefa');

// "QA", "qa", "[QA]", "Q.A." como palavra (não pega "quadro", "aqa"): fontes de plano para ler (o Claude interpreta).
const ehQA = (resumo) => /(^|[^a-z0-9])q\.?a([^a-z0-9]|$)/i.test(resumo || '');
const PLANO = /planej|plano|planning|casos? de testes?|cen[aá]rio/i;
// Prioridade na leitura: casamento do plugin > QA de planejamento > qualquer QA. tipo: tipo do ticket pai.
const nota = (s, tipo) => (casaSubtarefa(s.resumo, tipo) ? 0 : PLANO.test(s.resumo) ? 1 : 2);
const candidatas = (subs, tipo) => subs.filter((s) => ehQA(s.resumo)).sort((a, b) => nota(a, tipo) - nota(b, tipo));
// Onde publicar: só as que casam pelo critério do plugin (as outras de QA são lidas, nunca escritas).
const alvosPublicacao = (subs, tipo) => subs.filter((s) => casaSubtarefa(s.resumo, tipo));
// Tem plano: cenários (CT01, CT-01) ou Gherkin. A descrição padrão de subtarefa recém-criada não conta.
const temPlano = (texto) => /\bCT-?\d+|\bdado que\b/i.test(texto || '');

module.exports = { ehQA, PLANO, nota, candidatas, alvosPublicacao, temPlano, nomeSubtarefa };
