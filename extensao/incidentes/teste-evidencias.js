// @ts-check
// node teste-evidencias.js
const assert = require('assert');
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : load(r, ...a));
const fs = require('fs'), os = require('os'), path = require('path');
const { corpo } = require('./evidencias');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evid-'));
const html = (d) => corpo({ id: 'WMS-1' }, d || { uri: (f) => 'vsc://' + path.basename(f) }, dir);

// Vazio: nada quebra, três blocos com estado vazio
let h = html();
assert.ok(h.includes('O resumo aparece') && h.includes('MASSA REAL') && h.includes('MASSA DE TESTE') && h.includes('Nenhum print'));

// Cheio: ordem resumo, SQL (real antes de teste), galeria; escape; mídia ausente; fora de dir
fs.mkdirSync(path.join(dir, 'evidencias'));
fs.writeFileSync(path.join(dir, 'resumo.md'), '## Falha\n<script>x</script> **ok**');
fs.writeFileSync(path.join(dir, 'massa-real.sql'), "SELECT '<b>' FROM t");
fs.writeFileSync(path.join(dir, 'massa-teste.sql'), 'INSERT INTO t VALUES (1)');
fs.writeFileSync(path.join(dir, 'evidencias', 'a.png'), 'x');
fs.writeFileSync(path.join(dir, 'evidencias', 'v.mp4'), 'x');
fs.writeFileSync(path.join(path.dirname(dir), 'segredo.png'), 'x');
fs.writeFileSync(path.join(dir, 'reproducao.json'), JSON.stringify({ midias: [
  { tipo: 'print', arquivo: 'evidencias/a.png', legenda: '<i>antes</i>' },
  { tipo: 'video', arquivo: 'evidencias/v.mp4', legenda: 'vídeo' },
  { tipo: 'print', arquivo: 'evidencias/nao-existe.png', legenda: 'sumiu' },
  { tipo: 'print', arquivo: '../segredo.png', legenda: 'fuga' }, null
] }));
h = html();
const pos = ['Resumo analítico', 'MASSA REAL', 'MASSA DE TESTE', 'Galeria de mídia'].map((x) => h.indexOf(x));
assert.ok(pos.every((p) => p >= 0) && pos.every((p, i) => !i || p > pos[i - 1]));
assert.ok(!h.includes('<script>x') && !h.includes('<b>\'') && !h.includes('<i>antes'));
assert.ok(h.includes('<video controls') && h.includes('vsc://a.png') && h.includes('arquivo não encontrado'));
assert.ok(!h.includes('segredo.png') && (h.match(/arquivo não encontrado/g) || []).length === 2);

// JSON inválido e sem uri
fs.writeFileSync(path.join(dir, 'reproducao.json'), '{ruim');
assert.ok(html().includes('Nenhum print'));
fs.writeFileSync(path.join(dir, 'reproducao.json'), JSON.stringify({ midias: [{ tipo: 'print', arquivo: 'evidencias/a.png' }] }));
assert.ok(!html({}).includes('src='));
fs.rmSync(dir, { recursive: true }); fs.rmSync(path.join(path.dirname(dir), 'segredo.png'));
console.log('ok');
