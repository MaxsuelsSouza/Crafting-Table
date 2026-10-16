// @ts-check
const fs = require('fs');
const path = require('path');
const { dirSpec, ticketDe } = require('../locais');
const { ARQUIVO, lerTexto } = require('./comum');
const { montar } = require('./montar');

/** Grava refinamento.md na pasta da spec. Devolve o caminho ou null (sem spec). Nunca lança: o refinamento não depende do pacote. */
function gravar(chave) {
  try {
    const t = ticketDe(chave);
    const md = t && montar(t);
    if (!md) return null;
    const arq = path.join(dirSpec(t), ARQUIVO);
    const semData = (x) => x.replace(/^> Gerado pela Crafting Table.*$/m, '').trim();
    if (semData(lerTexto(arq)) === semData(md)) return arq; // só a data mudou: não regrava (não suja o git)
    fs.writeFileSync(arq, md);
    return arq;
  } catch {
    return null;
  }
}

module.exports = { gravar };
