// @ts-check
// node janelas/implementacoes/testes/teste-score.js — regras puras da etapa 7 (Teste na aplicação): score 0-5 (menor teto vence),
// mínimo por atividade e a tabela CA × CT do plano.
const assert = require('assert');
const { score } = require('../etapas/07-teste/regras/score');
const { minimo } = require('../etapas/07-teste/regras/minimo');
const { casDo, cobertura } = require('../etapas/07-teste/regras/cobertura');

const ct = (id, o = {}) => ({
  id,
  criticidade: 'normal',
  tipo: 'aceite',
  nivel: 'passou',
  print: true,
  video: true,
  ...o
});
const TUDO = { total: 2, cobertos: 2, inferidoSemCt: false };
const nota = (cts, cob = TUDO, subiu = true) => score({ subiu, cts, cobertura: cob }).score;
const ok = [ct('CT01', { criticidade: 'critica' }), ct('CT02', { tipo: 'regressao' }), ct('CT03')];

// ── Score: uma linha por teto da rubrica ──
assert.strictEqual(nota(ok), 5); // tudo passou com print e vídeo, 100% dos CAs
assert.strictEqual(nota(ok, TUDO, false), 0); // a aplicação não subiu
assert.strictEqual(nota(ok.map((c) => ({ ...c, nivel: 'bloqueado' }))), 0); // nenhum CT rodou
assert.strictEqual(nota([{ ...ok[0], nivel: 'falhou' }, ok[1], ok[2]]), 1); // crítico falhou
assert.strictEqual(nota([{ ...ok[0], nivel: 'bloqueado' }, ok[1], ok[2], ct('CT04'), ct('CT05')]), 2); // crítico bloqueado
assert.strictEqual(nota([ok[0], { ...ok[1], nivel: 'falhou' }, ok[2]]), 2); // regressão falhou
assert.strictEqual(nota(ok, { total: 10, cobertos: 6, inferidoSemCt: false }), 2); // cobertura 60%
assert.strictEqual(nota([ok[0], ok[1], { ...ok[2], nivel: 'falhou' }]), 3); // CT normal falhou
assert.strictEqual(nota([ok[0], ok[1], { ...ok[2], nivel: 'falhou', criticidade: 'alta' }]), 3); // alta também é "não crítico"
assert.strictEqual(nota([ok[0], ok[1], { ...ok[2], sinais: { console: 2, rede: 0 } }]), 3); // erro novo de console
assert.strictEqual(nota(ok, { total: 10, cobertos: 7, inferidoSemCt: false }), 4); // cobertura 70%
assert.strictEqual(nota(ok, { total: 10, cobertos: 9, inferidoSemCt: false }), 4); // cobertura 90%
assert.strictEqual(nota([...ok, ct('CT04', { nivel: 'bloqueado' })]), 4); // 25% bloqueados
assert.strictEqual(nota([...ok, ct('CT04'), ct('CT05'), ct('CT06', { nivel: 'bloqueado' })]), 5); // 1 de 6 (16%) não pesa
assert.strictEqual(nota([ok[0], ok[1], { ...ok[2], nivel: 'passou-com-aviso' }]), 4); // aviso
assert.strictEqual(nota(ok, { ...TUDO, inferidoSemCt: true }), 4); // CA inferido sem CT
assert.strictEqual(nota([ok[0], ok[1], { ...ok[2], video: false }]), 4); // passou sem vídeo
assert.strictEqual(nota([ok[0], ok[1], { ...ok[2], print: false }]), 4); // passou sem print
// menor teto vence e os tetos vêm em ordem
const r = score({
  subiu: true,
  cts: [
    { ...ok[0], nivel: 'falhou' },
    { ...ok[2], video: false }
  ],
  cobertura: TUDO
});
assert.deepStrictEqual(
  r.tetos.map((x) => x.nota),
  [1, 4]
);
assert.ok(r.tetos[0].motivo.includes('CT01'));

// ── Mínimo por atividade ──
const m = (o) => minimo(o).minimo;
assert.strictEqual(m({ categoria: 'incidente' }), 4);
assert.strictEqual(m({ categoria: 'bug' }), 4);
assert.strictEqual(m({ categoria: 'bug-experimental' }), 3);
assert.strictEqual(m({ categoria: 'outro' }), 3);
assert.strictEqual(m({ categoria: null }), 3); // não reconhecido: a base de "outro"
assert.strictEqual(m({ categoria: 'outro', prioridade: 'High' }), 4);
assert.strictEqual(m({ categoria: 'outro', prioridade: 'Altíssima' }), 4);
assert.strictEqual(m({ categoria: 'outro', prioridade: 'Medium' }), 3);
assert.strictEqual(m({ categoria: 'outro', prioridade: 'Baixa' }), 2);
assert.strictEqual(m({ categoria: 'bug-experimental', prioridade: 'Lowest' }), 2); // nunca abaixo de 2
assert.strictEqual(m({ categoria: 'incidente', prioridade: 'Highest', caminhos: ['src/Auth/Login.cs'] }), 5); // 4+1+1 → teto 5
assert.strictEqual(m({ categoria: 'outro', caminhos: ['db/V12__ajuste.sql'] }), 4); // .sql é sensível
for (const c of [
  'x/permissao.ts',
  'Pagamento.cs',
  'financeiro/a.js',
  'fiscal/b.js',
  'NotaFiscal.cs',
  'estoque/c.ts',
  'migrations/1.js'
])
  assert.strictEqual(m({ categoria: 'outro', caminhos: [c] }), 4, c);
assert.strictEqual(m({ categoria: 'outro', caminhos: ['src/tela/Lista.tsx'] }), 3);
// diff grande: mínimo igual, mas exige CT de regressão
const g = minimo({ categoria: 'outro', caminhos: Array.from({ length: 16 }, (_, i) => `a${i}.js`) });
assert.deepStrictEqual([g.minimo, g.exigeRegressao], [3, true]);
assert.strictEqual(minimo({ categoria: 'outro', caminhos: ['a.js'], linhas: 401 }).exigeRegressao, true);
assert.strictEqual(minimo({ categoria: 'outro', caminhos: ['a.js'], linhas: 400 }).exigeRegressao, false);

// ── Tabela CA × CT ──
const md = `## Cenários de Teste
#### CT01 – A
#### CT02 – B
## Critérios de aceite cobertos
| Critério | Cenários | Fonte | Confiança |
|---|---|---|---|
| CA1 cancelar | CT01, CT-2 | ticket | aprovado |
| CA2 log | sem CT (falta massa) | spec | inferido |
## Riscos e pré-requisitos
| não | é | tabela | de CA |`;
const cas = casDo(md);
assert.deepStrictEqual(
  cas?.map((x) => x.cts),
  [['CT01', 'CT02'], []]
);
assert.strictEqual(casDo('## Cenários\n#### CT01 – x'), null);
assert.deepStrictEqual(
  cobertura(cas, [
    { id: 'CT01', nivel: 'bloqueado' },
    { id: 'CT02', nivel: 'falhou' }
  ]),
  { total: 2, cobertos: 1, inferidoSemCt: true }
);

console.log('teste-score: ok');
