// @ts-check

// Componente "Menu de abas": a barra do cabeçalho do ticket (Docs, Spec, Ticket, Decisões, Massa, Dúvidas…) e, depois do
// separador, as outras seções do grupo (Evidências, Conversas). Usado no cabeçalho do ticket (painel.js) nas listas
// Tickets, Implementações e QA; cada lista diz quais abas mostra (ABAS em painel.js).
// Para usar numa tela: CSS no <style> e menu(itens, { aba, secao, principal, dentro }) no corpo. Sem script próprio:
// os cliques vão pelo que já existe (data-acao="aba" na página do painel; data-secao/data-aba pelo grupo.js na moldura).
// Redesenhe junto com a tela (aba ou seção trocada, contador mudou).
//   itens: { id, nome, badge?, dica? } = aba da seção principal · { secao, nome } = outra seção · '|' = separador
//   dentro: true na página da própria seção principal; false na moldura em volta de outra seção.

const botao = (it, { aba, secao, principal, dentro }) => {
  const on = it.secao ? secao === it.secao : secao === principal && aba === it.id;
  const alvo = it.secao ? `data-secao="${it.secao}"` : dentro ? `data-acao="aba" data-id="${it.id}"` : `data-secao="${principal}" data-aba="${it.id}"`;
  const badge = it.badge ? ` <span class="ct-badge"${it.dica ? ` title="${it.dica}"` : ''}>${it.badge}</span>` : '';
  return `<button ${alvo}${on ? ' class="is-on"' : ''}>${it.nome}${badge}</button>`;
};

const menu = (itens, o) => `<nav class="ct-menu">${itens.map((it) => (it === '|' ? '<span class="ct-sep"></span>' : botao(it, o))).join('')}</nav>`;

// .ct-badge também é usada no rodapé do painel (sino).
const CSS = `
  .ct-menu { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px; margin-bottom: 8px; border-radius: var(--r-lg);
    background: var(--surface); border: 1px solid var(--border); }
  .ct-menu button { flex: none; height: 24px; padding: 0 7px; border: 0; border-radius: var(--r-md); background: none; cursor: pointer; font: inherit; font-size: 11.5px; color: var(--text); }
  .ct-menu button:hover { background: var(--surface-2); }
  .ct-badge { display: inline-block; min-width: 14px; padding: 0 4px; margin-left: 2px; border-radius: var(--r-pill); font-size: 9.5px; line-height: 14px; text-align: center; background: var(--accent); color: var(--on-cor); font-weight: 600; }
  .ct-menu button.is-on { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); font-weight: 600; }
  .ct-menu .ct-sep { width: 1px; margin: 3px 3px; background: var(--border); }
`;

module.exports = { menu, CSS };
