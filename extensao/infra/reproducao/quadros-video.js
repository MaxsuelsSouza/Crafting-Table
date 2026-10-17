// @ts-check
// Quadros dos vídeos de evidência (código, sem IA): a IA não abre vídeo com Read, então o ffmpeg tira os quadros em que a tela muda
// (select='gt(scene,0.3)'); sem troca de cena, 1 quadro a cada 2 s (fps=1/2). Teto: 12 por vídeo e 40 no total.
// Saída: <pasta>/quadros/<video>/q-NN.png (pasta = <aba>/evidencias-ticket). Já extraído: reaproveita. Sem ffmpeg ou erro: o vídeo
// volta em naoAnalisados com o motivo (o veredito da reprodução conta isso como mídia essencial não analisada).
// Usado por: Implementações (1.2 Evidências). Teste: infra/reproducao/teste-reproducao.js.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PASTA = 'quadros',
  POR_VIDEO = 12,
  TOTAL = 40;
const VIDEO = /\.(mp4|webm|mov|mkv|avi)$/i;

const pngs = (d) => {
  try {
    return fs
      .readdirSync(d)
      .filter((n) => /\.png$/i.test(n))
      .sort()
      .map((n) => path.join(d, n));
  } catch {
    return [];
  }
};

/**
 * @param {string} pasta onde estão os vídeos (os quadros vão para <pasta>/quadros/<video>/)
 * @param {string[]} videos caminhos dos vídeos
 * @param {{ ffmpeg?: string }} [o] ffmpeg: o executável (teste)
 * @returns {{ quadros: { video: string, arquivos: string[] }[], naoAnalisados: { video: string, motivo: string }[] }}
 */
function extrair(pasta, videos, o = {}) {
  const ffmpeg = o.ffmpeg || 'ffmpeg',
    quadros = [],
    naoAnalisados = [];
  let total = 0;
  for (const v of videos.filter((x) => VIDEO.test(x)).sort()) {
    const nome = path.basename(v).replace(/\.[^.]+$/, ''),
      saida = path.join(pasta, PASTA, nome);
    let arqs = pngs(saida);
    const resta = Math.min(POR_VIDEO, TOTAL - total);
    if (!arqs.length && resta <= 0) {
      naoAnalisados.push({ video: v, motivo: `teto de ${TOTAL} quadros atingido` });
      continue;
    }
    if (!arqs.length) {
      fs.mkdirSync(saida, { recursive: true });
      const rodar = (vf, extra = []) =>
        execFileSync(
          ffmpeg,
          ['-hide_banner', '-loglevel', 'error', '-y', '-i', v, '-vf', vf, ...extra, '-frames:v', String(resta), path.join(saida, 'q-%02d.png')],
          { timeout: 120000, stdio: ['ignore', 'ignore', 'pipe'] }
        );
      try {
        rodar("select='gt(scene,0.3)'", ['-vsync', 'vfr']);
        if (!pngs(saida).length) rodar('fps=1/2');
      } catch (x) {
        const motivo = /** @type {any} */ (x).code === 'ENOENT' ? 'ffmpeg não instalado' : `ffmpeg falhou: ${String(/** @type {any} */ (x).stderr || /** @type {any} */ (x).message).trim().split('\n')[0]}`;
        naoAnalisados.push({ video: v, motivo });
        continue;
      }
      arqs = pngs(saida);
    }
    if (!arqs.length) {
      naoAnalisados.push({ video: v, motivo: 'o ffmpeg não tirou nenhum quadro' });
      continue;
    }
    total += arqs.length;
    quadros.push({ video: v, arquivos: arqs });
  }
  return { quadros, naoAnalisados };
}

module.exports = { extrair, PASTA, POR_VIDEO, TOTAL, VIDEO };
