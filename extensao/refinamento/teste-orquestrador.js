// @ts-check
// node refinamento/teste-orquestrador.js — orquestrador do refinamento: carrega com o mock do vscode, expõe a interface e
// avisarImpactos marca como erro o que o Claude deixou sem registro. (etapa/seguir/vigia chamam o claude e o Jira: não testados aqui.)
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-home-'));
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? new Proxy({}, { get: () => new Proxy(function () {}, { get: () => () => {}, apply: () => Promise.resolve() }) }) : load(r, ...a));
const orq = require('./orquestrador');
const tickets = require('../tickets');
const { NIVEL } = require('./mudancas');

for (const n of ['iniciar', 'etapa', 'seguir', 'filaTarefas', 'vigiarComentarios', 'sdd', 'estadoDe', 'reposDe', 'avisarImpactos']) assert.strictEqual(typeof orq[n], 'function', n);
assert.deepStrictEqual(orq.respondidas, []);
assert.ok(NIVEL.alto && NIVEL.nenhum);

const chave = 'ORQ-1', dir = tickets.pasta(chave), arq = path.join(dir, '.impactos.json');
fs.mkdirSync(dir, { recursive: true });
const imp = (id, status, extra = {}) => ({ id, autor: 'Fulano', data: '2026-10-08T10:00:00Z', link: 'https://j/' + id, texto: 'x', status, ...extra });
fs.writeFileSync(arq, JSON.stringify([imp('1', 'triando'), imp('2', 'analisando'), imp('3', 'aplicando'), imp('4', 'analisado', { nivel: 'nenhum' }), imp('5', 'na_fila')]));
orq.iniciar({ render() {}, gravar: (id, nome, dado) => fs.writeFileSync(path.join(tickets.pasta(id), nome), JSON.stringify(dado)), abrirAba() {}, secrets: {} }, { subscriptions: [] });
orq.avisarImpactos({ chave });
const l = JSON.parse(fs.readFileSync(arq, 'utf8'));
assert.deepStrictEqual(l.map((i) => i.status), ['erro', 'erro', 'erro', 'analisado', 'na_fila']);
assert.match(l[0].resumo, /triagem/); assert.match(l[1].resumo, /análise/); assert.match(l[2].resumo, /aplicação/);
assert.strictEqual(l[3].avisado, true, 'impacto resolvido é marcado como avisado (nível "nenhum" não notifica)');
console.log('orquestrador ok');
process.exit(0); // o vigia deixa um setTimeout de 20 s
