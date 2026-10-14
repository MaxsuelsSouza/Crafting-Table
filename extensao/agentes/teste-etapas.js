// @ts-check
// node agentes/teste-etapas.js
// Vagas de plugin por etapa: sem troca valem os padrões (mesmos caminhos de antes); toda etapa aponta para uma vaga que existe.
const assert = require('assert');
const os = require('os');
const path = require('path');
const etapas = require('./etapas');

for (const m of etapas.MODULOS) for (const e of m.etapas) for (const x of e.subetapas || [e]) assert.ok(x.vaga === null || etapas.VAGAS[x.vaga], `${m.id}: vaga ${x.vaga}`);
for (const [v, d] of Object.entries(etapas.VAGAS)) assert.ok(d.contrato && d.como && etapas.usos(v).length, v);
assert.strictEqual(etapas.raiz('refinamento.mapa'), path.join(__dirname, '..', 'plugins', 'mapa'));
assert.deepStrictEqual(etapas.pluginDirs('refinamento.foco'), ['--plugin-dir', path.join(__dirname, '..', 'plugins', 'foco')]);
assert.deepStrictEqual(etapas.pluginDirs('refinamento.sdd'), []); // instalado no agente: carrega sozinho
assert.strictEqual(etapas.pastaSkill('qa.execucao'), path.join(os.homedir(), '.claude', 'skills', 'testes-funcionais'));
assert.strictEqual(etapas.rotulo('refinamento.mapa'), 'mapa:mapear');
assert.strictEqual(etapas.aviso('qa.execucao'), ''); // padrão: o prompt não muda
assert.deepStrictEqual(etapas.usos('refinamento.mapa'), ['Refinamento · Etapa 4.1 Mapeamento do código']);
assert.ok(etapas.usos('refinamento.sdd').includes('Refinamento · Etapa 4.2 Plano técnico') && etapas.usos('refinamento.sdd').includes('Refinamento · Etapa 3. Clarificação'));
const ref = etapas.MODULOS[0], mc = etapas.marcas(ref);
assert.deepStrictEqual(mc[3].subs.map((x) => [x.marca, x.nome, x.vaga]), [['4.1', 'Mapeamento do código', 'refinamento.mapa'], ['4.2', 'Plano técnico', 'refinamento.sdd']]);
assert.strictEqual(etapas.titulos(ref)[3], 'Etapa 4. Plano técnico'); assert.strictEqual(mc[4].marca, 'Etapa 5'); // a numeração das seguintes não muda
assert.deepStrictEqual(etapas.usos('refinamento.foco'), ['Refinamento · Todas as etapas · Regras de escrita']); // sem número
assert.strictEqual(etapas.titulos(etapas.MODULOS.find((m) => m.id === 'qa'))[0], 'Etapa 1. Planejamento');
console.log('ok etapas');
