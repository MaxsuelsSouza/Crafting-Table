// @ts-check
// node teste-provedor.js
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : load(r, ...a));
const assert = require('assert');
const { faltando, OPERACOES } = require('../provedores/contrato');
const jira = require('../provedores/jira');
const { mdParaAdf, adfTexto, adfMd } = jira._teste;

// Contrato: o adaptador do Jira cumpre tudo; a fachada (ticket.js) delega cada operação e diz o nome do provedor ativo.
assert.deepStrictEqual(faltando(jira), []);
assert.deepStrictEqual(faltando({ id: 'x', nome: 'X', capacidades: {}, lerLink() {} }), OPERACOES.filter((o) => o !== 'lerLink'));
const fachada = require('../infra/ticket').jira;
assert.ok(OPERACOES.every((o) => typeof fachada[o] === 'function'));
assert.strictEqual(fachada.nome, 'Jira');
assert.strictEqual(require('../provedores').provedorAtivo().id, 'jira'); // sem vscode (testes): o padrão
console.log('ok contrato');

// Link e chave.
assert.deepStrictEqual(jira.lerLink('https://ferreiracosta.atlassian.net/browse/WMS-123'), { key: 'WMS-123', site: 'https://ferreiracosta.atlassian.net' });
assert.strictEqual(jira.lerLink('https://x.atlassian.net/jira/software/projects/WMS/boards/1?selectedIssue=wms-9').key, 'WMS-9');
assert.throws(() => jira.lerLink('https://x.atlassian.net/jira'));
assert.strictEqual(jira.linkDo('https://x.atlassian.net', 'WMS-1'), 'https://x.atlassian.net/browse/WMS-1');
console.log('ok link');

// Markdown → ADF → Markdown: o texto volta igual (títulos, negrito, listas, tabela).
const md = '#### CT01 – Validar\n\n**Dado que** x\n\n- a\n\n| Cenário | Status |\n| --- | --- |\n| CT01 | ok |';
const doc = mdParaAdf(md);
assert.deepStrictEqual(doc.content.map((n) => n.type), ['heading', 'paragraph', 'bulletList', 'table']);
assert.strictEqual(adfMd(doc).trim(), md);
assert.strictEqual(adfTexto(mdParaAdf('linha 1\nlinha 2')).trim(), 'linha 1\nlinha 2');
assert.deepStrictEqual(mdParaAdf('').content, [{ type: 'paragraph' }]);
console.log('ok adf');

// filhos: JQL `parent = KEY` e a descrição em Markdown; baixarAnexo usa a mesma conta.
(async () => {
  const guardados = { 'jira.email': 'a@b.c', 'jira.token': 't' };
  const secrets = { get: async (k) => guardados[k], delete: async (k) => { delete guardados[k]; } };
  const pedidos = [];
  globalThis.fetch = /** @type {any} */ (async (url, o) => {
    pedidos.push([String(url), o?.headers?.Authorization]);
    if (String(url).includes('/attachment/')) return { ok: true, arrayBuffer: async () => new TextEncoder().encode('abc').buffer };
    return { ok: true, text: async () => JSON.stringify({ issues: [{ key: 'WMS-2', fields: { summary: '[QA] Plano', updated: 'u', status: { name: 'Feito' }, description: doc } }] }) };
  });
  const fs = await jira.filhos(secrets, { key: 'WMS-1', site: 'https://x.atlassian.net' });
  assert.deepStrictEqual(fs, [{ key: 'WMS-2', resumo: '[QA] Plano', updated: 'u', status: 'Feito', md }]);
  assert.ok(decodeURIComponent(pedidos[0][0]).includes('jql=parent = WMS-1 ORDER BY created ASC'));
  assert.strictEqual(pedidos[0][1], 'Basic ' + Buffer.from('a@b.c:t').toString('base64'));
  const b = await jira.baixarAnexo(secrets, { id: '1', nome: 'a.txt', url: 'https://x.atlassian.net/rest/api/3/attachment/content/1' });
  assert.strictEqual(b.toString(), 'abc');
  assert.ok(await jira.conectado(secrets));
  await jira.sairConta(secrets);
  assert.ok(!(await jira.conectado(secrets)));
  console.log('ok filhos');
})().catch((e) => { console.error(e); process.exit(1); });
