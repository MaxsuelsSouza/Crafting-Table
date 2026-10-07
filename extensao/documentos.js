const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { esc } = require('./ticket')._teste;
const { pagina, icone } = require('./comandos').ui;

const { RAIZ, conversaAtual } = require('./sessao');
const EXTERNO = new Set(['.html', '.htm', '.pdf', '.docx', '.xlsx', '.pptx']);

function listar(pasta) {
  let nomes;
  try { nomes = fs.readdirSync(pasta); } catch { return []; }
  // .notas.html e evidencias/ também moram aqui, mas têm aba própria.
  return nomes.filter((n) => !n.startsWith('.')).map((nome) => {
    const full = path.join(pasta, nome);
    const atalho = fs.lstatSync(full).isSymbolicLink();
    let st;
    try { st = fs.statSync(full); } catch { return { nome, full, atalho, quebrado: true, mtime: 0 }; }
    return st.isFile() && { nome, full, atalho, origem: atalho ? fs.realpathSync(full) : null, mtime: st.mtimeMs };
  }).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
}

const TIPO = { '.md': ['MD', '#4a9eed'], '.html': ['HTML', '#e8833a'], '.htm': ['HTML', '#e8833a'], '.pdf': ['PDF', '#e05252'],
  '.docx': ['DOC', '#3d6fd9'], '.xlsx': ['XLS', '#3fa66b'], '.pptx': ['PPT', '#d9653d'], '.csv': ['CSV', '#2fa5a0'], '.txt': ['TXT', '#8b949e'] };

// Só as duas últimas pastas: o caminho inteiro não cabe no painel (o completo fica no title).
const curto = (p) => { const partes = p.replace(os.homedir(), '~').split('/'); return partes.length > 3 ? '…/' + partes.slice(-2).join('/') : partes.join('/'); };
function ha(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return new Date(ms).toLocaleDateString('pt-BR');
}
function tituloDaConversa(sid) {
  try {
    const { titulo, projeto } = require('./conversas')._teste;
    return titulo(path.join(projeto(), `${sid}.jsonl`));
  } catch { return null; }
}

const estilo = `<style>
  /* Mesmos tokens e peças das Notas (Atelier: tokens.css + format-bar.css). */
  :root { --surface: var(--vscode-editorWidget-background, #232328); --surface-2: var(--vscode-toolbar-hoverBackground, #2a2a30);
    --border: var(--vscode-widget-border, #3a3a42); --text: var(--vscode-foreground, #ececf0); --text-dim: var(--vscode-descriptionForeground, #9a9aa4);
    --accent: #007aff; --r-sm: 4px; --r-md: 6px; --r-lg: 10px; --fs-md: 12px; --sombra: 0 4px 16px rgb(0 0 0 / 16%); }
  body { padding: 0; color: var(--text); }
  .topo { padding: 10px 12px 8px; display: flex; align-items: baseline; gap: 8px; }
  .topo .rotulo { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-dim); flex: none; }
  .topo .titulo { flex: 1; min-width: 0; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .topo .extra { flex: none; font-size: 10.5px; color: var(--text-dim); }
  .barras { display: flex; align-items: center; gap: 6px; padding: 0 12px 10px; }
  .format-bar { display: flex; align-items: center; gap: 2px; padding: 4px; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); box-shadow: var(--sombra); white-space: nowrap; }
  .fb-btn { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; border: 0; border-radius: var(--r-md);
    background: transparent; color: var(--text); font-size: var(--fs-md); font-weight: 400; }
  .fb-btn:hover { background: var(--surface-2); }
  .fb-btn svg { width: 13px; height: 13px; }
  .folha { margin: 0 12px 12px; padding: 4px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--sombra); }
  ul.docs { display: flex; flex-direction: column; gap: 1px; margin: 0; }
  ul.docs li { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: var(--r-md); cursor: pointer; }
  ul.docs li:hover { background: var(--surface-2); }
  .tipo { flex: none; width: 32px; height: 32px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center;
    font-size: 9.5px; font-weight: 700; letter-spacing: .03em; color: var(--cor); background: color-mix(in srgb, var(--cor) 16%, transparent); }
  .doc { flex: 1; min-width: 0; }
  .doc .nome { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .doc .det { display: flex; gap: 6px; align-items: center; font-size: 10.5px; color: var(--text-dim); margin-top: 2px; }
  .doc .origem { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { flex: none; font-size: 9.5px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--border); color: var(--text-dim); }
  .tag.erro { border-color: color-mix(in srgb, #e74c3c 45%, transparent); color: #e74c3c; }
  ul.docs .x { flex: none; height: 24px; min-width: 24px; padding: 0 6px; border: 0; border-radius: var(--r-md); background: transparent;
    color: var(--text-dim); font-weight: 400; opacity: 0; transition: opacity 140ms; }
  ul.docs li:hover .x { opacity: 1; }
  ul.docs .x:hover { background: color-mix(in srgb, #e74c3c 14%, transparent); color: #e74c3c; }
  ul.docs .x.arroba:hover { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
  .centro { text-align: center; padding: 24px 12px; line-height: 1.6; color: var(--text-dim); font-size: 12.5px; }
  .centro .icone { font-size: 26px; opacity: .55; }
</style>`;

const tela = (sid, docs) => {
  if (!sid) return estilo + '<div class="topo"><span class="rotulo">Documentos</span></div><div class="folha"><div class="centro"><div class="icone">💬</div>Nenhuma conversa detectada ainda neste projeto.<br>Envie uma mensagem no Claude.</div></div>';
  return `${estilo}
    <div class="topo">
      <span class="rotulo">Documentos</span>
      <span class="titulo" title="${esc(sid)}">${esc(tituloDaConversa(sid) || sid.slice(0, 8))}</span>
      <span class="extra">${docs.length} documento${docs.length === 1 ? '' : 's'}</span>
    </div>
    <div class="barras">
      <div class="format-bar"><button class="fb-btn" data-acao="pasta" title="Abrir a pasta da conversa">${icone('pasta')} Pasta</button></div>
    </div>
    <div class="folha">${docs.length ? `<ul class="docs">${docs.map((d) => {
      const [sigla, cor] = TIPO[path.extname(d.nome).toLowerCase()] || [path.extname(d.nome).slice(1, 4).toUpperCase() || 'ARQ', '#8b949e'];
      return `<li data-acao="abrir" data-id="${esc(d.nome)}" title="${esc(d.origem || d.full)}">
        <span class="tipo" style="--cor:${cor}">${esc(sigla)}</span>
        <div class="doc">
          <div class="nome">${esc(d.nome)}</div>
          <div class="det">
            ${d.quebrado ? '<span class="tag erro">original apagado</span>' : d.atalho ? '<span class="tag">atalho</span>' : ''}
            ${d.atalho && !d.quebrado ? `<span class="origem">${esc(curto(path.dirname(d.origem)))}</span>` : ''}
            ${d.mtime ? `<span style="flex:none">${d.atalho && !d.quebrado ? '· ' : ''}${ha(d.mtime)}</span>` : ''}
          </div>
        </div>
        <button class="x arroba" data-acao="mencionar" data-id="${esc(d.nome)}" title="Mencionar no Claude">@</button>
        <button class="x" data-acao="remover" data-id="${esc(d.nome)}" title="${d.atalho ? 'Tirar da lista (o arquivo original continua)' : 'Excluir (vai para a lixeira)'}">✕</button>
      </li>`;
    }).join('')}</ul>`
      : '<div class="centro"><div class="icone">📄</div>Nenhum documento nesta conversa ainda.<br>O que o Claude criar aparece aqui.</div>'}</div>`;
};

exports.provider = () => {
  let view, sid, observadores = [], ultimo;

  const vigiar = () => {
    observadores.forEach((o) => o.close());
    observadores = [];
    // fs.watch só vale para pasta existente; sem ela, a visibilidade da aba refaz tudo.
    for (const p of [path.join(RAIZ, '.atual'), sid && path.join(RAIZ, sid)]) {
      try { if (p) observadores.push(fs.watch(p, () => render())); } catch {}
    }
  };

  const render = () => {
    if (!view) return;
    const novo = conversaAtual();
    if (novo !== sid || !observadores.length) { sid = novo; vigiar(); }
    const html = tela(sid, sid ? listar(path.join(RAIZ, sid)) : []);
    if (html === ultimo) return;
    ultimo = html;
    view.webview.html = pagina(crypto.randomBytes(16).toString('hex'), html);
  };

  const achar = (nome) => listar(path.join(RAIZ, sid)).find((d) => d.nome === nome);
  const acoes = {
    mencionar({ id }) {
      const d = achar(id);
      if (d && !d.quebrado) require('./claude').mencionar(`@${d.origem || d.full}`);
    },
    abrir({ id }) {
      const d = achar(id);
      if (!d || d.quebrado) return vscode.window.showWarningMessage('O arquivo original deste documento foi apagado.');
      const uri = vscode.Uri.file(d.origem || d.full);
      const ext = path.extname(d.nome).toLowerCase();
      if (ext === '.md') vscode.commands.executeCommand('markdown.showPreview', uri);
      else if (EXTERNO.has(ext)) vscode.env.openExternal(uri);
      else vscode.commands.executeCommand('vscode.open', uri);
    },
    async remover({ id }) {
      const d = achar(id);
      if (!d) return;
      if (d.atalho) fs.unlinkSync(d.full); // só o atalho; o arquivo original fica
      else {
        const ok = await vscode.window.showWarningMessage(`Excluir "${d.nome}"?`, { modal: true, detail: 'Vai para a lixeira do sistema.' }, 'Excluir');
        if (ok) await vscode.workspace.fs.delete(vscode.Uri.file(d.full), { useTrash: true });
      }
      render();
    },
    pasta: () => sid && vscode.env.openExternal(vscode.Uri.file(path.join(RAIZ, sid)))
  };

  return vscode.Disposable.from(
    { dispose: () => observadores.forEach((o) => o.close()) },
    vscode.window.registerWebviewViewProvider('claudeAbas.documentos', {
      resolveWebviewView(v) {
        view = v;
        view.webview.options = { enableScripts: true };
        view.webview.onDidReceiveMessage((m) => acoes[m.acao]?.(m));
        view.onDidChangeVisibility(() => view.visible && render());
        render();
      }
    })
  );
};

exports._teste = { tela, listar, conversaAtual };
