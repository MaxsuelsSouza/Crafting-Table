// @ts-check
// node implementacoes/teste-implementacoes.js — configuração do módulo Implementações e a ligação com tickets e menu
const assert = require('assert');
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? new Proxy({}, { get: () => new Proxy(function () {}, { get: () => () => {}, apply: () => {} }) }) : load(r, ...a));
const impl = require('./implementacoes');
const { filtrar } = require('../componentes/vinculados');
const tickets = require('../infra/tickets');
const menu = require('../componentes/menu-modulos');

const itens = ['Buffer', 'Não iniciado', 'In progress', 'em andamento', 'Pronto para QA'].map((status) => ({ status }));
assert.deepStrictEqual(filtrar(itens, impl.VINCULADOS.status).map((i) => i.status), ['Buffer', 'Não iniciado', 'In progress', 'em andamento']);
assert.strictEqual(tickets.pasta('WMS-1', impl.ID).endsWith('WMS-1/impl'), true);
assert.deepStrictEqual(tickets.listasDe({ implementacao: true }), [impl.ID]);
assert.strictEqual(menu.nome(impl.ID), impl.ROTULO);
console.log('ok');
