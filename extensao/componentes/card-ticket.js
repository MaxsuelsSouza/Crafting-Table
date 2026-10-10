// @ts-check
const { esc } = require('../infra/ticket')._teste;
const pill = require('./pill');

// Componente "Card do ticket": um <li> da lista de tickets (componentes/lista-tickets.js) com o nome, a chave, a pill do
// status, a pill "refinando" e o número de conversas; e o card "Sem ticket" (a conversa atual do Claude), sempre o último.
// Para usar numa tela: CSS (e pill.CSS) no <style> e card(t) / semTicket() dentro de <ul class="cartoes">. Sem script:
// cliques por data-acao="abrir" e "excluir" (painel.js). data-busca é o texto que a pesquisa da lista procura.
//   t: { chave, titulo?, status?, conversas: [], refinando? }

const SEM_TICKET = '__sem-ticket'; // id do "Sem ticket" no painel (aberto, pastas, abas)
const LIXO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/></svg>';

const conversas = (n) => `${n} conversa${n === 1 ? '' : 's'}`;

const card = (t) => `<li data-acao="abrir" data-id="${esc(t.chave)}" data-busca="${esc(`${t.chave} ${t.titulo || ''} ${t.status || ''}`.toLowerCase())}"${t.refinando ? ' class="refinando"' : ''} title="Abrir o ticket">
    <div class="corpo">
      <div class="nome"><span>${esc(t.titulo || t.chave)}</span></div>
      <div class="det"><span class="chave">${esc(t.chave)}</span>${t.status ? pill.status(t.status) : ''}${t.refinando ? pill.pill('● refinando', { cor: 'ia' }) : ''}
        <span>${conversas(t.conversas.length)}</span></div>
    </div>
    <span class="mini"><button class="perigo" data-acao="excluir" data-id="${esc(t.chave)}" title="Excluir (a pasta vai para _arquivados, nada é apagado)">${LIXO}</button></span></li>`;

const semTicket = () => `<li class="sem-ticket" data-acao="abrir" data-id="${SEM_TICKET}" title="Documentos e notas da conversa atual, sem ticket">
    <div class="corpo"><div class="nome"><span>Sem ticket</span></div><div class="det"><span>conversa atual do Claude</span></div></div></li>`;

// .cartoes e .mini vêm do ESTILO_NOTAS (comandos.js).
const CSS = `
  .cartoes > li { display: flex; align-items: center; gap: 10px; cursor: pointer; }
  .cartoes > li.refinando { border-left: 3px solid var(--ia); }
  .cartoes > li.sem-ticket { border-style: dashed; }
  .cartoes .corpo { flex: 1; min-width: 0; }
  .cartoes .nome { font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; }
  .cartoes .nome span:first-child { overflow: hidden; text-overflow: ellipsis; }
  .cartoes .det { font-size: 10.5px; color: var(--text-dim); margin-top: 3px; display: flex; align-items: center; gap: 8px; }
  .chave { font-family: var(--fc-font); color: var(--accent); font-weight: 600; }
`;

module.exports = { card, semTicket, SEM_TICKET, CSS, _teste: { conversas } };
