// @ts-check
const path = require('path');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); // igual ao do ao-vivo.js: o ticket.js exige o vscode

// Componente "Card de cenário": cada CT do plano de QA. Fechado mostra o código, o título e a pill de status; clicado expande o texto,
// a pasta/copiar das evidências, cada execução com as suas miniaturas e o botão ↻ Refazer. Usado no mapa de cenários do QA (qa.js,
// exibido nas Evidências em evidencias.js). As classes .cen/.cdet/.cid/.cst também vestem os itens da aba Massa (qa.js massaHtml).
// Para usar numa tela: CSS no <style>, card(c, ctx) no corpo (dentro de <div class="cens">) e script(chave) no <script>.
// Cliques pelo data-acao/data-painel de sempre: abrir, pastaCenario, copiarCenario (evidencias.js) e qaRefazer (painel.js).
// Redesenhar quando mudar .cenarios.json ou a pasta de evidências (evidencias.js já vigia). Estado aberto/fechado: vscode.getState()[chave].
//   ctx: { dir (pasta do QA), amb (ambiente, para o aviso "build anterior"), uri(arquivo) → endereço da webview, arquivos(execução) → caminhos }
const STATUS = { pendente: 'Pendente', executando: 'Executando', passou: 'Passou', falhou: 'Falhou', bloqueado: 'Bloqueado', desatualizado: 'Plano mudou' };
const REFAZER = ['passou', 'falhou', 'desatualizado', 'bloqueado'];
const IMG = /\.(png|jpe?g|gif|webp)$/i;
const dataBr = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** @param {any} c @param {{ dir: string, amb?: any, uri: (f: string) => string, arquivos: (x: any) => string[] }} ctx */
const card = (c, { dir, amb, uri, arquivos }) => {
  const miniatura = (f) => `<span class="cev" data-acao="abrir" data-nome="${esc(f)}" title="${esc(path.basename(f))}">${IMG.test(f) && uri(f) ? `<img src="${uri(f)}">` : esc(path.extname(f).slice(1).toUpperCase() || 'ARQ')}</span>`;
  const pasta = path.join(dir, 'evidencias', c.id);
  const execucao = (x) => {
    const arqs = arquivos(x);
    return `<div>${esc(dataBr(x.inicio || x.em))} · ${esc(STATUS[x.status] || x.status)}${x.nota ? ` · ${esc(x.nota)}` : ''}`
      + `${x.sha && amb?.sha && (x.sha.backend !== amb.sha.backend || x.sha.mobile !== amb.sha.mobile) ? ' · <span class="cst desatualizado" title="O código mudou desde esta execução">build anterior</span>' : ''}</div>`
      + (arqs.length ? `<div class="cevs">${arqs.map(miniatura).join('')}</div>` : '<div class="cex-vazio">Sem evidências nesta execução.</div>');
  };
  return `<details class="cen ${c.arquivado ? 'arq' : ''}" data-cen="${esc(c.id)}"><summary><span class="cid">${esc(c.id)}</span><span class="ctit">${esc(c.titulo || '')}</span>
      <span class="cst ${esc(c.status)}">${c.arquivado ? 'Fora do plano' : esc(STATUS[c.status] || c.status)}</span></summary>
    <div class="cdet">${c.resumo ? `<pre>${esc(c.resumo)}</pre>` : `<pre>${esc((c.texto || '').slice(0, 600))}</pre>`}
      ${(c.execucoes || []).length ? `<div class="format-bar arquivo"><button class="fb-btn" data-acao="pastaCenario" data-nome="${esc(pasta)}" title="${esc(pasta)}">Abrir pasta</button>
        <button class="fb-btn" data-acao="copiarCenario" data-nome="${esc(pasta)}">Copiar caminho</button></div>
        <div class="cex">${c.execucoes.slice().reverse().map(execucao).join('')}</div>`
        : '<div class="cex"><div>Ainda não executado.</div></div>'}
      ${!c.arquivado && REFAZER.includes(c.status) ? `<button data-painel="qaRefazer" data-id="${esc(c.id)}">↻ Refazer</button>` : ''}</div></details>`;
};

// Script da webview: cenários abertos continuam abertos depois do redesenho. Espera `vscode` (acquireVsCodeApi) já definido.
const script = (chave = 'cenAbertos') => `{
  const st = () => vscode.getState() || {};
  for (const d of document.querySelectorAll('details[data-cen]')) {
    if ((st()[${JSON.stringify(chave)}] || []).includes(d.dataset.cen)) d.open = true;
    d.addEventListener('toggle', () => {
      const l = new Set(st()[${JSON.stringify(chave)}] || []);
      d.open ? l.add(d.dataset.cen) : l.delete(d.dataset.cen);
      vscode.setState({ ...st(), [${JSON.stringify(chave)}]: [...l] });
    });
  }
}`;

const CSS = `
  .cen { border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); font-size: 12px; }
  .cen summary { display: flex; gap: 8px; align-items: baseline; padding: 7px 10px; cursor: pointer; list-style: none; }
  .cen summary::-webkit-details-marker { display: none; }
  .cen .cid { font-weight: 700; color: var(--accent); flex: none; }
  .cen .ctit { flex: 1; min-width: 0; }
  .cen .cst { flex: none; font-size: 10px; padding: 0 6px; border-radius: var(--r-pill); border: 1px solid var(--border); color: var(--text-dim); }
  .cst.passou { color: var(--ok); border-color: var(--ok); } .cst.falhou { color: var(--danger); border-color: var(--danger); }
  .cst.desatualizado, .cst.bloqueado { color: var(--warn); border-color: var(--warn); } .cst.executando { color: var(--ia); border-color: var(--ia); }
  .cen .cdet { padding: 0 10px 10px; color: var(--text-dim); line-height: 1.5; }
  .cen .cdet pre { white-space: pre-wrap; font: inherit; margin: 6px 0; }
  .cen .cex { margin-top: 6px; } .cen .cex div { font-size: 11px; }
  .cen button { margin-top: 6px; height: 24px; padding: 0 9px; border: 1px solid var(--border); border-radius: var(--r-md); background: none; color: var(--text); cursor: pointer; }
  .cen.arq { opacity: .55; }
  .cevs { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
  .cev { width: 54px; height: 96px; border-radius: var(--r-md); overflow: hidden; background: var(--surface-2); display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; color: var(--text-dim); cursor: pointer; }
  .cex-vazio { font-size: 11px; color: var(--text-dim); margin: 2px 0 6px; }
  .cen .arquivo { display: inline-flex; gap: 2px; margin: 4px 0; }
  .cen .arquivo .fb-btn { margin: 0; height: 24px; border: 0; padding: 0 7px; background: transparent; }
  .cen .arquivo .fb-btn:hover { background: var(--surface-2); }
  .cev img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
`;

module.exports = { card, script, CSS, dataBr };
