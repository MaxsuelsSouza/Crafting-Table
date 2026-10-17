// @ts-check
// Vídeo da sessão da 1.5 → cada cenário executado (passou/falhou/bloqueado). A tela é gravada uma vez só (Android: screenrecord do ambiente;
// web: o vídeo do Playwright MCP), e o arquivo entra na pasta da última execução de cada cenário que ainda não tem vídeo (hard link; sem
// suporte, cópia). Assim o card do cenário mostra print e vídeo, e o veredito confere os dois.
const fs = require('fs');
const path = require('path');
const fluxo = require('../../../../../componentes/fluxo-passos');
const { VIDEO } = require('../../../../../infra/reproducao');

const videosDe = (pasta) => {
  try {
    return fs
      .readdirSync(pasta)
      .filter((n) => VIDEO.test(n))
      .sort()
      .map((n) => path.join(pasta, n));
  } catch {
    return [];
  }
};

/** @returns {number} quantos cenários ganharam vídeo */
function anexarVideo(dir, pastaSessao) {
  const videos = videosDe(pastaSessao);
  if (!videos.length) return 0;
  let n = 0;
  for (const p of fluxo.ler(dir).passos) {
    const ex = p.execucoes?.at(-1);
    if (!ex || !['passou', 'falhou', 'bloqueado'].includes(ex.status)) continue;
    if (fluxo.arquivosDe(dir, ex).some((f) => VIDEO.test(f))) continue;
    const destino = path.join(dir, ex.evidencias);
    fs.mkdirSync(destino, { recursive: true });
    for (const v of videos) {
      const alvo = path.join(destino, `sessao-${path.basename(v)}`);
      try {
        fs.linkSync(v, alvo);
      } catch {
        fs.copyFileSync(v, alvo);
      }
    }
    n++;
  }
  return n;
}

module.exports = { anexarVideo, videosDe };
