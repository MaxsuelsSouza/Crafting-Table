// @ts-check
const { massa } = require('../estado');

function ultimoRefresh(agora, hora = '06:00') {
  const [h, m] = String(hora).split(':').map(Number),
    d = new Date(agora);
  d.setHours(h || 0, m || 0, 0, 0);
  if (d > agora) d.setDate(d.getDate() - 1);
  return d;
}
const massaValida = (i, agora, hora) => i.estado === 'valida' && new Date(i.medidaEm) >= ultimoRefresh(agora, hora);
const semMassa = (dir, ids, agora, hora) =>
  ids.filter((id) => !massa(dir).itens.some((i) => (i.cenarios || []).includes(id) && massaValida(i, agora, hora)));
// Sincronia Ao Vivo ↔ aba Massa: antes de tocar no banco, a sessão lê o que a aba já tem. Por cenário: `validas` (itens que ainda servem),
// `faltam` (sem massa válida: só esses podem ir ao banco) e `esgotadas` (a aba só tem massa já consumida: a busca no banco encerra, não se gera outra).
function sincronizarMassa(dir, ids, agora, hora) {
  const itens = massa(dir).itens,
    validas = {},
    faltam = [],
    esgotadas = [];
  for (const id of ids) {
    const meus = itens.filter((i) => (i.cenarios || []).includes(id));
    validas[id] = meus.filter((i) => massaValida(i, agora, hora));
    if (validas[id].length) continue;
    faltam.push(id);
    if (meus.length && meus.every((i) => i.estado === 'consumida')) esgotadas.push(id);
  }
  return { validas, faltam, esgotadas };
}

module.exports = { ultimoRefresh, massaValida, semMassa, sincronizarMassa };
