// @ts-check
const path = require('path');
const { esc } = require('../ticket')._teste;
const notas = require('../notas').editor;

// Componente "Aba Docs": a primeira aba do menu do ticket, igual em todas as listas (Refinamento, Implementações, QA e Sem ticket).
// Três caixas: Documentos (clique abre, @ menciona no Claude), Encontrados no ticket (anexos do Jira ainda não baixados) e Notas.
// Usado em corpoAba (painel.js).
// Para usar numa tela: CSS no <style> e corpo(d, semTicket) no corpo. O script é o do editor de notas (notas.scriptNotas,
// posto pela pagina() do painel quando a aba é docs). Cliques pelo data-acao que já existe: docAbrir, docMencionar,
// anexoBaixar, anexoTodos (painel.js). Redesenhe quando a pasta do ticket mudar (o painel já vigia, menos as notas).
//   d: { docs (documentos.listar), origens (.origem.json), jira (anexos), baixando (Set de ids), dir }

const sigla = (nome) => esc(path.extname(nome).slice(1, 5).toUpperCase() || 'ARQ');
const kb = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
// Anexos do ticket que ainda não foram baixados (os baixados estão no .origem.json com o id do Jira).
const pendentes = (anexos, origens) => {
  const baixados = new Set(Object.values(origens || {}).map((o) => o.id));
  return (anexos || []).filter((a) => !baixados.has(a.id));
};

const corpo = (d, semTicket) => {
  const docs = d.docs.length ? d.docs.map((x) => `<div class="linha-doc" data-acao="docAbrir" data-id="${esc(x.nome)}" title="${esc(x.origem || x.full)}">
      <span class="sigla">${sigla(x.nome)}</span><span class="nome">${esc(x.nome)}</span>
      ${d.origens[x.nome]?.origem === 'jira' ? '<span class="selo" title="Baixado dos anexos do Jira">↓ Jira</span>' : ''}
      <span class="mini"><button data-acao="docMencionar" data-id="${esc(x.nome)}" title="Mencionar no Claude">@</button></span></div>`).join('')
    : `<div class="vazio-aba">${semTicket && !d.dir ? 'Nenhuma conversa do Claude aberta ainda.' : 'Nenhum documento ainda. O que o Claude criar aparece aqui.'}</div>`;
  // Pendentes ficam apagados, com botão de baixar. Baixado, sobe para Documentos.
  const pend = pendentes(d.jira?.anexos, d.origens);
  const caixaPend = pend.length ? `<div class="caixa-t">Encontrados no ticket<span>${pend.length > 1 ? '<button class="baixar" data-acao="anexoTodos">↓ Baixar todos</button>' : ''}</span></div>
    <div class="folha pendentes">${pend.map((a) => `<div class="linha-doc" title="${esc(a.nome)}">
      <span class="sigla">${sigla(a.nome)}</span><span class="nome">${esc(a.nome)}</span>${a.de ? `<span class="selo" title="Anexo de outro ticket da mesma feature">↑ ${esc(a.de)}</span>` : ''}
      <span class="tam">${kb(a.tamanho || 0)}</span>
      <button class="baixar" data-acao="anexoBaixar" data-id="${esc(a.id)}" ${d.baixando.has(a.id) ? 'disabled' : ''}>${d.baixando.has(a.id) ? 'Baixando…' : '↓ Baixar'}</button></div>`).join('')}</div>` : '';
  return `<div class="caixa-t">Documentos<span>${d.docs.length || ''}</span></div><div class="folha">${docs}</div>${caixaPend}
  <div class="caixa-t">Notas</div>
  <div class="notas-caixa">${notas.corpoNotas(semTicket ? 'Notas desta conversa…' : 'Notas do ticket…')}</div>`;
};

const CSS = `
  .linha-doc { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-radius: var(--r-md); cursor: pointer; }
  .linha-doc:hover { background: var(--surface-2); }
  .sigla { flex: none; width: 30px; height: 30px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700;
    color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .linha-doc .nome { flex: 1; min-width: 0; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .linha-doc .mini { opacity: 0; }
  .linha-doc:hover .mini { opacity: 1; }
  .selo { flex: none; font-size: 9.5px; padding: 0 6px; border-radius: var(--r-pill); border: 1px solid color-mix(in srgb, var(--accent-soft) 45%, transparent); color: var(--accent-soft); }
  .pendentes { border-style: dashed; }
  .pendentes .linha-doc { opacity: .45; cursor: default; transition: opacity 140ms; }
  .pendentes .linha-doc:hover { opacity: .8; background: none; }
  .pendentes .tam { flex: none; font-size: 10.5px; color: var(--text-dim); }
  .baixar { flex: none; height: 24px; padding: 0 8px; border-radius: var(--r-md); border: 1px solid var(--border) !important; background: var(--surface-2) !important; font-size: 11px; }
  .baixar:hover { border-color: var(--accent) !important; color: var(--accent); }
  .notas-caixa .papel { min-height: 280px; }
  .caixa-t .baixar { height: 20px; font-size: 10.5px; text-transform: none; letter-spacing: 0; }
`;

module.exports = { corpo, pendentes, CSS, _teste: { kb } };
