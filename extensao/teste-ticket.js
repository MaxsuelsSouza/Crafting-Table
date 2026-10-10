// @ts-check
// node teste-ticket.js
const Module = /** @type {any} */ (require('module')); const load = Module._load;
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

// Menu de abas: aba ligada, contador, separador e o alvo do clique dentro da página x na moldura de outra seção.
const { menu } = require('./componentes/menu-abas');
const itens = [{ id: 'docs', nome: 'Docs' }, { id: 'duvidas', nome: 'Dúvidas', badge: 2, dica: '2 em aberto' }, '|', { secao: 'outra', nome: 'Outra' }];
const dentro = menu(itens, { aba: 'docs', secao: 'principal', principal: 'principal', dentro: true });
assert.ok(dentro.includes('<button data-acao="aba" data-id="docs" class="is-on">Docs</button>'));
assert.ok(dentro.includes('data-id="duvidas">Dúvidas <span class="ct-badge" title="2 em aberto">2</span>'));
assert.ok(dentro.includes('<span class="ct-sep"></span><button data-secao="outra">Outra</button>'));
const fora = menu(itens, { aba: 'docs', secao: 'outra', principal: 'principal', dentro: false });
assert.ok(fora.includes('<button data-secao="principal" data-aba="docs">Docs</button>'), 'na moldura a aba não fica ligada e troca de seção');
assert.ok(fora.includes('<button data-secao="outra" class="is-on">Outra</button>'));
assert.ok(!menu([{ id: 'x', nome: 'X', badge: 0 }], { principal: 'p' }).includes('ct-badge'), 'contador zero some');
console.log('ok menu');
