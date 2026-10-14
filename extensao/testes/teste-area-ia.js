// @ts-check
// node testes/teste-area-ia.js
// A IA em segundo plano escreve fora de ~/.claude (o Claude Code nega escrita lá) e os prompts apontam para essa área.
const assert = require('assert');
const os = require('os');
const path = require('path');
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? { workspace: { getConfiguration: () => ({ get: () => undefined }) } } : load(r, ...a));
const { areaIA, RAIZ } = require('../infra/area-ia');
const qa = require('../qa/qa');

const claude = path.join(os.homedir(), '.claude');
const dir = path.join(claude, 'tickets', 'WMS-123', 'qa');
const rasc = areaIA(dir);
assert.ok(!rasc.startsWith(claude + path.sep) && rasc.startsWith(RAIZ), rasc);
assert.notStrictEqual(areaIA(path.join(claude, 'tickets', 'WMS-124', 'qa')), rasc); // um por pasta
assert.ok(qa.promptCriar(dir, rasc).includes(path.join(rasc, qa.PLANO_LOCAL)));
assert.ok(!qa.promptCriar(dir, rasc).includes(path.join(dir, qa.PLANO_LOCAL)));
assert.ok(qa.promptMudanca(dir, 'mais um caso', rasc).includes(path.join(rasc, qa.PLANO_LOCAL)));
console.log('ok area-ia');
