// @ts-check
// Arquivos da etapa 7 (Teste na aplicação) na pasta da aba: teste.json (resultado, ARQ[7]) e a pasta teste/ com o plano dos CTs
// (plano-cts.md), o fluxo dos CTs (fluxo.json, componentes/fluxo-passos.js), as evidências por CT (evidencias/CTnn/…), as capturas
// do navegador (capturas/, Playwright MCP) e o vídeo da sessão no Android (video/). Sem vscode: a aba, a lista e os testes leem daqui.
const fs = require('fs');
const path = require('path');

const PASTA = 'teste',
  JSON_ = 'teste.json',
  PLANO = 'teste/plano-cts.md';
const dirTeste = (dir) => path.join(dir, PASTA);
const lerJson = (f, pad) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return pad;
  }
};
const lerResultado = (dir) => lerJson(path.join(dir, JSON_), null);
const gravarResultado = (dir, r) =>
  fs.writeFileSync(path.join(dir, JSON_), JSON.stringify({ ...r, em: new Date().toISOString() }, null, 2));
const lerPlano = (dir) => {
  try {
    return fs.readFileSync(path.join(dir, PLANO), 'utf8');
  } catch {
    return '';
  }
};
// Plano refeito (ajuste pedido): o anterior e o fluxo vão para o histórico com carimbo; as evidências ficam.
function arquivarPlano(dir) {
  const c = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  for (const n of ['plano-cts.md', 'fluxo.json']) {
    const f = path.join(dirTeste(dir), n);
    if (fs.existsSync(f)) fs.renameSync(f, f.replace(/(\.\w+)$/, `.${c}$1`));
  }
}

module.exports = { PASTA, JSON_, PLANO, dirTeste, lerResultado, gravarResultado, lerPlano, arquivarPlano };
