// @ts-check
const aoVivo = require('../../componentes/ao-vivo');
const cardCenario = require('../../componentes/card-cenario');
const caixaEtapas = require('../../componentes/caixa-etapas');
const { FC } = require('../../componentes/marca');

// Bloco do topo da seção Evidências no QA: cartão do planejamento + Ao vivo. Botões vão ao painel (data-painel, grupo.js).
const CSS = `<style>${caixaEtapas.CSS}${aoVivo.CSS}${cardCenario.CSS}
  .caixa-t { margin: 0 12px 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); display: flex; gap: 6px; }
  .caixa-t span { margin-left: auto; text-transform: none; letter-spacing: 0; }
  .papel-massa { margin: 6px 0; padding: 8px 10px; border-radius: var(--r-lg); background: ${FC.bg}; color: ${FC.text}; box-shadow: 0 4px 16px rgb(0 0 0 / 16%); font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; line-height: 1.55; user-select: text; }
  .papel-massa .campo { display: flex; gap: 8px; align-items: baseline; }
  .papel-massa .k { font-weight: 700; flex: none; } .papel-massa .k::after { content: ' ='; }
  .papel-massa .v { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .papel-massa .copiar { flex: none; background: transparent; color: inherit; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 4px; padding: 0 5px; opacity: .55; cursor: pointer; }
  .papel-massa .copiar:hover { opacity: 1; }
  .qa-card { margin: 10px 12px; padding: 10px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); font-size: 12px; }
  .qa-card.linha { display: flex; align-items: center; gap: 8px; }
  .qa-card.linha b { margin: 0; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qa-card.linha .dim { font-weight: 400; color: var(--text-dim); }
  .qa-card.linha .arquivo { margin: 0; flex: none; }
  .qa-card.bloq { border-left: 3px solid var(--warn); }
  .qa-card b { display: block; font-size: 12.5px; margin-bottom: 2px; }
  .qa-card p { margin: 0; color: var(--text-dim); line-height: 1.5; }
  .qa-card button { margin-top: 8px; height: 26px; padding: 0 10px; border: 0; border-radius: var(--r-md); background: var(--accent); color: var(--on-cor); font-weight: 600; cursor: pointer; }
  .qa-card button[disabled] { opacity: .6; cursor: default; }
  .qa-card .arquivo { display: inline-flex; gap: 2px; margin-top: 8px; }
  .qa-card .arquivo .fb-btn { margin: 0; height: 24px; padding: 0 7px; background: transparent; color: var(--text); font-weight: 400; }
  .qa-card .arquivo .fb-btn:hover { background: var(--surface-2); }
  .acoes-passo { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .qa-card .acoes-passo button { margin: 0; height: 26px; padding: 0 10px; border-radius: var(--r-md); font-size: 11.5px; font-weight: 600; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
  .qa-card .acoes-passo button.aprovar { background: var(--ok); color: var(--on-cor); border-color: transparent; }
  .qa-card .acoes-passo button:disabled, .qa-card .acoes-passo button.travado { opacity: .45; cursor: not-allowed; }
  .qa-card .sec { background: none; border: 1px solid var(--border); color: var(--text); font-weight: 400; margin-left: 4px; }
  .qa-card.proc { position: relative; opacity: .55; filter: brightness(.8); pointer-events: none; }
  .qa-card.proc::after { content: ''; position: absolute; top: 50%; left: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; border: 3px solid var(--text-dim); border-top-color: var(--accent); animation: qa-gira .8s linear infinite; }
  @keyframes qa-gira { to { transform: rotate(360deg); } }
  .cens { margin: 0 12px 12px; display: flex; flex-direction: column; gap: 6px; }
</style>`;

module.exports = { CSS };
