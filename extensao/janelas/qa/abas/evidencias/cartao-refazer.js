// @ts-check
const { esc } = require('../comum');
const { loteRefazer } = require('../../etapas/02-cenarios/refazer');

// Lote ↻ Refazer: um cenário por vez, com 3 opções e outra resposta.
function cartaoRefazer(dir) {
  const lote = loteRefazer(dir);
  const loteCard = lote
    ? (() => {
        const c = lote.cenario,
          ult = (c.execucoes || []).at(-1);
        return `<div class="qa-card bloq"><b>Refazer · ${lote.idx + 1} de ${lote.ids.length} · ${esc(c.id)} <span class="dim">${esc(c.titulo || '')}</span></b>
    <p>${esc(c.status === 'bloqueado' ? 'Bloqueado' : 'Não passou')}${ult?.nota ? `: ${esc(ult.nota)}` : ''}. Como refazer este cenário?</p>
    <div class="acoes-passo">${lote.opcoes.map((o, i) => `<button data-painel="qaRefazerResponder" data-op="${i}">${esc(o)}</button>`).join('')}
    <button class="aprovar" data-painel="qaRefazerResponder" data-op="outra">Outra resposta…</button>
    <button class="sec" data-painel="qaRefazerCancelar">Cancelar</button></div></div>`;
      })()
    : '';
  return loteCard;
}

module.exports = { cartaoRefazer };
