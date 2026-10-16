// @ts-check
// Componente "Roteiros": a lista R01, R02… de roteiros que o Maestro executa, já com a massa de dados anexada (quem usa passa o roteiro
// com as variáveis trocadas pelos valores da massa). Fechado: código R, a descrição do roteiro, o cenário (tag) e a pill de estado.
// Clicado expande o roteiro: as variáveis e as etapas, na ordem.
// Usado na aba Roteiro do QA (janelas/qa/abas/roteiro.js). Feito para servir também a Incidentes e Implementações.
// Como usar: CSS no <style> (junto com o de componentes/card-cenario.js, que veste .cen/.cdet/.cid/.cst) e html(itens) dentro de <div class="cens">;
// massa(item, { copiar }) desenha um item de massa solto, só leitura (ex.: "Massas mortas"). O script(chave) do card-cenario guarda aberto/fechado e o "Expandir tudo".
//   itens:  [{ id: 'R01', descricao, tag?: 'CT01', pill?: [rótulo, classe], roteiro?: { variaveis?, etapas: [] } | null, semRoteiro?: texto }]
//   itemMassa: { id, papel, dados, consulta?, medida?, pill: [rótulo, classe] }; copiar: o data-acao do ⧉ (padrão: o do QA)
const { FC } = require('./marca');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const ACOES = { copiar: 'qaMassaCopiar' };

// Uma etapa do roteiro em uma linha (o SQL da consulta fica num <pre> abaixo).
function etapa(e, n) {
  const t = String(e.tipo || '?');
  const txt =
    t === 'flow'
      ? `flow <b>${esc(e.arquivo)}</b>${e.env && Object.keys(e.env).length ? ` · ${esc(Object.entries(e.env).map(([k, v]) => `${k}=${v}`).join(', '))}` : ''}`
      : t === 'bipe'
        ? `bipe <b>${esc(e.codigo)}</b>${e.segundos !== undefined ? ` · espera ${esc(e.segundos)} s` : ''}`
        : t === 'espera'
          ? `espera ${esc(e.segundos ?? 1)} s`
          : t === 'consulta'
            ? `consulta <b>${esc(e.nome)}</b>${e.comparar_com ? ` · ${esc(e.esperado)} de "${esc(e.comparar_com)}"` : ''}`
            : esc(t);
  return `<li><span class="rt-n">${n}</span><span>${txt}${t === 'consulta' ? `<pre>${esc(e.sql)}${e.binds && Object.keys(e.binds).length ? `\n-- binds: ${esc(JSON.stringify(e.binds))}` : ''}</pre>` : ''}</span></li>`;
}

function roteiro(i) {
  if (!i.roteiro) return `<p class="rt-vazio">${esc(i.semRoteiro || 'Roteiro ainda não escrito.')}</p>`;
  const vars = Object.entries(i.roteiro.variaveis || {});
  return `${vars.length ? `<div class="rt-vars">${vars.map(([k, v]) => `<span><b>${esc(k)}</b> = ${esc(v)}</span>`).join('')}</div>` : ''}
    <ol class="rt-etapas">${(i.roteiro.etapas || []).map((e, k) => etapa(e, k + 1)).join('')}</ol>`;
}

/** Um item de massa solto, só leitura (ex.: "Massas mortas"): papel, campos com copiar e a consulta que o achou. */
function massa(m, { copiar = ACOES.copiar } = {}) {
  return `<div class="rt-massa"><div class="rt-mcab"><span class="cid">${esc(m.id)}</span><span class="ctit">${esc(m.papel)}</span><span class="cst ${esc(m.pill?.[1] || '')}">${esc(m.pill?.[0] || '')}</span></div>
    ${m.medida ? `<div class="rt-dim">medida ${esc(m.medida)}</div>` : ''}
    <div class="papel-massa">${
      Object.entries(m.dados || {})
        .map(
          ([k, v]) =>
            `<div class="campo"><span class="k">${esc(k)}</span><span class="v">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</span><button class="copiar" data-acao="${copiar}" data-id="${esc(m.id)}" data-key="${esc(k)}" title="Copiar ${esc(k)}">⧉</button></div>`
        )
        .join('') || '<span class="k">sem campos</span>'
    }</div>
    ${m.consulta ? `<details><summary>Consulta</summary><pre>${esc(m.consulta)}</pre></details>` : ''}</div>`;
}

/** A lista de roteiros: cada item expande o roteiro (com a massa já anexada). */
function html(itens) {
  return itens
    .map(
      (i) => `<details class="cen rt" data-cen="rot-${esc(i.id)}"><summary><span class="cid">${esc(i.id)}</span><span class="ctit">${esc(i.descricao)}${i.tag ? ` <span class="rt-tag">${esc(i.tag)}</span>` : ''}</span>${i.pill ? `<span class="cst ${esc(i.pill[1])}">${esc(i.pill[0])}</span>` : ''}</summary><div class="cdet">
    <div class="rt-sec">Roteiro</div>${roteiro(i)}
  </div></details>`
    )
    .join('');
}

const CSS = `
  .rt .cdet { display: flex; flex-direction: column; gap: 4px; }
  .rt-tag { font-size: 10px; color: var(--text-dim); border: 1px solid var(--border); border-radius: var(--r-pill); padding: 0 5px; margin-left: 4px; }
  .rt-sec { margin-top: 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); font-weight: 600; }
  .rt-vazio { margin: 2px 0; font-style: italic; }
  .rt-vars { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 11.5px; }
  .rt-etapas { margin: 2px 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px; }
  .rt-etapas li { display: flex; gap: 8px; align-items: baseline; color: var(--text); }
  .rt-etapas .rt-n { flex: none; width: 18px; text-align: right; color: var(--text-dim); font-variant-numeric: tabular-nums; }
  .rt-etapas pre { margin: 3px 0 0; padding: 6px 8px; border-radius: var(--r-md); background: var(--surface-2); color: var(--text-dim); white-space: pre-wrap; font-family: var(--vscode-editor-font-family, monospace); font-size: 11.5px; }
  .rt-massa { border-top: 1px dashed var(--border); padding-top: 6px; margin-top: 2px; }
  .rt-mcab { display: flex; gap: 8px; align-items: baseline; color: var(--text); }
  .rt-mcab .ctit { flex: 1; min-width: 0; }
  .rt-dim { font-size: 11px; }
  .papel-massa { margin: 6px 0; padding: 8px 10px; border-radius: var(--r-lg); background: ${FC.bg}; color: ${FC.text}; box-shadow: 0 4px 16px rgb(0 0 0 / 16%); font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; line-height: 1.55; user-select: text; }
  .papel-massa .campo { display: flex; gap: 8px; align-items: baseline; }
  .papel-massa .k { font-weight: 700; flex: none; } .papel-massa .k::after { content: ' ='; }
  .papel-massa .v { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .papel-massa .copiar { flex: none; background: transparent; color: inherit; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 4px; padding: 0 5px; opacity: .55; cursor: pointer; }
  .papel-massa .copiar:hover { opacity: 1; }
`;

module.exports = { html, massa, CSS, ACOES };
