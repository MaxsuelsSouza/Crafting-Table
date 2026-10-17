// @ts-check
// Alterações do worktree (aba Esteira, abaixo do Ao vivo do ticket ou de cada grupo): à esquerda a árvore de pastas com os arquivos mudados
// (git status contra o HEAD, como o Source Control do VS Code) e à direita o editor só de leitura com o diff do arquivo escolhido.
// Grupo em paralelo: os repositórios são os do worktree dele (grupos/contexto.js). Cliques: esteiraArquivo (escolhe o arquivo; data-key = grupo)
// e esteiraAbrirArquivo (abre o arquivo escolhido no editor do VS Code). A caixa acompanha o Ao vivo sem recarregar (data-vivo-troca).
const path = require('path');
const fs = require('fs');
const { esc } = require('../../../infra/texto');
const { deps } = require('../dependencias');

const escolhido = new Map(); // pasta (pai ou grupo) -> caminho absoluto do arquivo no editor
const MAX_LINHAS = 1500;

// Arquivos mudados dos repositórios: [{ repo, rel, abs, st }] (st: M, A, D, R ou U = novo, fora do git).
const mudados = (repos) =>
  repos.flatMap((r) => {
    try {
      return deps
        .gitBruto(r.caminho, ['status', '--porcelain', '-uall'])
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const xy = l.slice(0, 2),
            rel = l.slice(3).split(' -> ').pop().replace(/^"|"$/g, '');
          const st = xy === '??' ? 'U' : xy[0] !== ' ' ? xy[0] : xy[1];
          return { repo: r.caminho, rel, abs: path.join(r.caminho, rel), st };
        });
    } catch {
      return [];
    }
  });

// Árvore { pastas: { nome: no }, arqs: [] }; com mais de um repositório, o nome do repositório é a primeira pasta.
const arvore = (lista, varios) => {
  const raiz = { pastas: {}, arqs: [] };
  for (const a of lista) {
    const partes = [...(varios ? [path.basename(a.repo)] : []), ...a.rel.split('/')];
    let no = raiz;
    for (const p of partes.slice(0, -1)) no = no.pastas[p] ||= { pastas: {}, arqs: [] };
    no.arqs.push({ ...a, nome: partes.at(-1) });
  }
  return raiz;
};

// Pasta com uma pasta só dentro vira "a/b/c", como o VS Code faz.
const ramo = (no, key, sel, prefixo = '') =>
  Object.keys(no.pastas)
    .sort()
    .map((nome) => {
      let filho = no.pastas[nome],
        rot = nome;
      while (!filho.arqs.length && Object.keys(filho.pastas).length === 1) {
        const [n] = Object.keys(filho.pastas);
        rot += `/${n}`;
        filho = filho.pastas[n];
      }
      const p = `${prefixo}/${rot}`;
      return `<details open data-alt-p="${esc(key + p)}"><summary>${esc(rot)}</summary>${ramo(filho, key, sel, p)}</details>`;
    })
    .join('') +
  no.arqs
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map(
      (
        a
      ) => `<button class="alt-arq${a.abs === sel ? ' alt-sel' : ''}" data-acao="esteiraArquivo" data-id="${esc(a.abs)}"${key ? ` data-key="${esc(key)}"` : ''} title="${esc(a.rel)}">
      <span class="alt-n alt-${a.st}">${esc(a.nome)}</span><b class="alt-st alt-${a.st}">${a.st}</b></button>`
    )
    .join('');

// Diff do arquivo em linhas { t: '+'|'-'|' '|'@', n, txt }; arquivo novo (fora do git): tudo como linha nova.
const diff = (a) => {
  if (a.st === 'U') {
    let txt = '';
    try {
      txt = fs.readFileSync(a.abs, 'utf8');
    } catch {}
    return txt.includes('\u0000') ? null : txt.split('\n').map((l, i) => ({ t: '+', n: i + 1, txt: l }));
  }
  let bruto = '';
  try {
    bruto = deps.gitBruto(a.repo, ['diff', 'HEAD', '--', a.rel]);
  } catch {
    return [];
  }
  if (/^Binary files/m.test(bruto)) return null;
  const out = [];
  let n = 0;
  for (const l of bruto.split('\n')) {
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (h) {
      n = Number(h[1]);
      out.push({ t: '@', n: 0, txt: l });
    } else if (!out.length || /^(\\|diff |index |--- |\+\+\+ )/.test(l)) continue;
    else if (l[0] === '+') out.push({ t: '+', n: n++, txt: l.slice(1) });
    else if (l[0] === '-') out.push({ t: '-', n: 0, txt: l.slice(1) });
    else out.push({ t: ' ', n: n++, txt: l.slice(1) });
  }
  return out;
};

const editor = (a, key) => {
  if (!a) return '<div class="alt-vazio">Escolha um arquivo na árvore.</div>';
  const linhas = diff(a);
  const corpo = !linhas
    ? '<div class="alt-vazio">Arquivo binário.</div>'
    : !linhas.length
      ? '<div class="alt-vazio">Sem diferença contra o HEAD.</div>'
      : linhas
          .slice(0, MAX_LINHAS)
          .map(
            (l) =>
              `<div class="alt-l alt-l${l.t === '+' ? 'm' : l.t === '-' ? 'r' : l.t === '@' ? 'h' : ''}"><i>${l.n || ''}</i><code>${esc(l.txt) || ' '}</code></div>`
          )
          .join('') +
        (linhas.length > MAX_LINHAS
          ? `<div class="alt-vazio">… mais ${linhas.length - MAX_LINHAS} linhas (abra no editor)</div>`
          : '');
  return `<div class="alt-ed-t"><span title="${esc(a.abs)}">${esc(a.rel)}</span>
    ${a.st !== 'D' ? `<button class="vivo-exp" data-acao="esteiraAbrirArquivo"${key ? ` data-key="${esc(key)}"` : ''} title="Abrir no editor do VS Code">Abrir ↗</button>` : ''}</div>
    <div class="alt-cod">${corpo}</div>`;
};

/** Caixa "Alterações" de uma pasta (pai ou grupo). key = id do grupo (vazio = pai). */
const caixa = (dir, repos, key = '') => {
  const lista = mudados(repos);
  let sel = escolhido.get(dir);
  if (sel && !lista.some((a) => a.abs === sel)) sel = undefined;
  const a = lista.find((x) => x.abs === sel);
  return `<div class="caixa-t">Alterações<span>${lista.length} arquivo(s)</span></div>
  <div class="folha alt" data-vivo-troca="alt-${esc(key || 'pai')}">${
    lista.length
      ? `<div class="alt-arv">${ramo(arvore(lista, repos.length > 1), key, sel)}</div><div class="alt-ed">${editor(a, key)}</div>`
      : '<div class="alt-vazio">Nenhuma alteração ainda.</div>'
  }</div>`;
};

// Clique na árvore: só aceita arquivo que está mesmo na lista de mudados (o caminho vem da webview).
const escolher = (dir, repos, abs) => {
  if (mudados(repos).some((a) => a.abs === abs)) escolhido.set(dir, abs);
};
const abrir = (dir) => {
  const f = escolhido.get(dir),
    vscode = require('vscode');
  if (f && fs.existsSync(f)) vscode.window.showTextDocument(vscode.Uri.file(f), { preview: true });
};

const CSS = `<style>
  .alt { display: flex; flex-wrap: wrap; gap: 0; padding: 0; overflow: hidden; }
  .alt-arv { flex: 1 1 180px; max-width: 100%; max-height: 360px; overflow: auto; padding: 6px 4px; font-size: 12px; border-right: 1px solid var(--border); }
  .alt-arv details { padding-left: 10px; } .alt-arv > details { padding-left: 0; }
  .alt-arv summary { cursor: pointer; color: var(--text-dim); padding: 1px 2px; list-style-position: inside; white-space: nowrap; }
  .alt-arq { display: flex; width: 100%; gap: 6px; padding: 1px 4px 1px 14px; text-align: left; border-radius: var(--r-md); }
  .alt-arq:hover { background: var(--surface-2); } .alt-sel { background: color-mix(in srgb, var(--accent) 22%, transparent) !important; }
  .alt-n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .alt-st { flex: none; font-size: 10.5px; }
  .alt-M { color: var(--warn); } .alt-A, .alt-U { color: var(--ok); } .alt-D { color: var(--danger); } .alt-D.alt-n { text-decoration: line-through; } .alt-R { color: var(--accent); }
  .alt-ed { flex: 3 1 320px; min-width: 0; display: flex; flex-direction: column; }
  .alt-ed-t { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 8px; font-size: 11.5px; border-bottom: 1px solid var(--border); background: var(--surface-2); }
  .alt-ed-t span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .alt-cod { max-height: 360px; overflow: auto; font: 11.5px/1.5 var(--vscode-editor-font-family, monospace); }
  .alt-l { display: flex; white-space: pre; } .alt-l i { flex: none; width: 38px; padding-right: 8px; text-align: right; font-style: normal; color: var(--text-dim); user-select: none; }
  .alt-l code { font: inherit; padding-right: 8px; }
  .alt-lm { background: color-mix(in srgb, var(--ok) 16%, transparent); } .alt-lr { background: color-mix(in srgb, var(--danger) 16%, transparent); }
  .alt-lh { color: var(--ia); background: color-mix(in srgb, var(--ia) 10%, transparent); }
  .alt-vazio { padding: 10px; font-size: 12px; color: var(--text-dim); }
</style>`;

// Pastas da árvore que a pessoa fechou continuam fechadas depois do redesenho e da troca pelo Ao vivo.
const script = () => `{
  const fechadas = () => new Set((vscode.getState() || {}).altFechadas || []);
  const aplicar = () => document.querySelectorAll('[data-alt-p]').forEach((d) => {
    if (fechadas().has(d.dataset.altP)) d.open = false;
    d.ontoggle = () => { const f = fechadas(); d.open ? f.delete(d.dataset.altP) : f.add(d.dataset.altP); vscode.setState({ ...(vscode.getState() || {}), altFechadas: [...f] }); };
  });
  aplicar(); document.addEventListener('vivo-trocado', aplicar);
}`;

module.exports = { caixa, escolher, abrir, script, CSS, _teste: { mudados, arvore, diff } };
