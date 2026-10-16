// @ts-check
const fs = require('fs');
const path = require('path');
const { gravarJson } = require('../../estado');
const { cenarios, CENARIOS } = require('../02-cenarios/mapa');

// Copia arquivos para a pasta da execução em andamento do cenário.
function evidencia(dir, id, arquivos) {
  const ex = cenarios(dir)
    .cenarios.find((x) => x.id === id)
    ?.execucoes?.at(-1);
  if (!ex || ex.status !== 'executando') throw new Error(`${id} não está em execução`);
  return arquivos.map((a) => {
    const nome = path.basename(a),
      destino = path.join(dir, ex.evidencias, nome);
    fs.copyFileSync(a, destino);
    const r = cenarios(dir),
      x = r.cenarios.find((y) => y.id === id)?.execucoes?.at(-1);
    if (x && !(x.anexos ||= []).includes(nome)) {
      x.anexos.push(nome);
      gravarJson(path.join(dir, CENARIOS), r);
    }
    return destino;
  });
}
const arquivosDe = (dir, ex) => {
  try {
    return fs
      .readdirSync(path.join(dir, ex.evidencias))
      .filter((n) => !n.startsWith('.'))
      .map((n) => path.join(dir, ex.evidencias, n));
  } catch {
    return [];
  }
};

module.exports = { evidencia, arquivosDe };
