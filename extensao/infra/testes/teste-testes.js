// @ts-check
// node extensao/infra/testes/teste-testes.js
const assert = require('assert');
const t = require('.');

// Parser: plano do QA (sem os campos) → normal/aceite; plano da Implementação lê criticidade e tipo (acento, negrito e lista não importam).
const antigo = t.cenariosDo('#### CT01 – Login\n\n**Dado que** x\n**Então** y\n\n#### CT02 – Outro\n\n**Dado que** z');
assert.deepStrictEqual(
  antigo.map((c) => [c.id, c.criticidade, c.tipo]),
  [
    ['CT01', 'normal', 'aceite'],
    ['CT02', 'normal', 'aceite']
  ]
);
const novo = t.cenariosDo(
  '#### CT01 – Cancelar nota\nCriticidade: crítica\nTipo: regressão\n**Dado que** x\n\n#### CT02 – Limite\n- **Criticidade:** alta\n- **Tipo:** borda\n**Dado que** y\n\n#### CT03 – Estranho\nCriticidade: urgente\nTipo: fumaça\n**Dado que** w'
);
assert.deepStrictEqual(
  novo.map((c) => [c.id, c.criticidade, c.tipo, c.resumo]),
  [
    ['CT01', 'critica', 'regressao', 'Dado que x'],
    ['CT02', 'alta', 'borda', 'Dado que y'],
    ['CT03', 'normal', 'aceite', 'Dado que w']
  ]
);
assert.ok(t.METODO_ENTREGA.startsWith(t.METODO) && /Criticidade: critica\|alta\|normal/.test(t.METODO_ENTREGA));

// Estimativa detalhada: 0,25 + 0,5 + 1×2,5 (UI) + 0,5×2 (API) = 4,25; setup média 1; +10% 0,43; +15% 0,64.
const e = t.estimarDetalhado({
  complexidadeHistoria: 'media',
  cts: [
    { id: 'CT01', complexidade: 'simples' },
    { id: 'CT02', complexidade: 'medio' },
    { id: 'CT03', complexidade: 'complexo', automacao: 'ui' },
    { id: 'CT04', complexidade: 'medio', automacao: 'api' }
  ]
});
assert.deepStrictEqual([e.subtotalCts, e.setup, e.evidencias, e.reteste, e.horas], [4.25, 1, 0.43, 0.64, 6.32]);
assert.ok(e.memoria.includes('CT03 (complexo, automação UI +1,5×): 2,5 h') && e.memoria.endsWith('Total: 6,32 h'));
assert.throws(() => t.estimarDetalhado({ complexidadeHistoria: 'media', cts: [{ id: 'X', complexidade: 'facil' }] }), /X/);
assert.deepStrictEqual(
  [0, 3, 4, 7, 8, 20].map((cas) => {
    const r = t.estimarRapido({ cas });
    return [r.min, r.max];
  }),
  [
    [2, 4],
    [2, 4],
    [4, 8],
    [4, 8],
    [8, 16],
    [8, 16]
  ]
);

// Template: palavras de API → api; o resto (e palavras parecidas: rápido, restante) → ui.
assert.deepStrictEqual(
  ['POST /pedidos (endpoint novo)', 'Integração com o ERP', 'contrato do payload', 'tela de login', 'restante rápido', ''].map(
    t.escolherTemplate
  ),
  ['api', 'api', 'api', 'ui', 'ui', 'ui']
);
assert.ok(t.TEMPLATE_API.includes('Guia Técnico') || t.TEMPLATE_API.includes('Guia de Testes'));
assert.ok(t.TEMPLATE_API.includes('## 7. Troubleshooting') && t.TEMPLATE_API.includes('curl -X POST'));

// Nome da subtarefa e casamento do plugin.
assert.deepStrictEqual(
  ['Story', 'História', 'historia', 'Bug', 'Melhoria', '', undefined].map(t.nomeSubtarefa),
  [t.PLANEJAMENTO, t.PLANEJAMENTO, t.PLANEJAMENTO, t.QUALIDADE, t.QUALIDADE, t.QUALIDADE, t.QUALIDADE]
);
assert.ok(t.casaSubtarefa('[qa]  teste de QUALIDADE ', 'Bug'));
assert.ok(!t.casaSubtarefa('[QA] Teste de Qualidade', 'Story')); // o esperado da história é o de planejamento
assert.ok(t.casaSubtarefa('[QA] Plano e Execução', 'Story') && t.casaSubtarefa('[QA]Planning', 'Bug'));
assert.ok(!t.casaSubtarefa('QA planejamento', 'Story') && !t.casaSubtarefa('[QA] Execução', 'Story'));

console.log('OK infra/testes');
