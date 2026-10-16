// @ts-check
const { esc } = require('../comum');
const { propostaMassa } = require('../../etapas/05-massa/proposta');

function cartaoPausa(dir, e) {
  // Pergunta do Claude (ou da extensão, quando o ticket só tem título): o cartão é a pausa; a resposta retoma sozinha.
  const prop = e.pausa?.motivo === 'massa-sql' ? propostaMassa(dir) : null;
  const sqlHtml = prop
    ? `<p><b>Por quê:</b> ${esc(prop.porque || e.pausa.detalhe || '—')} · <b>Papel:</b> ${esc(prop.papel)} · <b>Cenários:</b> ${esc(prop.cenarios.join(', '))}</p>
    <details open><summary>SQL que vai rodar (${prop.sql.length})</summary><pre>${esc(prop.sql.join(';\n'))};</pre></details>
    <details><summary>SQL de desfazer (${prop.desfazer.length})</summary><pre>${esc(prop.desfazer.join(';\n'))};</pre></details>`
    : '';
  const proc = e.processando ? ' proc' : '';
  const pausaCard = e.pausa
    ? `<div class="qa-card bloq${proc}" title="${esc(e.processando || '')}"><b>${e.pausa.motivo === 'briefing' ? 'Antes de planejar, preciso entender o que testar' : prop ? 'Alteração no banco para montar a massa' : 'O Claude precisa da sua resposta'}</b><p>${esc(e.pausa.pergunta)}</p>${sqlHtml}
    <div class="acoes-passo">${(e.pausa.opcoes || []).map((o, i) => `<button data-painel="qaResponder" data-op="${i}">${esc(o)}</button>`).join('')}
    <button data-painel="qaResponder" class="aprovar">Responder…</button></div></div>`
    : '';
  return pausaCard;
}

module.exports = { cartaoPausa };
