// @ts-check
const { esc } = require('../infra/ticket')._teste;
const pill = require('./pill');

// Componente "Vinculados": a caixa presa embaixo da lista de tickets (componentes/lista-tickets.js) com os tickets do Jira
// que ainda não estão na lista. Cada módulo (Refinamento, Implementações, QA) diz o título, o seletor do topo e quais status
// do Jira entram (VINCULADOS em lista.js). Clique só mostra o ticket; Puxar traz para a lista; Remover esconde.
// Para usar numa tela: CSS (e pill.CSS) no <style>, caixa(v, lista, o) no corpo e script() no <script>. Na busca do Jira,
// filtrar(itens, o.status) deixa só os status do módulo. Cliques por data-acao: meuVer, meuPuxar, meuRemover, meusAtualizar,
// meusMostrar; os seletores mandam labelQA e meusFiltro (lista.js). Redesenhe quando a busca do Jira voltar.
//   v: { itens, etapas, filtro, label, labels, ocultos, erro, aviso, carregando, semCredencial }
//   o: { titulo, seletor?: 'etapa' | 'label', status?: ['Em andamento|In progress', ...] }
//      status: o primeiro nome de cada item aparece no texto; os outros (depois de |) são o mesmo status com outro nome.

const ATUALIZAR = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13 8a5 5 0 11-1.5-3.6M13 2.5v2.8h-2.8"/></svg>';

// Nome do status sem acento, espaço e caixa: "Não iniciado" = "naoiniciado".
const norm = (st) => String(st || '').normalize('NFD').replace(/[̀-ͯ\s]/g, '').toLowerCase();
// Sem status no módulo: todos.
const filtrar = (itens, status) => {
  if (!status?.length) return itens;
  const ok = new Set(status.flatMap((s) => s.split('|').map(norm)));
  return itens.filter((i) => ok.has(norm(i.status)));
};
// "em A, B ou C" (só o primeiro nome de cada status).
const emStatus = (status) => {
  const n = (status || []).map((s) => s.split('|')[0]);
  return n.length ? ` em ${n.length > 1 ? `${n.slice(0, -1).join(', ')} ou ${n.at(-1)}` : n[0]}` : '';
};

const item = (i) => `<div class="meu" data-acao="meuVer" data-id="${esc(i.key)}" data-busca="${esc(`${i.key} ${i.resumo || ''} ${i.status || ''} ${i.pai || ''}`.toLowerCase())}" title="Ver o ticket">
    <div class="meu-l1"><span class="chave">${esc(i.key)}</span><span class="meu-tipo">${esc(i.tipo || '')}</span>${i.status ? pill.status(i.status) : ''}</div>
    <div class="meu-tit">${esc(i.resumo || '')}</div>
    ${i.pai ? `<div class="meu-pai">↳ subtarefa de ${esc(i.pai)}</div>` : ''}
    <div class="meu-acoes"><button data-acao="meuPuxar" data-id="${esc(i.key)}" title="Trazer para a lista de tickets">↑ Puxar</button>
      <button data-acao="meuRemover" data-id="${esc(i.key)}" title="Tirar desta caixa">✕ Remover</button></div></div>`;

const seletor = (v, o) => {
  if (o.seletor === 'label') return `<select class="meus-etapa" id="filtroLabel" title="Labels do Jira que contêm QA">${['', ...(v.labels || []), ...(v.label && !(v.labels || []).includes(v.label) ? [v.label] : [])].map((l) =>
    `<option value="${esc(l)}" ${(v.label || '') === l ? 'selected' : ''}>${esc(l || 'Escolha a label')}</option>`).join('')}</select>`;
  if (o.seletor !== 'etapa') return '';
  const opcoes = [['', 'Abertos'], ...(v.etapas || []).map((e) => [e, e])];
  if (v.filtro && !(v.etapas || []).includes(v.filtro)) opcoes.push([v.filtro, v.filtro]);
  return `<select class="meus-etapa" id="filtroMeus" title="Filtrar pela etapa do ticket no board">${opcoes.map(([val, rot]) =>
    `<option value="${esc(val)}" ${(v.filtro || '') === val ? 'selected' : ''}>${esc(rot)}</option>`).join('')}</select>`;
};

// lista: os tickets já na lista (saem da caixa).
function caixa(v, lista, o) {
  if (!v) return '';
  const naLista = new Set(lista.map((t) => t.chave)), ocultos = new Set(v.ocultos || []);
  const itens = (v.itens || []).filter((i) => !naLista.has(i.key) && !ocultos.has(i.key));
  const escondidos = (v.itens || []).filter((i) => ocultos.has(i.key)).length;
  const porLabel = o.seletor === 'label';
  const corpo = v.semCredencial ? '<div class="meus-vazio">Conecte ao Jira para ver os tickets vinculados a você. <button class="link" data-acao="meusAtualizar">Conectar</button></div>'
    : v.erro ? `<div class="meus-vazio erro">${esc(v.erro)}</div>`
    : !v.itens ? '<div class="meus-vazio">Carregando do Jira…</div>'
    : porLabel && !v.label ? '<div class="meus-vazio">Escolha a label de QA no seletor acima.</div>'
    : !itens.length ? `<div class="meus-vazio">Nada novo ${porLabel ? `com a label ${esc(v.label)}` : 'vinculado a você'}${esc(emStatus(o.status))}.</div>`
    : itens.map(item).join('');
  return `<div class="meus"><div class="meus-t">${esc(o.titulo)}<span>${seletor(v, o)}
    ${v.itens ? itens.length : ''}
    <button class="ct-ico" data-acao="meusAtualizar" title="Atualizar do Jira">${v.carregando ? '…' : ATUALIZAR}</button></span></div>
    ${v.aviso ? `<div class="meus-vazio erro">${esc(v.aviso)}</div>` : ''}<div class="meus-lista">${corpo}</div>
    ${escondidos ? `<button class="meus-ocultos" data-acao="meusMostrar">${escondidos} removido${escondidos > 1 ? 's' : ''} · mostrar de novo</button>` : ''}</div>`;
}

// Script da webview: os seletores do topo pedem a busca de novo. Espera `enviar` (postMessage) já definido.
const script = () => `
  document.getElementById('filtroLabel')?.addEventListener('change', (e) => enviar({ acao: 'labelQA', id: e.target.value }));
  document.getElementById('filtroMeus')?.addEventListener('change', (e) => enviar({ acao: 'meusFiltro', id: e.target.value }));`;

// .ct-ico vem do cabeçalho (moldura.js CSS_MOLDURA); .chave do card-ticket.
const CSS = `
  .meus { flex: none; display: flex; flex-direction: column; max-height: 45vh; margin: 8px 12px 12px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--sombra); overflow: hidden; }
  .meus-t { display: flex; align-items: center; justify-content: space-between; padding: 6px 6px 6px 12px; font-size: 10px; font-weight: 600;
    letter-spacing: .06em; text-transform: uppercase; color: var(--text-dim); border-bottom: 1px solid var(--border); }
  .meus-t > span { display: inline-flex; align-items: center; gap: 4px; letter-spacing: 0; }
  .meus-etapa { max-width: 150px; height: 24px; padding: 0 22px 0 8px; border: 1px solid var(--border); border-radius: var(--r-md); font: inherit;
    font-size: 11px; letter-spacing: 0; text-transform: none; color: var(--text); background: var(--surface-2); cursor: pointer; appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%239a9aa4' stroke-width='1.8'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 5px center; background-size: 12px; }
  .meus-etapa:focus { outline: none; border-color: var(--accent); }
  .meus-t .ct-ico { width: 24px; height: 24px; } .meus-t .ct-ico svg { width: 13px; height: 13px; }
  .meus-lista { flex: 1; min-height: 0; overflow-y: auto; }
  .meu { padding: 8px 12px; border-bottom: 1px solid var(--border); cursor: pointer; font-size: 12px; opacity: .62; transition: opacity 120ms; }
  .meu:last-child { border-bottom: 0; }
  .meu:hover { opacity: 1; background: var(--surface-2); }
  .meu-acoes { display: flex; gap: 12px; margin-top: 5px; }
  .meu-acoes button { padding: 0; font-size: 11px; color: var(--text-dim); }
  .meu-acoes button:hover { color: var(--accent); text-decoration: underline; }
  .meus-ocultos { flex: none; padding: 5px 12px; font-size: 10.5px; color: var(--text-dim); text-align: left; border-top: 1px solid var(--border) !important; }
  .meus-ocultos:hover { color: var(--accent); }
  .meu-l1 { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; }
  .meu-l1 .pill { margin-left: auto; }
  .meu-tipo { color: var(--text-dim); }
  .meu-tit { margin-top: 2px; line-height: 1.4; word-break: break-word; }
  .meu-pai { margin-top: 2px; font-size: 11px; color: var(--text-dim); }
  .meus-vazio { padding: 12px; font-size: 12px; color: var(--text-dim); }
  .meus-vazio.erro { color: var(--danger); }
  .meus-vazio .link { color: var(--accent); text-decoration: underline; }
`;

module.exports = { caixa, filtrar, script, CSS, _teste: { emStatus } };
