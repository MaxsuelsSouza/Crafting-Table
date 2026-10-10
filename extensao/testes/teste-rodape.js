// @ts-check
// node teste-rodape.js
// Rodapé: notificação nova = depois do último "lido"; fora do painel os cliques vão por data-painel, dentro por data-acao.
const Module = /** @type {any} */ (require('module')); const load = Module._load;
const sem = () => ({}); // vscode mínimo: só o que os módulos usam ao carregar
Module._load = (r, ...a) => (r === 'vscode' ? new Proxy({ EventEmitter: class { event() {} fire() {} } }, { get: (o, k) => o[k] ?? sem }) : load(r, ...a));
const assert = require('assert');
const rodape = require('../componentes/rodape');
assert.ok(rodape._teste.ehNova({ em: '2026-01-02T00:00:00Z' }, Date.parse('2026-01-01T00:00:00Z')));
assert.ok(!rodape._teste.ehNova({ em: '2026-01-01T00:00:00Z' }, Date.parse('2026-01-02T00:00:00Z')));
assert.ok(rodape.rodape(null, true).includes('data-acao="notifLidas"') && rodape.rodape(null).includes('data-painel="notifLidas"'));
assert.ok(rodape.rodape(null).includes('Nenhuma notificação ainda.') && rodape.rodape(null).startsWith('<footer class="ct-rod">'));
console.log('ok rodape');
