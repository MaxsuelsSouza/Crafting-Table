// @ts-check
// node teste-documento.js
const fs = require('fs'), os = require('os'), path = require('path');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-'));
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : load(r, ...a));
const assert = require('assert');
// Zero rede.
const https = require('https');
https.request = /** @type {any} */ (() => { throw new Error('REDE https'); });
globalThis.fetch = /** @type {any} */ (() => { throw new Error('REDE fetch'); });

const { faltando } = require('./contrato');
const doc = require('./documento');
const tickets = require('../infra/tickets');
const jira = /** @type {any} */ (require('../infra/ticket').jira);
const conexao = require('../configuracao/conexao');

assert.deepStrictEqual(faltando(doc), []);
assert.strictEqual(require('./index').provedorAtivo().id, 'jira');
assert.ok(!conexao.listaProvedores().some((p) => p.id === 'documento'));
assert.ok(!('documento' in require('./index').ADAPTADORES));

assert.strictEqual(doc.proximaChave(), 'DOC-001');
const novo = (chave) => tickets.gravar({ idProvedor: chave, chave, provedor: 'documento', site: doc.SITE, link: '', titulo: 'Contrato de vagas', status: '', conversas: [], criado: Date.now(),
  documento: { arquivo: 'doc.md', nome: 'doc.md', tipo: 'md', em: '2026-01-01' } });
const t = novo('DOC-001');
assert.strictEqual(doc.proximaChave(), 'DOC-002');
novo('DOC-002'); assert.strictEqual(doc.proximaChave(), 'DOC-003');
assert.strictEqual(tickets.ler('DOC-001').documento.nome, 'doc.md');
fs.writeFileSync(path.join(tickets.pasta('DOC-001'), 'doc.md'), '# oi');

(async () => {
  const S = {}, a = jira.alvo(tickets.ler('DOC-001'));
  assert.strictEqual(a.provedor, 'documento');
  assert.strictEqual(jira.nome, 'Jira');
  // buscar
  let j = await jira.buscar(S, a);
  assert.strictEqual(j.resumo, 'Contrato de vagas'); assert.strictEqual(j.status, 'Documento'); assert.strictEqual(j.descricao, '<em>Sem descrição</em>');
  assert.deepStrictEqual(j.anexos.map((x) => x.nome), ['doc.md']);
  assert.strictEqual((await jira.baixarAnexo(S, j.anexos[0])).toString(), '# oi');
  // só (secrets, site, key)
  assert.strictEqual(jira.linkDo(t.site, 'DOC-001'), '');
  assert.deepStrictEqual(await jira.eu(S, t.site), { id: 'local', nome: 'Você' });
  assert.deepStrictEqual(await jira.pessoas(S, a, ''), [{ id: 'local', nome: 'Você' }]);
  // comentários
  await jira.comentar(S, a, 'nota **minha**');
  let cs = await jira.comentarios(S, a);
  assert.strictEqual(cs.length, 1); assert.strictEqual(cs[0].autorId, (await jira.eu(S, t.site)).id);
  doc.adicionarComentario('DOC-001', { autor: 'Ana', texto: 'colado', externo: true });
  cs = await jira.comentarios(S, a);
  assert.strictEqual(cs[1].autorId, 'externo'); assert.notStrictEqual(cs[1].autorId, 'local');
  j = await jira.buscar(S, a);
  assert.strictEqual(j.comentarios[0].autor, 'Ana'); assert.ok(j.comentarios[1].corpo.includes('<b>minha</b>'));
  // subtarefas
  const r = await jira.criarSubtarefa(S, a, { resumo: 'Card 1', descricao: 'md', estimativa: '2h' });
  assert.strictEqual(r.key, 'DOC-001-1');
  assert.strictEqual((await jira.criarSubtarefa(S, a, { resumo: 'Card 2', descricao: '' })).key, 'DOC-001-2');
  await jira.atualizarDescricao(S, { site: t.site }, 'DOC-001-1', 'novo', { titulo: 'Card 1b' });
  const f = await jira.filhos(S, a);
  assert.deepStrictEqual([f[0].key, f[0].resumo, f[0].md], ['DOC-001-1', 'Card 1b', 'novo']);
  assert.strictEqual((await jira.buscar(S, a)).subtarefas[0].tipo, 'Subtarefa');
  // anexar
  const arq = path.join(process.env.HOME, 'p.png'); fs.writeFileSync(arq, 'x');
  await jira.anexar(S, t.site, 'DOC-001-1', [{ arquivo: arq, nome: 'p.png' }]);
  assert.ok(fs.existsSync(path.join(tickets.pasta('DOC-001'), '.publicado', 'DOC-001-1', 'p.png')));
  fs.mkdirSync(path.join(tickets.pasta('DOC-001'), '.anexos'));
  fs.writeFileSync(path.join(tickets.pasta('DOC-001'), '.anexos', 'tela.png'), 'yy');
  assert.deepStrictEqual((await jira.buscar(S, a)).anexos.map((x) => x.nome), ['doc.md', 'tela.png']);
  assert.throws(() => doc.lerLink('x'), /não tem link/);
  assert.strictEqual(doc.chaveDaBranch('feature/DOC-007-x'), 'DOC-007');
  console.log('ok documento');
})().catch((e) => { console.error(e); process.exit(1); });
