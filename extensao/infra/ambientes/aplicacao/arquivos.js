// @ts-check
// Arquivos de evidência de uma pasta, recursivo (padrão: .png). Usado por evidencia.arquivos dos ambientes (android: prints do Maestro;
// web: .png e .webm do Playwright).
const fs = require('fs');
const path = require('path');

function arquivos(pasta, re = /\.png$/i) {
  const out = [];
  const andar = (p) => {
    let itens = [];
    try {
      itens = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const i of itens) {
      const f = path.join(p, i.name);
      if (i.isDirectory()) andar(f);
      else if (re.test(i.name)) out.push(f);
    }
  };
  andar(pasta);
  return out;
}

module.exports = { arquivos };
