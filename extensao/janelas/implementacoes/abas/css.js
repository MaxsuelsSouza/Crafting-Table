// @ts-check
// CSS das abas Esteira e Dossiê (caixa de etapas, pausa, resumo, documento do dossiê e tabela das subtarefas) e o botão das abas.
const caixaEtapas = require('../../../componentes/caixa-etapas');

const CSS = `<style>${caixaEtapas.CSS}
  .es-obs { width: 100%; box-sizing: border-box; min-height: 90px; resize: vertical; padding: 8px 10px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font: 12.5px/1.5 var(--fc-font); }
  .es-obs:focus { outline: none; border-color: var(--accent); }
  .es-barra { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .es-pausa { border-left: 3px solid var(--accent); padding-left: 10px; font-size: 12.5px; line-height: 1.55; }
  .es-pausa p { margin: 0 0 8px; }
  .es-resumo { font-size: 12px; line-height: 1.6; } .es-resumo b { color: var(--text); }
  .es-doc h3, .es-doc h4, .es-doc h5 { margin: 12px 0 4px; } .es-doc ul { margin: 4px 0; padding-left: 18px; } .es-doc li, .es-doc p { font-size: 12.5px; line-height: 1.55; }
  .es-doc pre { overflow: auto; }
  .es-tab { width: 100%; border-collapse: collapse; font-size: 12px; } .es-tab th, .es-tab td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
  .es-tab th { color: var(--text-dim); font-weight: 600; } .es-tab small { color: var(--text-dim); }
</style>`;
const btn = (txt, acao, extra = '', cls = 'bt bt-contorno') =>
  `<button class="${cls}" data-acao="${acao}"${extra}>${txt}</button>`;

module.exports = { CSS, btn };
