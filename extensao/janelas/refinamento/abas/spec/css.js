// @ts-check
// CSS da aba Spec: passos, cartão Agora e pilha de perguntas.
const caixaEtapas = require('../../../../componentes/caixa-etapas');

const CSS = `${caixaEtapas.CSS}
  .passo-subs { margin: 8px 0 0 30px; }
  /* Constituição: os 7 passos do SDD — cinza até acontecer */
  .sdd-topo { font-size: 11.5px; color: var(--text-dim); margin-bottom: 10px; line-height: 1.5; }
  .sdd-topo b { color: var(--text); }
  .passos { display: flex; flex-direction: column; gap: 8px; }
  .passo { border-radius: var(--r-lg); border: 1px solid var(--border); background: var(--surface-2); padding: 9px 10px; }
  .passo .cab { display: flex; align-items: center; gap: 8px; }
  .num { flex: none; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
    background: var(--border); color: var(--text-dim); }
  .passo .nome { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; }
  .passo .st { flex: none; font-size: 10px; padding: 1px 7px; border-radius: var(--r-pill); border: 1px solid var(--border); color: var(--text-dim); }
  .passo .corpo-passo { margin: 8px 0 0 30px; font-size: 11.5px; color: var(--text-dim); line-height: 1.55; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
  .chip { font-size: 10.5px; padding: 0 7px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .chip.alerta { color: var(--perigo); border-color: color-mix(in srgb, var(--perigo) 45%, transparent); }
  .arquivo { display: inline-flex; gap: 2px; margin-top: 6px; }
  .acoes-passo { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .acoes-passo button { height: 26px; padding: 0 10px; border-radius: var(--r-md); font-size: 11.5px; font-weight: 600; border: 1px solid var(--border) !important; background: var(--surface) !important; color: var(--text); }
  .acoes-passo button.aprovar { background: var(--ok) !important; color: var(--on-cor); border-color: transparent !important; }
  .acoes-passo button:disabled, .acoes-passo button.travado { opacity: .45; cursor: not-allowed; }
  .motivo { color: var(--perigo); }
  .lista-mini { margin: 4px 0 0; padding-left: 14px; }
  .lista-mini li { margin: 2px 0; }
  .s-pendente { opacity: .45; filter: grayscale(1); }
  .s-em_andamento { border-color: var(--accent); animation: pulsa 1.6s infinite; }
  .s-em_andamento .num { background: var(--accent); color: var(--on-cor); }
  @keyframes pulsa { 50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); } }
  .s-aguardando_revisao { border-color: var(--warn); }
  .s-aguardando_revisao .num { background: var(--warn); color: var(--on-cor); }
  .s-aguardando_revisao .st { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 50%, transparent); }
  .s-aprovado { border-color: color-mix(in srgb, var(--ok) 55%, transparent); background: color-mix(in srgb, var(--ok) 8%, var(--surface-2)); }
  .s-aprovado .num { background: var(--ok); color: var(--on-cor); }
  .s-aprovado .st { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
  .s-desatualizado { border-color: var(--warn); }
  .s-desatualizado .num { background: var(--warn); color: var(--on-cor); }
  .s-desatualizado .st { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 50%, transparent); }
  .aguardando { color: var(--warn); }
  .agora { margin: 0 12px 10px; padding: 10px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border);
    border-left: 3px solid var(--ia); box-shadow: var(--sombra); font-size: 12px; line-height: 1.5; }
  .agora .atitulo { font-weight: 600; font-size: 12.5px; display: flex; align-items: center; }
  .agora .atexto { color: var(--text-dim); margin-top: 2px; }
  .agora .aacoes { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
  .agora .aacoes > .primario { align-self: flex-start; height: 28px; }
  .pilha-t { display: flex; justify-content: space-between; align-items: center; margin: 0 12px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-dim); }
  .pilha { position: relative; margin: 0 12px 26px; }
  .pilha::before, .pilha::after { content: ''; position: absolute; left: 10px; right: 10px; height: 100%; border-radius: var(--r-lg);
    background: var(--surface); border: 1px solid var(--border); z-index: 0; display: none; }
  .pilha::before { top: 7px; opacity: .75; } .pilha::after { top: 14px; left: 20px; right: 20px; opacity: .45; }
  .pilha.atras-1::before, .pilha.atras-2::before, .pilha.atras-2::after { display: block; }
  .pnav { display: inline-flex; align-items: center; gap: 2px; text-transform: none; letter-spacing: 0; font-size: 11px; }
  .pnav button { width: 22px; height: 22px; border-radius: var(--r-md); color: var(--text); display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }
  .pnav button:hover { background: var(--surface-2); }
  .pnav button svg { width: 13px; height: 13px; }
  .ptam { display: inline-flex; gap: 2px; margin: 0 2px; padding: 0 2px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
  .pnav #pPos { min-width: 42px; text-align: center; }
  .pilha.grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--pw, 240px), 100%), 1fr)); gap: 10px; margin-bottom: 12px; }
  .pilha.grade::before, .pilha.grade::after { display: none !important; }
  .pilha.grade .pcard { min-height: 0; max-height: none; animation: none; }
  .pnav button.is-on { background: color-mix(in srgb, var(--ia) 22%, transparent); color: var(--ia); }
  .pcard { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 8px; min-height: 200px; max-height: 320px; overflow: auto;
    padding: 14px 14px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--ia);
    box-shadow: var(--sombra); animation: sobe 220ms ease-out; }
  @keyframes sobe { from { transform: translateY(8px); opacity: 0; } }
  .pcab { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); }
  .pcab b { color: var(--ia); }
  .pcard .ptexto { font-size: 13px; font-weight: 600; line-height: 1.45; }
  .pcard .pctx { font-size: 11.5px; color: var(--text-dim); line-height: 1.45; }
  .popcoes { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
  .popcoes button { padding: 7px 10px; border: 1px solid var(--border) !important; border-radius: var(--r-md); background: var(--surface-2) !important;
    font-size: 12px; text-align: left; line-height: 1.35; }
  .popcoes button:hover { border-color: var(--ia) !important; }
  .prod { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 10px; margin-top: auto; padding-top: 4px; }
  .prod button { white-space: nowrap; }
  .prod button { font-size: 11.5px; color: var(--text-dim); padding: 2px 0; }
  .prod button:hover { color: var(--text); text-decoration: underline; }
  .prod .duv { color: var(--accent); }
  .passo.s-atencao { border-color: #f58a1f; background: color-mix(in srgb, #f58a1f 12%, var(--surface-2)); opacity: 1; filter: none; }
  .passo.s-atencao .num { background: #f58a1f; color: var(--on-cor); }
  .aten { flex: none; color: #f58a1f; font-size: 13px; cursor: help; }
`;

module.exports = { CSS };
