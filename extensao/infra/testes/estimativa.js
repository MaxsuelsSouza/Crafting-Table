// @ts-check
// Estimativa de esforço de teste (modelo do plugin fcx-qa-test-planning, skills/test-estimation/reference/modelo-estimativa.md), em código puro:
// a IA só classifica a complexidade (de cada CT e da história); a conta e a memória de cálculo saem daqui.
// Usado pelo QA e pela Implementação (quem quiser estimar um plano).
//
// Interpretação da automação: o plugin diz "some ao esforço-base do CT" um acréscimo de 1,5× (UI) ou 1,0× (API). Aqui isso é
// CT = base + base × fator, ou seja, UI = 2,5 × base e API = 2 × base; sem automação, CT = base.

const BASE = { simples: 0.25, medio: 0.5, complexo: 1 };
const AUTOMACAO = { ui: 1.5, api: 1 };
const SETUP = { baixa: 0.5, media: 1, alta: 2 };
const EVIDENCIAS = 0.1,
  RETESTE = 0.15;
// Modo rápido: faixa pela quantidade de critérios de aceite.
const FAIXAS = [
  { ate: 3, complexidade: 'baixa', min: 2, max: 4 },
  { ate: 7, complexidade: 'media', min: 4, max: 8 },
  { ate: Infinity, complexidade: 'alta', min: 8, max: 16 }
];

const r2 = (n) => Math.round(n * 100) / 100;
const h = (n) => `${String(r2(n)).replace('.', ',')} h`;

/**
 * Modo detalhado: a partir dos CTs do plano.
 * @param {{ cts: { id: string, complexidade: 'simples'|'medio'|'complexo', automacao?: 'ui'|'api'|null }[], complexidadeHistoria: 'baixa'|'media'|'alta' }} o
 * @returns {{ horas: number, subtotalCts: number, setup: number, evidencias: number, reteste: number, memoria: string }}
 */
function estimarDetalhado({ cts, complexidadeHistoria }) {
  if (!(complexidadeHistoria in SETUP)) throw new Error(`complexidade da história inválida: ${complexidadeHistoria}`);
  const linhas = cts.map((c) => {
    if (!(c.complexidade in BASE)) throw new Error(`${c.id}: complexidade inválida: ${c.complexidade}`);
    const base = BASE[c.complexidade],
      fator = c.automacao ? AUTOMACAO[c.automacao] : 0;
    if (fator === undefined) throw new Error(`${c.id}: automação inválida: ${c.automacao}`);
    const total = base + base * fator;
    return { id: c.id, total, txt: `${c.id} (${c.complexidade}${c.automacao ? `, automação ${c.automacao.toUpperCase()} +${String(fator).replace(".", ",")}×` : ''}): ${h(total)}` };
  });
  const subtotalCts = r2(linhas.reduce((s, l) => s + l.total, 0)),
    setup = SETUP[complexidadeHistoria],
    evidencias = r2(subtotalCts * EVIDENCIAS),
    reteste = r2(subtotalCts * RETESTE),
    horas = r2(subtotalCts + setup + evidencias + reteste);
  const memoria = [
    ...linhas.map((l) => `- ${l.txt}`),
    `Subtotal dos CTs: ${h(subtotalCts)}`,
    `Setup de massa/ambiente (história ${complexidadeHistoria}): ${h(setup)}`,
    `Evidências (+10% do subtotal): ${h(evidencias)}`,
    `Reteste (+15% do subtotal): ${h(reteste)}`,
    `Total: ${h(horas)}`
  ].join('\n');
  return { horas, subtotalCts, setup, evidencias, reteste, memoria };
}

/**
 * Modo rápido: faixa pela quantidade de critérios de aceite (sem plano ainda).
 * @param {{ cas: number }} o
 * @returns {{ complexidade: string, min: number, max: number, memoria: string }}
 */
function estimarRapido({ cas }) {
  const f = FAIXAS.find((x) => cas <= x.ate);
  return {
    complexidade: f.complexidade,
    min: f.min,
    max: f.max,
    memoria: `${cas} critério(s) de aceite → história ${f.complexidade}: ${f.min} a ${f.max} h`
  };
}

module.exports = { BASE, AUTOMACAO, SETUP, EVIDENCIAS, RETESTE, FAIXAS, estimarDetalhado, estimarRapido };
