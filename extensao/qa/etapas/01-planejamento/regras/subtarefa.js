// @ts-check
// Qual subtarefa do provedor é a de QA e se a descrição já tem plano (convenção "[QA] Planejamento dos Casos de Testes").

// "QA", "qa", "[QA]", "Q.A." como palavra (não pega "quadro", "aqa").
const ehQA = (resumo) => /(^|[^a-z0-9])q\.?a([^a-z0-9]|$)/i.test(resumo || '');
const NOMES = /^\[qa\]\s*(planejamento dos casos de testes|teste de qualidade)\s*$/i;
const PLANO = /planej|plano|planning|casos? de testes?|cen[aá]rio/i;
// Prioridade: nome da skill > QA de planejamento > qualquer QA.
const nota = (s) => (NOMES.test(s.resumo.trim()) ? 0 : PLANO.test(s.resumo) ? 1 : 2);
const candidatas = (subs) => subs.filter((s) => ehQA(s.resumo)).sort((a, b) => nota(a) - nota(b));
// Tem plano: cenários (CT01, CT-01) ou Gherkin. A descrição padrão de subtarefa recém-criada não conta.
const temPlano = (texto) => /\bCT-?\d+|\bdado que\b/i.test(texto || '');
const TITULO_SUBTAREFA = '[QA] Planejamento dos Casos de Testes'; // convenção que procurar() reconhece

module.exports = { ehQA, NOMES, PLANO, nota, candidatas, temPlano, TITULO_SUBTAREFA };
