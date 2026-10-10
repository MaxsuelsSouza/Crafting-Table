const vscode = require('vscode');
const crypto = require('crypto');
const path = require('path');
const { execFile } = require('child_process');
const { esc } = require('./ticket')._teste;

// Descendentes do shell do terminal (o shell em si fica de fora: matar ele fecha o terminal).
function descendentes(raiz) {
  return new Promise((resolve) => execFile('ps', ['-e', '-o', 'pid=,ppid=,args='], { maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
    if (err) return resolve([]);
    const procs = out.split('\n').map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
      .map(([, pid, ppid, args]) => ({ pid: Number(pid), ppid: Number(ppid), args }));
    const achados = [];
    const fila = [raiz];
    while (fila.length) {
      const pai = fila.shift();
      for (const p of procs) if (p.ppid === pai) { achados.push(p); fila.push(p.pid); }
    }
    resolve(achados);
  }));
}

function matar(pid) {
  try { process.kill(pid, 'SIGTERM'); } catch {}
}

const estilo = `
  body { font-family: var(--fc-font); color: var(--text); padding: 12px 14px; }
  /* Padrão de botões da Crafting Table: principal azul sólido; o resto só texto/ícone com fundo no hover. */
  button { font: inherit; font-size: 12px; cursor: pointer; border: none; border-radius: var(--r-md); padding: 5px 12px; font-weight: 600;
    background: var(--accent); color: var(--on-cor); }
  button:hover { background: var(--accent-soft); }
  .ico { display: inline-flex; align-items: center; justify-content: center; }
  .ico svg { width: 15px; height: 15px; }
  ul { list-style: none; padding: 0; margin: 12px 0; }
  li { padding: 6px 4px; border-radius: var(--r-sm); }
  li:hover { background: var(--surface-2); }
  .linha { display: flex; align-items: center; gap: 8px; }
  .procs { margin: 6px 0 2px 8px; padding-left: 8px; border-left: 2px solid var(--border); font-size: 12px; }
  .proc { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
  .proc .pid { font-family: var(--fc-mono); color: var(--accent-soft); min-width: 52px; }
  .proc .args { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-dim); }
  .proc button, .procs .todos { background: none; color: var(--danger); padding: 2px 6px; font-weight: 500; }
  .proc button:hover, .procs .todos:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); }
  .procs .todos { margin-top: 4px; font-size: 11px; }
  .procs .vazio { margin: 2px 0; }
  li .info { flex: 1; min-width: 0; cursor: pointer; }
  li .nome { font-weight: 600; }
  li .det { font-size: 11px; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li .acoes button { background: none; color: var(--text-dim); padding: 3px 7px; font-weight: 500; }
  li .acoes button:hover { background: var(--surface-2); color: var(--text); }
  li .acoes .sec { visibility: hidden; }
  li:hover .acoes .sec { visibility: visible; }
  .play { color: var(--ok) !important; }
  .parar { color: var(--danger) !important; }
  .vazio { color: var(--text-dim); }
`;

const pagina = (nonce, corpo) => `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>${estilo}</style></head><body>${corpo}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-acao]');
    // dono: a parte da página que tem o botão, quando duas telas dividem a mesma página (grupo.js, JUNTAS)
    if (el) vscode.postMessage({ acao: el.dataset.acao, id: el.dataset.id, pid: Number(el.dataset.pid), dono: el.closest('[data-dono]')?.dataset.dono });
  });
</script></body></html>`;

const terminalDe = (b) => vscode.window.terminals.find((t) => t.name === b.nome);

// Estilo próprio da aba (o `estilo` acima é a base compartilhada com Cofre, Emuladores, Conversas).
const estiloBotoes = `<style>
  /* Mesmos tokens e peças das Notas (Atelier: tokens.css + format-bar.css). */
  :root { --fs-md: 12px; --sombra: 0 4px 16px rgb(0 0 0 / 16%); }
  body { padding: 0; color: var(--text); }
  .topo { padding: 10px 12px 8px; display: flex; align-items: baseline; gap: 8px; }
  .topo .rotulo { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-dim); flex: none; }
  .topo .titulo { flex: 1; }
  .topo .extra { flex: none; font-size: 10.5px; color: var(--text-dim); }
  .barras { display: flex; align-items: center; gap: 6px; padding: 0 12px 10px; }
  .barras .espaco { flex: 1; }
  .barras .dica { font-size: 11px; color: var(--text-dim); }
  .primario { flex: none; height: 34px; padding: 0 12px; border-radius: var(--r-md); box-shadow: var(--sombra); }
  ul.cmds { margin: 0; padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
  ul.cmds > li { padding: 9px 8px 9px 10px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--sombra);
    transition: border-color 140ms, transform 140ms; }
  ul.cmds > li:hover { background: var(--surface); border-color: var(--accent); transform: translateY(-1px); }
  ul.cmds > li.rodando { border-left: 3px solid var(--ok); }
  ul.cmds > li.rodando:hover { border-left-color: var(--ok); }
  .card { display: flex; align-items: center; gap: 10px; }
  /* Só o símbolo: ▶ verde para rodar, ■ vermelho para parar, sem círculo nem borda. */
  .run { flex: none; width: 28px; height: 28px; border: 0; border-radius: var(--r-md); padding: 0; display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 400; background: transparent; color: var(--ok, var(--ok)); }
  .run:hover { background: var(--surface-2); }
  .run.stop { color: var(--perigo, var(--danger)); }
  .corpo { flex: 1; min-width: 0; cursor: pointer; }
  .corpo .nome { font-weight: 600; font-size: 12.5px; display: flex; align-items: center; gap: 6px; }
  .vivo { font-size: 10px; font-weight: 500; color: var(--ok); }
  .vivo::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--ok); margin-right: 4px; vertical-align: 1px; animation: pulso 1.6s infinite; }
  @keyframes pulso { 50% { opacity: .3; } }
  .cmd { display: inline-block; max-width: 100%; margin-top: 4px; padding: 1px 6px; border-radius: var(--r-md); font-family: var(--fc-mono); font-size: 11px;
    background: var(--surface-2); color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: top; }
  .pastinha { font-size: 10.5px; color: var(--text-dim); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini { flex: none; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border);
    opacity: 0; transition: opacity 140ms; }
  ul.cmds > li:hover .mini, ul.cmds > li.com-procs .mini { opacity: 1; }
  .mini button { height: 22px; min-width: 22px; background: none; color: var(--text); padding: 0 6px; font-weight: 400; border-radius: var(--r-md); }
  .mini button:hover, .mini button.aberto { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
  .mini button[data-acao="remover"]:hover { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
  ul.cmds .procs { margin: 8px 0 0 38px; padding: 6px 8px; border-left: none; border-radius: var(--r-md); background: var(--surface-2); }
  ul.cmds .proc .pid { min-width: 0; padding: 0 6px; border-radius: var(--r-pill); font-size: 10.5px; background: var(--surface); color: var(--accent); }
  ul.cmds .procs .todos { font-size: 11px; margin-top: 6px; }
  .folha { margin: 0 12px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--sombra); }
  .centro { text-align: center; padding: 24px 12px; line-height: 1.6; color: var(--text-dim); font-size: 12.5px; }
  .centro .icone { font-size: 26px; opacity: .55; }
  .centro code { font-size: 11px; }
</style>`;

const pastaCurta = (p) => { const partes = p.replace(require('os').homedir(), '~').split('/'); return partes.length > 3 ? '…/' + partes.slice(-2).join('/') : partes.join('/'); };

const tela = (botoes, procs = {}) => `${estiloBotoes}
  <div class="topo"><span class="rotulo">Comandos</span><span class="titulo"></span>
    <span class="extra">${botoes.length ? `${botoes.length} ${botoes.length === 1 ? 'botão' : 'botões'}` : ''}</span></div>
  <div class="barras">
    <span class="dica">${botoes.filter((b) => terminalDe(b)).length ? `${botoes.filter((b) => terminalDe(b)).length} rodando` : ''}</span>
    <span class="espaco"></span>
    <button class="primario" data-acao="adicionar">＋ Adicionar</button>
  </div>
  ${botoes.length ? `<ul class="cmds">${botoes.map((b) => {
    const rodando = Boolean(terminalDe(b));
    return `<li class="${rodando ? 'rodando' : ''} ${procs[b.id] ? 'com-procs' : ''}"><div class="card">
      ${rodando
        ? `<button class="run stop" data-acao="parar" data-id="${b.id}" title="Parar">■</button>`
        : `<button class="run" data-acao="rodar" data-id="${b.id}" title="Executar">▶</button>`}
      <div class="corpo" data-acao="${rodando ? 'mostrar' : 'rodar'}" data-id="${b.id}" title="${rodando ? 'Mostrar o terminal' : 'Executar'}">
        <div class="nome">${esc(b.nome)}${rodando ? '<span class="vivo">rodando</span>' : ''}</div>
        <code class="cmd" title="${esc(b.comando)}">${esc(b.comando)}</code>
        <div class="pastinha" title="${esc(b.pasta)}">📁 ${esc(pastaCurta(b.pasta))}</div>
      </div>
      <span class="mini">
        <button data-acao="mencionar" data-id="${b.id}" title="Mencionar no Claude">@</button>
        <button class="${procs[b.id] ? 'aberto' : ''}" data-acao="processos" data-id="${b.id}" title="Processos">⋯</button>
        <button class="ico" data-acao="editar" data-id="${b.id}" title="Editar">${icone('editar')}</button>
        <button data-acao="remover" data-id="${b.id}" title="Remover">✕</button>
      </span></div>
      ${procs[b.id] ? `<div class="procs">${procs[b.id].length ? `
        ${procs[b.id].map((p) => `<div class="proc">
          <span class="pid">${p.pid}</span><span class="args" title="${esc(p.args)}">${esc(p.args)}</span>
          <button data-acao="matar" data-id="${b.id}" data-pid="${p.pid}" title="Matar ${p.pid}">✕</button>
        </div>`).join('')}
        <button class="todos" data-acao="matarTodos" data-id="${b.id}">Matar todos (${procs[b.id].length})</button>`
        : '<p class="vazio">Nenhum processo rodando.</p>'}</div>` : ''}
    </li>`;
  }).join('')}</ul>` : `<div class="folha"><div class="centro"><div class="icone">▶</div>Nenhum comando ainda.<br>Clique em <b>Adicionar</b>: nome, comando e pasta.<br><code>Metro · yarn start · ~/wms-mobile</code></div></div>`}`;

async function perguntar(atual = {}) {
  const nome = await vscode.window.showInputBox({ title: 'Nome do botão', value: atual.nome, placeHolder: 'Metro', ignoreFocusOut: true });
  if (!nome) return null;
  const comando = await vscode.window.showInputBox({ title: `Comando de "${nome}"`, value: atual.comando, placeHolder: 'yarn start', ignoreFocusOut: true });
  if (!comando) return null;
  const pasta = await vscode.window.showOpenDialog({
    title: `Pasta onde "${nome}" roda`, canSelectFolders: true, canSelectFiles: false, openLabel: 'Usar esta pasta',
    defaultUri: atual.pasta ? vscode.Uri.file(atual.pasta) : vscode.workspace.workspaceFolders?.[0]?.uri
  });
  if (!pasta) return null;
  return { nome, comando, pasta: pasta[0].fsPath };
}

exports.provider = (ctx) => {
  const botoes = () => ctx.globalState.get('botoes', []);
  const salvar = (l) => ctx.globalState.update('botoes', l);
  const achar = (id) => botoes().find((b) => b.id === id);
  const abertos = new Set(); // botões com a lista de processos aberta
  let cache = null; // html da aba Configurações → Comandos (a lista de processos é assíncrona)
  const render = async () => {
    const procs = {};
    for (const id of abertos) {
      const b = achar(id);
      const shell = b && await terminalDe(b)?.processId;
      procs[id] = shell ? await descendentes(shell) : [];
    }
    cache = tela(botoes(), procs);
    ouvintes.forEach((f) => f());
  };
  const depois = () => setTimeout(render, 700); // dá tempo do processo morrer

  const acoes = {
    async adicionar() {
      const b = await perguntar();
      if (b) { await salvar([...botoes(), { id: crypto.randomUUID(), ...b }]); render(); }
    },
    async editar({ id }) {
      const b = await perguntar(achar(id));
      if (b) { await salvar(botoes().map((x) => (x.id === id ? { ...x, ...b } : x))); render(); }
    },
    async remover({ id }) {
      const b = achar(id);
      const ok = await vscode.window.showWarningMessage(`Remover o botão "${b.nome}"?`, { modal: true }, 'Remover');
      if (ok) { await salvar(botoes().filter((x) => x.id !== id)); render(); }
    },
    rodar({ id }) {
      const b = achar(id);
      const t = vscode.window.createTerminal({ name: b.nome, cwd: b.pasta, iconPath: new vscode.ThemeIcon('play') });
      t.show(true);
      t.sendText(b.comando);
    },
    processos({ id }) { abertos.has(id) ? abertos.delete(id) : abertos.add(id); render(); },
    matar({ pid }) { matar(pid); depois(); },
    async matarTodos({ id }) {
      const shell = await terminalDe(achar(id))?.processId;
      if (shell) (await descendentes(shell)).forEach((p) => matar(p.pid));
      depois();
    },
    async mencionar({ id }) {
      const b = achar(id);
      const shell = await terminalDe(b)?.processId;
      const pids = shell ? (await descendentes(shell)).map((p) => p.pid) : [];
      require('./claude').mencionar(`[Comando "${b.nome}" da Crafting Table · comando: \`${b.comando}\` · pasta: ${b.pasta} · ${shell ? `rodando no terminal "${b.nome}" (shell PID ${shell}${pids.length ? `, processos ${pids.join(', ')}` : ''})` : 'parado'}]`);
    },
    mostrar: ({ id }) => terminalDe(achar(id))?.show(),
    parar: ({ id }) => terminalDe(achar(id))?.dispose()
  };

  // Para outras partes da extensão (testes.js): cria/atualiza o botão pelo nome e roda se não estiver rodando.
  exports.garantir = async ({ nome, comando, pasta }) => {
    const existente = botoes().find((b) => b.nome === nome);
    if (existente) await salvar(botoes().map((x) => (x.nome === nome ? { ...x, comando, pasta } : x)));
    else await salvar([...botoes(), { id: crypto.randomUUID(), nome, comando, pasta }]);
    if (!terminalDe({ nome })) acoes.rodar({ id: botoes().find((b) => b.nome === nome).id });
    render();
  };

  // A tela mora em Configurações → Comandos e o atalho no rodapé do ticket (painel.js): ela pede o html e repassa os cliques.
  exports.api = {
    html: () => cache ?? tela(botoes(), {}),
    lista: () => botoes().map((b) => ({ id: b.id, nome: b.nome, comando: b.comando, pasta: b.pasta, rodando: Boolean(terminalDe(b)) })),
    alternar: ({ id }) => (terminalDe(achar(id)) ? acoes.parar({ id }) : acoes.rodar({ id })),
    acao: (m) => acoes[m.acao]?.(m),
    atualizar: render
  };

  return vscode.Disposable.from(
    vscode.window.onDidOpenTerminal(render),
    vscode.window.onDidCloseTerminal(render),
    { dispose: () => { exports.api = null; } }
  );
};

const ouvintes = [];
exports.aoMudar = (f) => { ouvintes.push(f); }; // chamado a cada mudança de botões ou terminais

exports.processos = { descendentes, matar };
// Ícones de traço (no lugar de emoji) para os botões de ícone.
const ICONES = {
  pasta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  limpar: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/>'
};
const icone = (nome) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome]}</svg>`;
// Estilo gráfico das Notas (tokens e peças do Atelier: tokens.css + format-bar.css), para as abas que usam esta base.
const ESTILO_NOTAS = `<style>
  :root { --fs-md: 12px; --sombra: 0 4px 16px rgb(0 0 0 / 16%); }
  body { padding: 0; color: var(--text); }
  .topo { padding: 10px 12px 8px; display: flex; align-items: baseline; gap: 8px; }
  .topo .rotulo { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-dim); flex: none; }
  .topo .titulo { flex: 1; min-width: 0; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .topo .extra { flex: none; font-size: 10.5px; color: var(--text-dim); }
  .barras { display: flex; align-items: center; gap: 6px; padding: 0 12px 10px; }
  .barras .espaco { flex: 1; }
  .barras .dica { font-size: 11px; color: var(--text-dim); }
  .format-bar { display: flex; align-items: center; gap: 2px; padding: 4px; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); box-shadow: var(--sombra); white-space: nowrap; }
  .fb-sep { width: 1px; height: 18px; background: var(--border); margin: 0 3px; flex-shrink: 0; }
  .fb-btn { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 24px; height: 24px; padding: 0 7px; border: 0;
    border-radius: var(--r-md); background: transparent; color: var(--text); font-size: var(--fs-md); font-weight: 400; line-height: 1; }
  .fb-btn:hover { background: var(--surface-2); }
  .fb-btn.is-on { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
  .fb-btn svg { width: 13px; height: 13px; }
  .primario { flex: none; height: 34px; padding: 0 12px; border: 0; border-radius: var(--r-md); font-size: var(--fs-md); font-weight: 600; box-shadow: var(--sombra);
    background: var(--accent); color: var(--on-cor); }
  .primario:hover { background: var(--accent-soft); }
  .folha { margin: 0 12px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--sombra); }
  .cartoes { list-style: none; margin: 0; padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
  .cartoes > li { padding: 9px 8px 9px 10px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--sombra);
    transition: border-color 140ms, transform 140ms; }
  .cartoes > li:hover { background: var(--surface); border-color: var(--accent); transform: translateY(-1px); }
  .mini { flex: none; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border);
    opacity: 0; transition: opacity 140ms; }
  .cartoes > li:hover .mini, .cartoes > li.com-procs .mini { opacity: 1; }
  .mini button { height: 22px; min-width: 22px; background: none; color: var(--text); padding: 0 6px; font-weight: 400; border-radius: var(--r-md); }
  .mini button:hover, .mini button.aberto { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); }
  .mini button.perigo:hover { background: color-mix(in srgb, var(--perigo) 14%, transparent); color: var(--perigo); }
  .centro { text-align: center; padding: 24px 12px; line-height: 1.6; color: var(--text-dim); font-size: 12.5px; }
  .centro .icone { font-size: 26px; opacity: .55; }
</style>`;

exports.ui = { pagina, icone, ESTILO_NOTAS };
exports._teste = { tela, descendentes };
