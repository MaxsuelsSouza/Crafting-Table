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
assert.deepStrictEqual(faltando({ id: 'x', nome: 'X', capacidades: {}, lerLink() {} }), ['camposCredencial', ...OPERACOES.filter((o) => o !== 'lerLink')]);
const fachada = require('../infra/ticket').jira;
assert.ok(OPERACOES.every((o) => typeof fachada[o] === 'function'));
assert.strictEqual(fachada.nome, 'Jira');
assert.strictEqual(require('../provedores').provedorAtivo().id, 'jira'); // sem vscode (testes): o padrão
console.log('ok contrato');

// Link e chave.
assert.deepStrictEqual(jira.lerLink('https://ferreiracosta.atlassian.net/browse/WMS-123'), { id: 'WMS-123', chave: 'WMS-123', projeto: 'WMS', site: 'https://ferreiracosta.atlassian.net' });
assert.strictEqual(jira.lerLink('https://x.atlassian.net/jira/software/projects/WMS/boards/1?selectedIssue=wms-9').id, 'WMS-9');
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

  // Vários projetos e boards: boards de cada projeto, colunas de mesmo nome juntas, JQL com project in (…), tickets de vários boards sem repetir.
  guardados['jira.email'] = 'a@b.c'; guardados['jira.token'] = 't';
  const urls = [];
  const resposta = (u) => {
    if (u.includes('/rest/agile/1.0/board?projectKeyOrId=A')) return { values: [{ id: 1, name: 'Time A', type: 'kanban' }] };
    if (u.includes('/rest/agile/1.0/board?projectKeyOrId=B')) return { values: [{ id: 2, name: 'Time B', type: 'scrum' }] };
    if (u.includes('/board/1/configuration')) return { columnConfig: { columns: [{ name: 'A fazer', statuses: [{ id: '10' }] }, { name: 'Em teste', statuses: [{ id: '11' }] }] } };
    if (u.includes('/board/2/configuration')) return { columnConfig: { columns: [{ name: 'A fazer', statuses: [{ id: '20' }] }, { name: 'Feito', statuses: [{ id: '21' }] }] } };
    if (u.includes('/board/1/issue')) return { issues: [{ key: 'A-1', fields: { summary: 'a', updated: '2' } }, { key: 'X-9', fields: { summary: 'x', updated: '1' } }] };
    if (u.includes('/board/2/issue')) return { issues: [{ key: 'B-1', fields: { summary: 'b', updated: '3' } }, { key: 'X-9', fields: { summary: 'x', updated: '1' } }] };
    return { issues: [] };
  };
  globalThis.fetch = /** @type {any} */ (async (url) => { urls.push(decodeURIComponent(String(url))); return { ok: true, text: async () => JSON.stringify(resposta(String(url))) }; });
  const site = 'https://x.atlassian.net';
  assert.deepStrictEqual((await jira.boards(secrets, site, ['A', 'B'])).map((b) => b.nome), ['Time A', 'Time B']);
  const cols = await jira.etapas(secrets, site, ['A', 'B'], ['Time A', 'Time B']);
  assert.deepStrictEqual(cols, [{ nome: 'A fazer', ids: ['10', '20'] }, { nome: 'Em teste', ids: ['11'] }, { nome: 'Feito', ids: ['21'] }]);
  const ids = (await jira.boardsPorNome(secrets, site, ['A', 'B'], ['Time B', 'Time A'])).map((b) => b.id);
  assert.deepStrictEqual(ids, [2, 1]);
  const itens = await jira.meus(secrets, site, { tipos: 'Incident', boardId: ids, projeto: ['A', 'B'] });
  assert.deepStrictEqual(itens.map((i) => i.key), ['B-1', 'A-1', 'X-9']); // sem repetir, mais recentes primeiro
  assert.ok(urls.some((u) => u.includes('project in ("A","B") AND issuetype in (Incident)')));
  await jira.meus(secrets, site, { tipos: 'Incident', projeto: 'A' });
  assert.ok(urls.at(-1).includes('search/jql') && urls.at(-1).includes('project in ("A")'));
  console.log('ok varios projetos e boards');
})().catch((e) => { console.error(e); process.exit(1); });
