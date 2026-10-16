// @ts-check
const { dataBr } = require('../../componentes/card-cenario');
const { massa } = require('../etapas/05-massa/estado');
const { ultimoRefresh, massaValida } = require('../etapas/05-massa/regras/validade');
const { esc } = require('./comum');
const { CSS } = require('./css');

// Aba Massa (painel). Validade: estado 'valida' e medida depois do último refresh do banco.
function massaHtml(dir, hora = '06:00') {
  const m = massa(dir),
    agora = new Date(),
    ref = ultimoRefresh(agora, hora);
  const rot = (i) =>
    i.estado === 'valida' && !massaValida(i, agora, hora)
      ? ['Vencida', 'desatualizado']
      : i.estado === 'valida'
        ? ['Válida', 'passou']
        : i.estado === 'consumida'
          ? ['Consumida', 'bloqueado']
          : ['Inválida', 'falhou'];
  const item = (i, morta = false) => {
    const [r, cls] = morta ? ['Morta', 'falhou'] : rot(i);
    return `<details class="cen" data-cen="massa-${morta ? 'morta-' : ''}${esc(i.id)}"><summary><span class="cid">${esc(i.id)}</span><span class="ctit">${esc(i.papel)}</span><span class="cst ${cls}">${r}</span></summary><div class="cdet">
    <div>Cenários: ${esc((i.cenarios || []).join(', ') || '—')} · medida ${esc(dataBr(i.medidaEm))}</div>
    <div class="papel-massa">${
      Object.entries(i.dados || {})
        .map(
          ([k, v]) =>
            `<div class="campo"><span class="k">${esc(k)}</span><span class="v">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</span><button class="copiar" data-acao="qaMassaCopiar" data-id="${esc(i.id)}" data-key="${esc(k)}" title="Copiar ${esc(k)}">⧉</button></div>`
        )
        .join('') || '<span class="k">sem campos</span>'
    }</div>
    ${i.consulta ? `<details><summary>Consulta</summary><pre>${esc(i.consulta)}</pre></details>` : ''}
    ${!morta && i.origem === 'sql' && i.desfazer?.length ? `<details><summary>Montada por SQL · desfazer</summary><pre>${esc(i.desfazer.join(';\n'))};</pre><button data-acao="qaMassaDesfazer" data-id="${esc(i.id)}" title="Roda o SQL de desfazer no banco (pede confirmação)">Desfazer no banco</button></details>` : ''}
    ${morta ? '' : i.estado === 'valida' ? `<button data-acao="qaMassaEstado" data-id="${esc(i.id)}" data-op="invalida">Marcar inválida</button>` : `<button data-acao="qaMassaEstado" data-id="${esc(i.id)}" data-op="valida">Marcar válida</button>`}
    </div></details>`;
  };
  const linhas = m.itens
    .slice()
    .reverse()
    .map((i) => item(i))
    .join('');
  const mortas = (m.mortas || []).slice().reverse();
  return `${CSS}<div class="qa-card"><b>Massa de dados</b><p>Vale até o refresh do banco (último: ${esc(dataBr(ref.toISOString()))}; horário em Configurações → craftingTable.qaHoraRefresh).
    O ▶ levanta massa só para cenários sem massa válida; a massa que um cenário altera vira consumida.</p>
    <button data-acao="qaMassaEditar" title="Abre o .massa.json no editor (cole ou corrija dados à mão)">Editar à mão</button>
    ${linhas ? '<button class="sec" data-expandir-tudo title="Abre ou fecha todos os itens da massa">Expandir tudo</button>' : ''}</div>
    <div class="cens">${linhas || '<div class="vazio-aba">Nenhuma massa ainda. O ▶ do QA levanta a massa antes de executar os cenários.</div>'}</div>
    ${mortas.length ? `<details class="qa-card"><summary><b style="display:inline">Massas mortas (${mortas.length})</b></summary><p>Massas de rodadas anteriores, trocadas por ↻ Refazer massa. Ficam só para consulta.</p><div class="cens">${mortas.map((i) => item(i, true)).join('')}</div></details>` : ''}`;
}

module.exports = { massaHtml };
