// @ts-check
// node infra/reproducao/teste-reproducao.js — veredito (3 estados + sem evidência) e quadros dos vídeos (ffmpeg real, se houver; sem ffmpeg).
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { execFileSync } = require('child_process');
const R = require('.');
const V = R.VEREDITOS;

// ── veredito ──
const p = (id, status, print = false, video = false) => ({ id, status, print, video });
assert.strictEqual(R.veredito({ passos: [] }).veredito, V.INCONCLUSIVO); // sem passo a passo
assert.strictEqual(R.veredito({ passos: [p('P01', 'passou')], roteiro: 'o ticket não tem passo a passo' }).motivo, 'o ticket não tem passo a passo');
assert.strictEqual(R.veredito({ passos: [p('P01', 'falhou', true, true)] }).veredito, V.REPRODUZIDO);
assert.strictEqual(R.veredito({ passos: [p('P01', 'falhou', true, true)], ambiente: 'sha não bate' }).veredito, V.INCONCLUSIVO); // código errado não prova
let r = R.veredito({ passos: [p('P01', 'falhou', true, false), p('P02', 'passou')] });
assert.deepStrictEqual([r.veredito, r.semEvidencia], [V.SEM_EVIDENCIA, ['P01']]); // print sem vídeo não basta
r = R.veredito({ passos: [p('P01', 'falhou', true, true), p('P02', 'falhou')] });
assert.deepStrictEqual([r.veredito, r.semEvidencia], [V.REPRODUZIDO, ['P02']]);
r = R.veredito({ passos: [p('P01', 'passou'), p('P02', 'bloqueado')] });
assert.ok(r.veredito === V.INCONCLUSIVO && r.motivo.includes('P02'));
assert.strictEqual(R.veredito({ passos: [p('P01', 'passou'), p('P02', 'pendente')] }).veredito, V.INCONCLUSIVO);
assert.strictEqual(R.veredito({ passos: [p('P01', 'passou')], midia: ['erro.mp4'] }).veredito, V.INCONCLUSIVO);
assert.strictEqual(R.veredito({ passos: [p('P01', 'passou'), p('P02', 'passou')] }).veredito, V.NAO_REPRODUZIDO);

// ── quadros ──
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quadros-'));
const sem = R.extrairQuadros(dir, [path.join(dir, 'a.mp4'), path.join(dir, 'b.txt')], { ffmpeg: '/nao/existe/ffmpeg' });
assert.deepStrictEqual(sem.naoAnalisados.map((x) => [path.basename(x.video), x.motivo]), [['a.mp4', 'ffmpeg não instalado']]);
let temFfmpeg = true;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { temFfmpeg = false; }
if (temFfmpeg) {
  // vídeo parado (sem troca de cena): cai no fps=1/2 → 6 s = 3 quadros
  const v = path.join(dir, 'parado.mp4');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=6', '-pix_fmt', 'yuv420p', v]);
  r = R.extrairQuadros(dir, [v]);
  assert.strictEqual(r.naoAnalisados.length, 0);
  assert.ok(r.quadros[0].arquivos.length >= 2 && r.quadros[0].arquivos.length <= 12, String(r.quadros[0].arquivos.length));
  assert.ok(r.quadros[0].arquivos[0].startsWith(path.join(dir, 'quadros', 'parado') + path.sep));
  const r2 = R.extrairQuadros(dir, [v], { ffmpeg: '/nao/existe/ffmpeg' }); // já extraído: reaproveita, nem chama o ffmpeg
  assert.deepStrictEqual(r2.quadros[0].arquivos, r.quadros[0].arquivos);
} else console.log('(sem ffmpeg: pulei a extração real)');

console.log('ok');
