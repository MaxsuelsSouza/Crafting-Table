// @ts-check
// Aba Evidências dos Incidentes: resumo analítico, comparativo SQL (massa real x massa de teste) e galeria de mídia.
// Só lê os artefatos que o Mergulho/Reprodução escrevem em `dir` (contrato: incidentes/CONTRATO.md).
const fs = require('fs');
const path = require('path');
const { esc } = require('../../infra/texto');
const { markdown } = require('../../componentes/markdown');
const { botao, icone } = require('../../componentes/botao');

const SQL = { 'massa-real': ['MASSA REAL', 'massa-real.sql'], 'massa-teste': ['MASSA DE TESTE', 'massa-teste.sql'] };
const lerTexto = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return '';
  }
};

// Caminho relativo a `dir` que existe no disco e não sai de `dir`; senão null.
function dentro(dir, rel) {
  if (typeof rel !== 'string' || !rel) return null;
  const base = path.resolve(dir),
    f = path.resolve(base, rel);
  return f.startsWith(base + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
}

function midiasDe(dir) {
  try {
    const j = JSON.parse(lerTexto(path.join(dir, 'reproducao.json')) || '{}');
    return Array.isArray(j.midias) ? j.midias.filter((m) => m && typeof m === 'object') : [];
  } catch {
    return [];
  }
}

const CSS = `<style>
  .evi { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
  .evi h3 { margin: 0 0 8px; font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted, var(--text)); }
  .evi-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 10px 12px; min-width: 0; }
  .evi-vazio { opacity: .65; font-size: 12px; }
  .evi-cab { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 8px; }
  .evi-cab h3 { margin: 0; }
  .evi-sql { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
  .evi-sql pre { margin: 0; max-height: 320px; overflow: auto; padding: 8px; border-radius: var(--r-md); background: var(--surface-2); border: 1px solid var(--border);
    font-family: var(--vscode-editor-font-family, monospace); font-size: 11.5px; white-space: pre; }
  .sql-k { color: #569cd6; font-weight: 600; }
  .sql-l { color: #c586c0; font-weight: 600; }
  .sql-f { color: #dcdcaa; }
  .sql-t { color: #4ec9b0; }
  .sql-s { color: #ce9178; }
  .sql-n { color: #b5cea8; }
  .sql-c { color: #6a9955; font-style: italic; }
  .evi-bt { display: flex; gap: 4px; align-items: center; }
  .evi-tc, .evi-x { width: 24px; height: 24px; border-radius: var(--r-md); }
  .evi-tc:hover, .evi-x:hover { background: var(--surface-2); }
  .evi-x { display: none; }
  .evi-card.evi-max { position: fixed; inset: 12px; z-index: 300; display: flex; flex-direction: column; box-shadow: 0 0 0 100vmax rgb(0 0 0 / 55%); }
  .evi-card.evi-max .evi-tc { display: none; }
  .evi-card.evi-max .evi-x { display: block; }
  .evi-card.evi-max pre { flex: 1; max-height: none; font-size: 13px; }
  .evi-gal { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
  .evi-gal figure { margin: 0; min-width: 0; }
  .evi-gal img { width: 100%; height: 90px; object-fit: cover; border-radius: var(--r-md); border: 1px solid var(--border); cursor: pointer; display: block; }
  .evi-gal figcaption { font-size: 11px; opacity: .8; margin-top: 3px; overflow-wrap: anywhere; }
  .evi-gal .evi-video { grid-column: 1 / -1; }
  .evi-gal video { width: 100%; max-height: 320px; border-radius: var(--r-md); background: #000; }
  .evi-falta { font-size: 11px; opacity: .65; padding: 6px; border: 1px dashed var(--border); border-radius: var(--r-md); }
  .evi-md p, .evi-md ul { margin: 0 0 6px; }
</style>`;

// Realce de SQL (regex simples, sem dependência): comentário, string, número, cláusula, lógico, função, tabela/coluna qualificada.
const KW =
  'select|from|where|insert|into|values|update|set|delete|join|left|right|inner|outer|full|cross|on|as|group|by|order|having|distinct|union|all|case|when|then|else|end|limit|fetch|first|rows|only|with|desc|asc|create|alter|drop|table|commit|rollback|over|partition';
const LOG = 'and|or|not|in|is|null|like|between|exists|any|some';
const palavra = (w) => (new RegExp(`^(${KW})$`, 'i').test(w) ? 'k' : new RegExp(`^(${LOG})$`, 'i').test(w) ? 'l' : '');
const realceSql = (t) =>
  esc(t).replace(
    new RegExp(
      `(--[^\\n]*|/\\*[\\s\\S]*?\\*/)|('(?:[^']|'')*'|&#39;(?:[^&]|&(?!#39;))*&#39;)|(?<!&#)\\b(\\d+(?:\\.\\d+)?)\\b|\\b([a-z_]\\w*(?:\\.[a-z_]\\w*)+)|\\b([a-z_]\\w*)\\b(\\s*\\()?`,
      'gi'
    ),
    (m, c, st, n, q, w, par) => {
      if (c) return `<span class="sql-c">${m}</span>`;
      if (st) return `<span class="sql-s">${m}</span>`;
      if (n) return `<span class="sql-n">${m}</span>`;
      if (q) return `<span class="sql-t">${m}</span>`;
      const cls = palavra(w) || (par ? 'f' : '');
      return cls ? `<span class="sql-${cls}">${w}</span>${par || ''}` : m;
    }
  );

function sqlCard(dir, id) {
  const [titulo, arq] = SQL[id],
    txt = lerTexto(path.join(dir, arq));
  return `<div class="evi-card"><div class="evi-cab"><h3>${titulo}</h3>${txt ? `<span class="evi-bt">${botao(icone('copiar'), { variante: 'icone', acao: 'copiarSqlInc', id, titulo: 'Copiar' })}<button class="evi-tc" data-sqlmax title="Tela cheia">⛶</button><button class="evi-x" data-sqlmax title="Fechar">✕</button></span>` : ''}</div>
    ${txt ? `<pre>${realceSql(txt)}</pre>` : '<div class="evi-vazio">Ainda não gerada.</div>'}</div>`;
}

function galeria(dir, uri) {
  const itens = midiasDe(dir).map((m) => {
    const legenda = String(m.legenda || m.arquivo || ''),
      f = dentro(dir, m.arquivo);
    if (!f) return `<div class="evi-falta">${esc(legenda)}<br>arquivo não encontrado</div>`;
    const src = uri ? esc(uri(f)) : '';
    if (m.tipo === 'video')
      return `<figure class="evi-video">${src ? `<video controls preload="metadata" src="${src}"></video>` : ''}<figcaption>${esc(legenda)} ${botao('abrir no player', { variante: 'link', acao: 'abrirMidiaInc', id: m.arquivo })}</figcaption></figure>`;
    return `<figure><img ${src ? `src="${src}"` : ''} alt="${esc(legenda)}" data-acao="abrirMidiaInc" data-id="${esc(m.arquivo)}"><figcaption>${esc(legenda)}</figcaption></figure>`;
  });
  return `<div class="evi-card"><h3>Galeria de mídia</h3>${itens.length ? `<div class="evi-gal">${itens.join('')}</div>` : '<div class="evi-vazio">Nenhum print ou vídeo ainda.</div>'}</div>`;
}

// d.uri: (arquivo local) => URI da webview (o painel preenche); sem ele a galeria só mostra as legendas.
function corpo(t, d, dir) {
  const resumo = lerTexto(path.join(dir, 'resumo.md')).trim();
  return `${CSS}<div class="evi">
    <div class="evi-card"><h3>Resumo analítico do Claude</h3>${resumo ? `<div class="evi-md">${markdown(resumo)}</div>` : '<div class="evi-vazio">O resumo aparece quando o Mergulho terminar a reprodução.</div>'}</div>
    <div class="evi-sql">${sqlCard(dir, 'massa-real')}${sqlCard(dir, 'massa-teste')}</div>
    ${galeria(dir, d?.uri)}
  </div>`;
}

// Script da webview: tela cheia dos cards de SQL (classe no próprio card; Esc fecha).
const script =
  () => `document.addEventListener('click', (e) => { const b = e.target.closest('[data-sqlmax]'); if (b) b.closest('.evi-card').classList.toggle('evi-max'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelector('.evi-max')?.classList.remove('evi-max'); });`;

const pasta = (s) => {
  const t = s.ticketAberto();
  return t ? s.pastaAba(t.id) : null;
};

const acoes = (s) => ({
  async copiarSqlInc({ id }) {
    const dir = pasta(s),
      txt = dir && SQL[id] ? lerTexto(path.join(dir, SQL[id][1])) : '';
    const vscode = require('vscode');
    if (txt) {
      await vscode.env.clipboard.writeText(txt);
      vscode.window.showInformationMessage('SQL copiado.');
    }
  },
  abrirMidiaInc({ id }) {
    const dir = pasta(s),
      f = dir && dentro(dir, id);
    if (!f) return;
    const vscode = require('vscode');
    // Webview não toca mp4 sem H.264: vídeo abre no player do sistema, print no editor ao lado.
    if (/\.(mp4|webm|mov)$/i.test(f)) vscode.env.openExternal(vscode.Uri.file(f));
    else vscode.commands.executeCommand('vscode.open', vscode.Uri.file(f), vscode.ViewColumn.Beside);
  }
});

module.exports = { corpo, acoes, script, _teste: { dentro } };
