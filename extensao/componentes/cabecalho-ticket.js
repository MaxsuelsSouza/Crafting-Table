// @ts-check
const { botoes } = require('./botoes-ticket');

// Componente "Cabeçalho do ticket": o <header> fixo do ticket aberto, montado a partir dos pedaços (botões, título, pills, menu).
// AINDA NÃO É USADO: o cabeçalho em uso continua sendo cabecalho() de painel/moldura.js (mesmo desenho, mesmos botões de botoes-ticket.js).
// Trocar um pelo outro está em FAZER-QUANDO-DER.md. O CSS (.ct-cab, .ct-linha, .ct-titulo, .ct-pills…) segue em CSS_MOLDURA (moldura.js).
// Para usar: cabecalho({ ctx, titulo, pills, menu, roxo?, botoes? }) no topo da tela do ticket.
//   ctx: o contexto de botoes-ticket.js · titulo: HTML do título (chave · nome) · pills: HTML das pills de status e tipo
//   menu: HTML do menu de abas (menu-abas.js) · roxo: HTML da borda do modo refinamento · botoes: { visiveis, extras } de botoes-ticket.js

const cabecalho = ({ ctx, titulo, pills, menu, roxo = '', botoes: o }) => `<header class="ct-cab"><div class="ct-linha">
      ${botoes(ctx, 'esquerda', o)}
      <span class="ct-titulo">${titulo}</span>
      ${botoes(ctx, 'direita', o)}
    </div>
    <div class="ct-pills">${pills}
      ${botoes(ctx, 'pills', o)}</div>
    ${roxo}
    ${menu}
  </header>`;

module.exports = { cabecalho };
