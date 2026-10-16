// @ts-check
// Busca por termos (todos precisam aparecer em tipo, chave, título ou conteúdo; sem acento e sem caixa). A chave pesa mais na ordem.
const { ler } = require('./arquivo');

const sem = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** @param {string[]} termos @param {{ tipo?: string }} [o] */
function buscar(termos, { tipo } = {}) {
  const ts = termos.flatMap((t) => sem(t).split(/\s+/)).filter(Boolean);
  return ler()
    .itens.filter((i) => !tipo || i.tipo === tipo)
    .map((i) => {
      const chave = sem(`${i.tipo} ${i.chave} ${i.titulo}`),
        tudo = `${chave} ${sem(i.conteudo)}`;
      if (!ts.every((t) => tudo.includes(t))) return null;
      return { i, peso: ts.filter((t) => chave.includes(t)).length };
    })
    .filter((x) => x !== null)
    .sort((a, b) => b.peso - a.peso)
    .map((x) => x.i);
}

const flow = (chave) => ler().itens.find((i) => i.tipo === 'flow' && i.chave === chave) || null;

module.exports = { buscar, flow, sem };
