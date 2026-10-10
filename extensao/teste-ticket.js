// node teste-ticket.js
const Module = require('module'); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : load(r, ...a));
const assert = require('assert');
const { lerLink, esc } = require('./ticket')._teste;
assert.deepStrictEqual(lerLink('https://ferreiracosta.atlassian.net/browse/WMS-123'), { key: 'WMS-123', site: 'https://ferreiracosta.atlassian.net' });
assert.strictEqual(lerLink(' https://x.atlassian.net/jira/software/projects/WMS/boards/1?selectedIssue=wms-9 ').key, 'WMS-9');
assert.throws(() => lerLink('https://x.atlassian.net/jira'));
assert.strictEqual(esc('<b>"x"</b>'), '&#60;b&#62;&#34;x&#34;&#60;/b&#62;');
console.log('ok');

// Abas: o mesmo ticket em Tickets, Implementações e QA, cada uma com a sua pasta e as suas conversas.
process.env.HOME = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'ct-'));
const tk = require('./tickets'), path = require('path');
tk.criar('https://x.atlassian.net/browse/WMS-7', { listas: ['tickets', 'qa'] });
assert.strictEqual(tk.pasta('WMS-7'), path.join(tk.RAIZ, 'WMS-7'));
assert.strictEqual(tk.pasta('WMS-7', 'qa'), path.join(tk.RAIZ, 'WMS-7', 'qa'));
assert.strictEqual(tk.pasta('WMS-7', '../x'), path.join(tk.RAIZ, 'WMS-7')); // aba desconhecida não sai da pasta
tk.vincular('s1', 'WMS-7'); tk.vincular('s2', 'WMS-7', 'qa');
assert.deepStrictEqual([tk.ticketDa('s2'), tk.listaDa('s2'), tk.listaDa('s1')], ['WMS-7', 'qa', 'tickets']);
assert.deepStrictEqual(tk.listasDe({ lista: 'impl' }), ['impl']); // formato antigo
assert.deepStrictEqual(tk.listasDe({ implementacao: true }), ['impl']);
console.log('ok abas');
