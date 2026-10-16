// @ts-check
// node refinamento/testes/teste-hierarquia.js — hierarquia dos tipos de ticket: papel, filho, classificação e gravação nas variáveis.
const assert = require('assert');
const Module = /** @type {any} */ (require('module'));
const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : load(r, ...a));
const variaveis = require('../../provedores/variaveis');
const h = require('../hierarquia');

const L = { quebrar: ['Epic', 'Feature'], desenvolver: ['Story|História', 'Task'], executar: ['Sub-task'] };
assert.deepStrictEqual(h.papelDe('Epic', L), { papel: 'quebrar', filho: 'Feature' });
assert.deepStrictEqual(h.papelDe('feature', L), { papel: 'quebrar', filho: 'Story' }); // o último que se quebra gera o 1º de desenvolvimento
assert.deepStrictEqual(h.papelDe('História', L), { papel: 'desenvolver' }); // nome alternativo, sem caixa
assert.deepStrictEqual(h.papelDe('Sub-task', L), { papel: 'executar' });
assert.strictEqual(h.papelDe('Spike', L), null); // desconhecido: o refinamento pergunta
assert.strictEqual(h.papelDe('', L), null);
assert.deepStrictEqual(h.papelDe('Feature', { ...L, desenvolver: [] }), { papel: 'quebrar' }); // sem tipo abaixo: sem filho

// classificar: tipo que gera `filho` entra logo acima dele; sai das outras listas
assert.deepStrictEqual(h.classificar('Initiative', 'quebrar', 'Epic', L).quebrar, ['Initiative', 'Epic', 'Feature']);
assert.deepStrictEqual(h.classificar('Capability', 'quebrar', 'Story', L).quebrar, ['Epic', 'Feature', 'Capability']);
assert.deepStrictEqual(h.classificar('Bug', 'desenvolver', undefined, L).desenvolver, [
  'Story|História',
  'Task',
  'Bug'
]);
const mudou = h.classificar('Task', 'executar', undefined, L);
assert.deepStrictEqual([mudou.desenvolver, mudou.executar], [['Story|História'], ['Sub-task', 'Task']]);
assert.deepStrictEqual(h.conhecidos(L), ['Epic', 'Feature', 'Story', 'Task']);

(async () => {
  // registrar grava nas variáveis (origem manual) e papelDe passa a conhecer o tipo
  const c = {
    dados: {},
    get: (k) => c.dados[k],
    update: async (k, v) => {
      c.dados[k] = v;
    }
  };
  variaveis._teste.usar(c);
  assert.strictEqual(h.papelDe('Epic'), null);
  await h.registrar('Story', 'desenvolver');
  await h.registrar('Feature', 'quebrar', 'Story');
  await h.registrar('Epic', 'quebrar', 'Feature');
  assert.deepStrictEqual(variaveis.ler('tiposQuebrar'), ['Epic', 'Feature']);
  assert.deepStrictEqual(h.papelDe('Epic'), { papel: 'quebrar', filho: 'Feature' });
  assert.strictEqual(c.dados.variaveis.tiposQuebrar.origem, 'manual');
  await assert.rejects(h.registrar('X', 'inexistente'), /Papel desconhecido/);
  console.log('ok');
})();
