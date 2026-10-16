// @ts-check
// Caixas da aba Spec para mudanças vindas de comentário: a decisão pendente (vermelha) e as mudanças em andamento; e o CSS delas.
const { esc } = require('../../../infra/texto');
const { quando } = require('../../../componentes/formato');
const { NIVEL, pendentes } = require('../../etapas/comentarios/regras');

// Mudanças vindas de comentários do Jira: o vigia acha, o Claude mede (nível) e regride a spec; aqui você vê e dá ciência.
// Mudança pedida em comentário que espera você: a spec NÃO foi alterada. Uma por vez, a mais antiga primeiro.
function caixaDecisao(l) {
  const p = pendentes(l);
  if (!p.length) return '';
  const i = p[0],
    [rot, cor] = NIVEL[i.nivel] || [i.nivel, 'var(--perigo)'];
  const bt = (op, texto, cls = '') =>
    `<button class="${cls}" data-acao="mudancaDecidir" data-id="${esc(i.id)}" data-op="${op}">${esc(texto)}</button>`;
  return `<div class="dec-caixa"><div class="dec-t"><span class="dec-ic">⚠</span><b>Mudança pedida no ticket</b>
      <span class="mud-niv" style="--cor:${cor}">${esc(rot)}</span>${p.length > 1 ? `<span class="dec-fila">+${p.length - 1} na fila</span>` : ''}</div>
    <div class="mud-l1"><b>${esc(i.autor || 'alguém')}</b><span class="mud-q">${esc(quando(i.data))}</span><a href="${esc(i.link)}">ver comentário</a></div>
    <div class="dec-cm">${esc((i.texto || '').slice(0, 300))}</div>
    <div class="mud-tx">${esc(i.resumo || '')}</div>
    <div class="mud-ef"><b>A spec ainda não foi alterada.</b> ${Number.isInteger(i.passo) ? `Passo afetado: ${esc(i.passo)} (e os que dependem dele). ` : ''}${(i.cards || []).length ? `Cards atingidos: ${esc(i.cards.join(', '))}.` : ''}</div>
    <div class="dec-op">${(i.opcoes || []).map((o, k) => bt(k, o.rotulo)).join('')}${bt('nao', 'Não prosseguir', 'dec-nao')}</div></div>`;
}

const VISIVEIS = ['na_fila', 'triagem', 'triando', 'analisando', 'aplicando', 'aplicado', 'erro', 'analisado']; // os demais já foram decididos
function caixaMudancas(l) {
  const vis = l
    .filter((i) => VISIVEIS.includes(i.status) && !(i.status === 'analisado' && i.nivel === 'nenhum'))
    .slice()
    .reverse()
    .slice(0, 5);
  if (!vis.length) return '';
  return `<div class="caixa-t">Mudanças por comentário<span>${vis.length}</span></div><div class="mudancas">${vis
    .map((i) => {
      const [rot, cor] = NIVEL[i.nivel] || ['ANALISANDO', 'var(--ia)'];
      return `<div class="mud" style="--cor:${cor}">
      <div class="mud-l1"><span class="mud-niv">${i.status === 'analisado' ? rot : i.status === 'aplicado' ? 'APLICADA' : i.status === 'erro' ? 'NÃO CONCLUÍDO' : `<span class="vivo-bola"></span>${i.status === 'aplicando' ? 'APLICANDO' : i.status === 'triagem' || i.status === 'triando' ? 'TRIANDO' : 'ANALISANDO'}`}</span>
        <b>${esc(i.autor || 'alguém')}</b><span class="mud-q">${esc(quando(i.data))}</span><a href="${esc(i.link)}">ver comentário</a></div>
      <div class="mud-tx">${esc(i.resumo || (i.texto || '').slice(0, 220))}</div>
      ${['analisado', 'aplicado'].includes(i.status) && i.nivel !== 'nenhum' ? `<div class="mud-ef">${i.passo !== null && i.passo !== undefined ? `Spec voltou ao passo ${esc(i.passo)}. ` : ''}${(i.cards || []).length ? `Cards atingidos: ${esc(i.cards.join(', '))} (revise na aba Tarefas).` : ''}</div>` : ''}
      ${!['na_fila', 'triagem', 'triando', 'analisando', 'aplicando'].includes(i.status) ? `<button class="mud-ok" data-acao="impactoCiente" data-id="${esc(i.id)}">Ciente</button>` : ''}
      ${['aplicado', 'erro'].includes(i.status) && i.snapshot ? `<button class="mud-ok" data-acao="mudancaDesfazer" data-id="${esc(i.id)}" title="Volta a spec e os cards ao estado de antes da aplicação">Desfazer</button>` : ''}
    </div>`;
    })
    .join('')}</div>`;
}

const CSS = `
  .mudancas { display: flex; flex-direction: column; gap: 8px; margin: 0 12px 12px; }
  .mud { position: relative; padding: 9px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--cor); font-size: 12px; }
  .mud-l1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; }
  .mud-niv { display: inline-flex; align-items: center; padding: 0 6px; border-radius: var(--r-sm); font-size: 10px; font-weight: 700; color: var(--on-cor); background: var(--cor); }
  .mud-q { color: var(--text-dim); } .mud-l1 a { color: var(--accent-soft); margin-left: auto; }
  .mud-tx { margin-top: 4px; line-height: 1.45; }
  .mud-ef { margin-top: 4px; font-size: 11px; color: var(--text-dim); }
  .dec-caixa { margin: 0 12px 12px; padding: 10px 12px; border-radius: var(--r-lg); border: 2px solid var(--perigo); background: color-mix(in srgb, var(--perigo) 7%, var(--surface)); font-size: 12px; display: flex; flex-direction: column; gap: 6px; }
  .dec-t { display: flex; align-items: center; gap: 8px; font-size: 12.5px; } .dec-ic { color: var(--perigo); }
  .dec-fila { margin-left: auto; font-size: 10.5px; color: var(--text-dim); }
  .dec-cm { padding: 6px 8px; border-radius: var(--r-md); background: var(--surface-2); font-style: italic; line-height: 1.45; word-break: break-word; }
  .dec-op { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
  .dec-op button { padding: 4px 10px; border-radius: var(--r-md); font-size: 11.5px; font-weight: 600; border: 1px solid var(--border) !important; background: var(--surface) !important; color: var(--text); }
  .dec-op button:first-child { background: var(--accent) !important; color: var(--on-cor); border-color: transparent !important; }
  .dec-op .dec-nao { margin-left: auto; color: var(--perigo); border-color: color-mix(in srgb, var(--perigo) 50%, transparent) !important; }
  .mud-ok { margin-top: 6px; padding: 2px 10px; border: 1px solid var(--border) !important; border-radius: var(--r-md); font-size: 11px; }
`;

module.exports = { caixaDecisao, caixaMudancas, CSS };
