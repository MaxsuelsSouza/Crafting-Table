// @ts-check

// Componente "Menu de módulos": Refinamento · Implementações · QA no topo da lista de tickets (componentes/lista-tickets.js).
// Para usar numa tela: CSS no <style> e menu(modo, extra) no corpo. Sem script: o clique vai por data-acao="listaModo"
// (painel.js). Redesenhe com a tela (módulo trocado).
//   modo: id do módulo ligado · extra: HTML à direita (a contagem de tickets)

const MODULOS = [['refinamento', 'Refinamento', 'Tickets em refinamento (spec SDD)'], ['impl', 'Implementações', 'Tickets em implementação'], ['qa', 'QA', 'Tickets para testar (pela label de QA)']];
const nome = (modo) => MODULOS.find(([id]) => id === modo)?.[1] || modo;

const menu = (modo, extra = '') => `<div class="topo">${MODULOS.map(([id, nome, dica]) =>
  `<span class="rotulo ${modo === id ? 'is-on' : ''}" data-acao="listaModo" data-id="${id}" title="${dica}">${nome}</span>`).join('')}<span class="titulo"></span>
  <span class="extra">${extra}</span></div>`;

// .topo, .rotulo e .extra vêm do ESTILO_NOTAS (comandos.js); aqui só o rótulo clicável e o ligado.
const CSS = `
  .topo .rotulo[data-acao] { cursor: pointer; } .topo .rotulo[data-acao]:hover { color: var(--accent); }
  .topo .rotulo.is-on { color: var(--text); font-weight: 600; text-decoration: underline 2px var(--accent); text-underline-offset: 5px; }
`;

module.exports = { menu, nome, CSS };
