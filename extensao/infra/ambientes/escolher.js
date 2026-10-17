// @ts-check
// Qual ambiente o ticket usa (v1: um por ticket): o que o estado do ticket já diz → a camada dos repositórios (só web → web,
// só mobile → emulador; os dois ou nenhum não decidem) → craftingTable.ambientePadrao → emulador.
// ctx: { ambiente?: string (estado do ticket), repos?: [{ camada }], padrao?: string (configuração) }.
const { NOMES, PADRAO } = require('./index');

function escolher({ ambiente, repos = [], padrao } = {}) {
  if (ambiente && NOMES.includes(ambiente)) return ambiente;
  const camadas = new Set(repos.map((r) => r?.camada));
  if (camadas.has('web') !== camadas.has('mobile')) return camadas.has('web') ? 'web' : 'emulador';
  return padrao && NOMES.includes(padrao) ? padrao : PADRAO;
}

module.exports = { escolher };
