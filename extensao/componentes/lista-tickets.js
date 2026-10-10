// @ts-check
const menuModulos = require('./menu-modulos');
const cardTicket = require('./card-ticket');
const vinculados = require('./vinculados');

// Componente "Lista de tickets": a tela inicial do painel (lista.js), igual nos três módulos (Refinamento, Implementações, QA):
// menu de módulos, barra com pesquisa, ↑↓ (ordem) e ＋ Ticket (sempre visíveis), os cards dos tickets com o card Sem ticket
// por último, e a caixa de vinculados presa embaixo.
// Para usar numa tela: CSS e pill.CSS no <style>, corpo(lista, meus, { modo, vinculados }) no corpo e script(chave) e
// vinculados.script() no <script>. Cliques por data-acao: listaModo, novo, abrir, excluir e os da caixa (painel.js).
// Redesenhe quando a lista ou a busca do Jira mudar.
//   lista: tickets do módulo ({ chave, titulo, status, conversas, refinando }) · meus/vinculados: ver componentes/vinculados.js

const LUPA = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>';

const corpo = (lista, meus, { modo, vinculados: o }) => `<div class="rolagem">
  ${menuModulos.menu(modo, lista.length ? `${lista.length} ticket${lista.length === 1 ? '' : 's'}` : '')}
  <div class="barras"><label class="busca-t">${LUPA}<input id="filtroT" type="search" placeholder="Pesquisar" title="Pesquisa por chave, título ou status (Esc limpa)" spellcheck="false"></label>
    <button class="ordem-t" id="ordemT" title="Mais recentes primeiro (clique para inverter)">↑↓</button>
    <button class="primario" data-acao="novo" title="Adicionar ticket pelo link do Jira">＋ Ticket</button></div>
  <ul class="cartoes" id="listaT">${lista.map(cardTicket.card).join('')}${cardTicket.semTicket()}</ul>
  <p class="nada-t" id="nadaT" hidden>Nenhum ticket encontrado.</p>
  ${lista.length ? '' : '<div class="folha"><div class="centro"><div class="icone">🎫</div>Nenhum ticket ainda.<br>Clique em <b>＋ Ticket</b> e cole o link do Jira.</div></div>'}
  </div>
  ${vinculados.caixa(meus, lista, o)}`;

// Script da webview: pesquisa por chave/título/status (nos cards e na caixa de vinculados) e ↑↓ inverte a ordem; Sem ticket
// fica sempre por último. chave: nome no vscode.getState() da ordem escolhida. Espera `vscode` (acquireVsCodeApi) já definido.
const script = (chave = 'ticketsAntigos') => `{
  const filtroT = document.getElementById('filtroT');
  if (filtroT) {
    const ul = document.getElementById('listaT'), semT = ul.querySelector('.sem-ticket'), nada = document.getElementById('nadaT'), ordem = document.getElementById('ordemT');
    const itens = [...ul.querySelectorAll('li[data-busca]')];
    let antigos = !!(vscode.getState() || {})[${JSON.stringify(chave)}];
    const aplicar = () => {
      const q = filtroT.value.trim().toLowerCase();
      (antigos ? [...itens].reverse() : itens).forEach((li) => { li.hidden = !!q && !li.dataset.busca.includes(q); ul.insertBefore(li, semT); });
      semT.hidden = !!q;
      nada.hidden = !q || itens.some((li) => !li.hidden);
      document.querySelectorAll('.meu[data-busca]').forEach((m) => { m.hidden = !!q && !m.dataset.busca.includes(q); });
      ordem.classList.toggle('is-on', antigos);
      ordem.title = antigos ? 'Mais antigos primeiro (clique para inverter)' : 'Mais recentes primeiro (clique para inverter)';
    };
    filtroT.addEventListener('input', aplicar);
    filtroT.addEventListener('keydown', (e) => { if (e.key === 'Escape') { filtroT.value = ''; aplicar(); } });
    ordem.addEventListener('click', () => { antigos = !antigos; vscode.setState({ ...(vscode.getState() || {}), [${JSON.stringify(chave)}]: antigos }); aplicar(); });
    aplicar();
  }
}`;

// .topo, .barras, .primario, .folha e .centro vêm do ESTILO_NOTAS (comandos.js).
const CSS = `
  .busca-t { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 8px; border: 1px solid var(--border);
    border-radius: var(--r-md); background: var(--surface); color: var(--text-dim); }
  .busca-t:focus-within { border-color: var(--accent); }
  .busca-t svg { width: 13px; height: 13px; flex: none; }
  .busca-t input { flex: 1; min-width: 0; height: 26px; border: 0; outline: 0; background: none; color: var(--text); font: inherit; font-size: 12px; }
  .ordem-t { flex: none; width: 30px; height: 30px; border: 1px solid var(--border) !important; border-radius: var(--r-md); background: var(--surface) !important; font-size: 13px; }
  .ordem-t:hover { border-color: var(--accent) !important; }
  .ordem-t.is-on { color: var(--accent); }
  .nada-t { margin: 4px 12px; font-size: 12px; color: var(--text-dim); }
  ${menuModulos.CSS}${cardTicket.CSS}${vinculados.CSS}
`;

module.exports = { corpo, script, CSS };
