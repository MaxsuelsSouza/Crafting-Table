// @ts-check
const { esc } = require('../infra/ticket')._teste;
const { corStatus } = require('../infra/ticket').jira;

// Componente "Pill": a etiqueta arredondada de status. Usado no card do ticket e na caixa de vinculados (lista de tickets)
// e no cabeçalho do ticket aberto (moldura.js: coluna no board, modo refinamento, Sem ticket vinculado).
// Para usar numa tela: CSS no <style> e pill(texto, opções) ou status(st, opções) no corpo. Sem script; redesenhe com a tela.
//   cor: 'novo' | 'andando' | 'ok' (as do status no Jira, ticket.js corStatus) | 'ia' (refinando) | 'pausada'
//   grande: a do cabeçalho (mais alta, com borda e bola); bola: mostra a bola (padrão: só na grande)
// As classes .st-* também dão a cor da folha do ticket (jira.folhaTicket, aba Ticket).

const pill = (texto, { cor = 'novo', dica = '', grande = false, bola = grande } = {}) =>
  `<span class="pill st-${cor}${grande ? ' grande' : ''}"${dica ? ` title="${esc(dica)}"` : ''}>${bola ? '<span class="bola"></span>' : ''}${esc(texto)}</span>`;

// Status do Jira com a cor da coluna (vazio: "Status desconhecido").
const status = (st, o = {}) => pill(st || 'Status desconhecido', { ...o, cor: corStatus(st) });

const CSS = `
  .st-novo { --cor: var(--text-dim); } .st-andando { --cor: var(--warn); } .st-ok { --cor: var(--ok); } .st-ia { --cor: var(--ia); } .st-pausada { --cor: var(--warn); }
  .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; padding: 1px 7px; border-radius: var(--r-pill); white-space: nowrap;
    color: var(--cor); background: color-mix(in srgb, var(--cor) 16%, transparent); }
  .pill.grande { height: 22px; padding: 0 10px; font-size: 11px; font-weight: 600; box-sizing: border-box; cursor: default;
    background: color-mix(in srgb, var(--cor) 14%, transparent); border: 1px solid color-mix(in srgb, var(--cor) 40%, transparent); }
  .pill .bola { width: 7px; height: 7px; border-radius: 50%; background: var(--cor); flex: none; }
`;

module.exports = { pill, status, CSS };
