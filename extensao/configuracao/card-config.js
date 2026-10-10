// @ts-check
const { esc } = require('../ticket')._teste;
const { botao } = require('../componentes/botao');

// Componente "Card de configuração": a caixa de cada seção das Configurações (Instalação, Agente de IA, Jira, Board, Repositórios,
// Banco, Teams, Plugins, Extensão). Usado só por configuracao.js (mesma pasta). Para usar: CSS no <style> e card(...) no corpo;
// sem script (os botões mandam data-acao: cfgEditar, cfgTestar… em painel.js). Redesenhe com a tela.
//   card({ titulo, selo?, acao?, msg?, corpo }): selo = a etiqueta de estado ao lado do título · acao = botão à direita do título
//   cardTeste(id, titulo, estado, corpo): card com o estado do teste (✅ ok / ⚠ motivo / testando…) e o botão Testar
//   linha(rotulo, valor, idEditar?, extra?, dicaRotulo?) · dica(texto) · acoes(html): peças do corpo

// estado: { ok, curto?, texto? } do teste de cada seção (painel.js CHECAR); sem estado = ainda testando.
const selo = (x) => (!x ? '<span class="cfg-st cfg-esp">testando…</span>' : x.ok ? '<span class="cfg-st cfg-ok">✅ ok</span>' : `<span class="cfg-st cfg-mal">⚠ ${esc(x.curto || 'atenção')}</span>`);

const card = ({ titulo, selo = '', acao = '', msg = '', corpo = '' }) => `<div class="cfg-card"><div class="cfg-t"><b>${titulo}</b>${selo}${acao}</div>${msg}${corpo}</div>`;

const cardTeste = (id, titulo, x, corpo) => card({ titulo, selo: selo(x), acao: botao('Testar', { variante: 'contorno', acao: 'cfgTestar', id }),
  msg: x?.texto ? `<div class="cfg-msg ${x.ok ? '' : 'mal'}">${esc(x.texto)}</div>` : '', corpo });

// Linha "rótulo  valor  [Editar]"; valor é HTML (já escapado por quem chama).
const linha = (rotulo, valor, idEditar = '', extra = '', dicaRotulo = '') => `<div class="cfg-l"><span${dicaRotulo ? ` title="${esc(dicaRotulo)}"` : ''}>${rotulo}</span><div>${valor || '<i>—</i>'}</div>${extra}${idEditar ? botao('Editar', { variante: 'contorno', acao: 'cfgEditar', id: idEditar }) : ''}</div>`;
const dica = (texto) => `<div class="cfg-dica">${texto}</div>`;
const acoes = (html) => `<div class="cfg-acoes-linha">${html}</div>`;

const CSS = `
  .cfg-card { padding: 10px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--sombra); font-size: 12px; }
  .cfg-t { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; } .cfg-t b { font-size: 12.5px; }
  .cfg-t .bt { margin-left: auto; }
  .cfg-st { font-size: 10.5px; padding: 0 6px; border-radius: var(--r-pill); } .cfg-ok { color: var(--ok); } .cfg-mal { color: var(--warn); } .cfg-esp { color: var(--text-dim); }
  .cfg-msg { font-size: 11px; color: var(--text-dim); margin-bottom: 6px; white-space: pre-line; } .cfg-msg.mal { color: var(--warn); }
  .cfg-l { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-top: 1px solid var(--border); }
  .cfg-l > span { flex: none; width: 110px; color: var(--text-dim); } .cfg-l > div { flex: 1; min-width: 0; word-break: break-word; }
  .cfg-dim { color: var(--text-dim); font-size: 11px; } .cfg-mal { font-size: 11px; }
  .cfg-dica { font-size: 11px; color: var(--text-dim); margin: 4px 0 6px; }
  .cfg-acoes-linha { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
`;

module.exports = { card, cardTeste, selo, linha, dica, acoes, CSS };
