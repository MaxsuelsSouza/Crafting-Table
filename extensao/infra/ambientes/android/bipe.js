// @ts-check
// Etapa bipe no coletor Android: o DataWedge recebe o código por broadcast. Movido de janelas/qa/etapas/06-execucao/dependencias.js.
// Código entre aspas simples para o shell do aparelho (espaço e metacaractere quebravam o adb shell da skill); confere a entrega.
const { shell } = require('./adb');

const bipe = async (codigo, ctx = {}, acao = 'br.com.ferreiracosta.SCANNER') => {
  const x = await shell(
    ctx,
    `am broadcast -a ${acao} --es com.symbol.datawedge.data_string '${String(codigo).replace(/'/g, `'\\''`)}'`
  );
  return { ok: x.rc === 0 && /Broadcast completed/i.test(x.saida), saida: x.saida };
};

module.exports = { bipe };
