// @ts-check
// Teste: criação de ticket por documento (HOME temporário).
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-criar-'));
process.env.HOME = home;
const tickets = require('./tickets'), doc = require('../provedores/documento');
const src = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-src-'));
const mk = (n, c = 'conteudo ' + n) => { const p = path.join(src, n); fs.writeFileSync(p, c); return p; };

const exts = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'md', 'txt', 'docx'];
exts.forEach((e, i) => {
  const o = mk(`Relatorio-final_v${i}.${e}`);
  const t = doc.criarPorDocumento(o, { listas: ['implementacao'] });
  assert.strictEqual(t.chave, `DOC-${String(i + 1).padStart(3, '0')}`);
  assert.strictEqual(t.provedor, 'documento'); assert.strictEqual(t.site, 'documento:local');
  assert.strictEqual(t.titulo, `Relatorio final v${i}`); assert.strictEqual(t.status, 'Documento'); assert.strictEqual(t.link, '');
  const d = tickets.pasta(t.chave);
  assert.strictEqual(fs.readFileSync(path.join(d, t.documento.arquivo), 'utf8'), 'conteudo ' + path.basename(o));
  assert.strictEqual(fs.readFileSync(o, 'utf8'), 'conteudo ' + path.basename(o)); // original intacto
  const j = JSON.parse(fs.readFileSync(path.join(d, '.ticket.json'), 'utf8'));
  assert.strictEqual(j.provedor, 'documento'); assert.strictEqual(j.documento.tipo, e);
  const og = JSON.parse(fs.readFileSync(path.join(d, '.origem.json'), 'utf8'));
  assert.strictEqual(og[t.documento.arquivo].origem, 'documento');
});
assert.strictEqual(tickets.listar().filter((t) => tickets.listasDe(t).includes('implementacao')).length, exts.length);

// nome duplicado: sufixo
const dup = mk('Relatorio-final_v0.pdf', 'outro');
const t2 = doc.criarPorDocumento(dup);
assert.strictEqual(t2.chave, 'DOC-010');
const pasta = tickets.pasta('DOC-010');
fs.copyFileSync(dup, path.join(pasta, 'x.pdf'));
assert.throws(() => doc.criarPorDocumento(mk('a.exe')), /não aceito.*\.pdf/);
assert.throws(() => doc.criarPorDocumento(path.join(src, 'nao-existe.pdf')), /não encontrado/);

// buscar local: sem rede, título/status preservados
doc.buscar(null, /** @type {any} */ ({ key: 'DOC-001' })).then((r) => {
  assert.strictEqual(r.key, 'DOC-001'); assert.strictEqual(r.status, 'Documento'); assert.strictEqual(r.resumo, 'Relatorio final v0');
  assert.strictEqual(r.anexos.length, 1);
  console.log('ok teste-documento-criar');
});
