// @ts-check
// Regras exclusivas das dúvidas (.dtrecho, .decisao, .hist, .quando, .origem e .acoes-aba são da aba Decisões também e ficam em moldura.js).
const CSS = `.duvida { padding: 4px 0 10px 12px; }
  .duvida .dlinha { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; }
  .duvida .dtexto { margin: 4px 0; font-size: 12.5px; line-height: 1.5; }
  .duvida .enviar { border: 1px solid var(--border); margin-top: 6px; }
  .duvida summary { text-transform: none; letter-spacing: 0; font-size: 11.5px; font-weight: 400; color: inherit; margin: 0; }
  .duvida .dtexto { display: block; margin-top: 4px; }
  .caixa-enviadas { margin-top: 14px; padding: 8px; border-radius: var(--r-md); background: var(--surface-2); }
  .caixa-enviadas .titulo-caixa { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); margin-bottom: 6px; }
  .duvida.enviada { opacity: .6; } .duvida.enviada:hover, .duvida.enviada[open] { opacity: .9; }
  .duvida .sug { border-left: 3px solid var(--accent); padding-left: 8px; }
`;

module.exports = { CSS };
