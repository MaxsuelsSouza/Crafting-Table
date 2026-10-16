// @ts-check
// Aba Conhecimentos (painel): o que a IA do QA já descobriu e reaproveita em todos os tickets, agrupado por tipo.
// A IA procura antes de descobrir e grava o que achou (qa-state conhecimento); aqui você busca, corrige, apaga e define a tela de início.
const k = require('../conhecimentos');
const { dataBr } = require('../../../componentes/card-cenario');
const { esc } = require('./comum');
const { CSS } = require('./css');

const CSS_K = `<style>
  .k-item { padding: 8px 10px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--border); font-size: 12px; }
  .k-item .k-cab { display: flex; gap: 6px; align-items: baseline; }
  .k-item .k-cab b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .k-item .k-id { color: var(--text-dim); font-size: 10.5px; }
  .k-item pre { margin: 6px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 11px; color: var(--text); max-height: 180px; overflow: auto; }
  .k-item .k-rod { margin-top: 4px; color: var(--text-dim); font-size: 10.5px; display: flex; gap: 8px; align-items: center; }
  .k-item .k-rod button { margin-left: auto; background: none; border: 0; color: var(--text-dim); cursor: pointer; font-size: 11px; padding: 0 4px; }
  .k-item .k-rod button:hover { color: var(--accent); }
  details.k-grupo > summary { cursor: pointer; margin: 8px 12px 4px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); }
  .k-flow { display: flex; gap: 6px; align-items: center; margin-top: 4px; }
  .k-ok { color: var(--ok); } .k-falta { color: var(--warn); }
</style>`;

function item(i) {
  const usos = i.usos ? `${i.usos} uso(s)${i.ultimoUso ? `, último ${dataBr(i.ultimoUso)}` : ''}` : 'ainda não usado';
  return `<div class="k-item">
    <div class="k-cab"><b title="${esc(i.chave)}">${esc(i.chave)}</b><span class="k-id">${esc(i.id)}</span></div>
    ${i.titulo && i.titulo !== i.chave ? `<div>${esc(i.titulo)}</div>` : ''}
    <pre>${esc(i.conteudo)}</pre>
    <div class="k-rod"><span>${esc(i.fonte || 'sem fonte')}${i.sha ? ` · ${esc(String(i.sha).slice(0, 8))}` : ''} · ${esc(usos)} · ${esc(dataBr(i.atualizado || i.em))}</span>
      <button data-acao="qaConhecimentoEditar" data-id="${esc(i.id)}" title="Abre o qa.json no editor, neste item">Editar</button>
      <button data-acao="qaConhecimentoApagar" data-id="${esc(i.id)}" title="Apaga este conhecimento">Apagar</button></div>
  </div>`;
}

function conhecimentosHtml() {
  const d = k.ler(),
    inicio = k.flow('inicio'),
    voltar = k.flow('voltar-inicio');
  const flowLinha = (f, nome, falta) =>
    `<div class="k-flow">${f ? `<span class="k-ok">●</span> ${esc(nome)}: <code>${esc(f.arquivo || '')}</code>` : `<span class="k-falta">●</span> ${esc(nome)}: ${esc(falta)}`}</div>`;
  const grupos = Object.entries(k.TIPOS)
    .map(([tipo, desc]) => ({ tipo, desc, itens: d.itens.filter((i) => i.tipo === tipo) }))
    .filter((g) => g.itens.length);
  return `${CSS}${CSS_K}<div class="qa-card"><b>Conhecimentos</b><p>O que a IA do QA já descobriu (tabelas, seletores, telas, caminhos, endpoints, regras e flows prontos). Vale para todos os tickets:
    antes de pesquisar, a IA procura aqui; o que ela descobre, grava aqui. ${d.itens.length} registro(s).</p>
    <button data-acao="qaConhecimentoBuscar" title="Procura por termo (busca do VS Code)">Buscar</button>
    <button class="sec" data-acao="qaConhecimentoArquivo" title="Abre o qa.json no editor">Abrir arquivo</button></div>
    <div class="qa-card"><b>Tela de início dos testes</b><p>Todo teste começa nela: o flow <b style="display:inline">inicio</b> abre o app, faz login, escolhe a filial e para nessa tela;
    o <b style="display:inline">voltar-inicio</b> volta a ela entre um cenário e outro, sem novo login.</p>
    <div class="k-flow">Tela: <b style="display:inline">${esc(d.telaInicio || 'não definida')}</b></div>
    ${flowLinha(inicio, 'inicio', 'a IA escreve no próximo ▶ e a extensão valida antes de gravar')}
    ${flowLinha(voltar, 'voltar-inicio', 'a IA escreve junto com o inicio')}
    <button data-acao="qaConhecimentoTelaInicio" title="Nome da tela em que todo teste começa (ex.: Menu principal)">Definir tela de início</button>
    ${inicio ? '<button class="sec" data-acao="qaConhecimentoRefazerInicio" title="Apaga os flows de início: a IA escreve de novo no próximo ▶">Refazer flows de início</button>' : ''}</div>
    ${
      grupos
        .map(
          (g) =>
            `<details class="k-grupo" open><summary>${esc(g.desc)} (${g.itens.length})</summary><div class="cens">${g.itens.map(item).join('')}</div></details>`
        )
        .join('') ||
      '<div class="vazio-aba">Nada registrado ainda. A IA grava aqui o que descobrir no próximo ▶ do QA.</div>'
    }`;
}

module.exports = { conhecimentosHtml };
