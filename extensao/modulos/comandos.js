// @ts-check
const vscode = require('vscode');
const crypto = require('crypto');
const path = require('path');
const { execFile } = require('child_process');
const botao = require('../componentes/botao');
const { esc } = require('../infra/texto');
const cardComando = require('../componentes/card-comando');

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

// Bloco: nome + ▶ (roda os comandos de cima para baixo) + os comandos com a alça ⠿ para arrastar; a ordem da lista é a ordem de execução.
const blocoHtml = (bl, botoes, procs) => {
  const itens = bl.ids.map((id) => botoes.find((b) => b.id === id)).filter(Boolean);
  return `<div class="bloco"><div class="bloco-topo"><span class="bloco-nome">${esc(bl.nome)}</span><span class="bloco-qtd">${itens.length} ${itens.length === 1 ? 'comando' : 'comandos'} · ordem de cima para baixo</span>
    <span class="espaco"></span>${botao.botao('＋ Adicionar comando', { variante: 'contorno', acao: 'adicionarComando', id: bl.id, titulo: 'Novo comando neste bloco' })}
    ${botao.botao('▶ Executar bloco', { variante: 'contorno', acao: 'rodarBloco', id: bl.id, titulo: 'Executa os comandos na ordem da lista' })}
    ${botao.botao('✕', { perigo: true, acao: 'removerBloco', id: bl.id, titulo: 'Remover o bloco (os comandos ficam)' })}</div>
    <ul class="cartoes bloco-lista" data-bloco="${esc(bl.id)}">${itens.map((b) => cardComando.comando(b, Boolean(terminalDe(b)), procs[b.id], true)).join('')}</ul></div>`;
};

const tela = (todos, procs = {}, blocos = []) => {
  const emBloco = new Set(blocos.flatMap((bl) => bl.ids));
  const botoes = todos.filter((b) => !emBloco.has(b.id));
  return `${ESTILO_NOTAS}<style>${cardComando.CSS}${CSS_BLOCO}</style>
  <div class="topo"><span class="rotulo">Comandos</span><span class="titulo"></span>
    <span class="extra">${todos.length ? `${todos.length} ${todos.length === 1 ? 'botão' : 'botões'}` : ''}</span></div>
  <div class="barras">
    <span class="dica">${todos.filter((b) => terminalDe(b)).length ? `${todos.filter((b) => terminalDe(b)).length} rodando` : ''}</span>
    <span class="espaco"></span>
    ${botao.botao('＋ Criar bloco', { variante: 'principal', grande: true, acao: 'criarBloco' })}
  </div>
  ${blocos.map((bl) => blocoHtml(bl, todos, procs)).join('')}
  ${botoes.length ? `<ul class="cartoes">${botoes.map((b) => cardComando.comando(b, Boolean(terminalDe(b)), procs[b.id])).join('')}</ul>`
    : todos.length ? '' : `<div class="folha"><div class="centro"><div class="icone">▶</div>Nenhum bloco ainda.<br>Clique em <b>Criar bloco</b> e, no bloco, em <b>Adicionar comando</b>: nome, comando e pasta.<br><code>Metro · yarn start · ~/wms-mobile</code></div></div>`}`;
};

const CSS_BLOCO = `
  .bloco { margin: 0 12px 12px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface-2); }
  .bloco-topo { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
  .bloco-nome { font-size: 12.5px; font-weight: 600; }
  .bloco-qtd { font-size: 10.5px; color: var(--text-dim); }
  .bloco-topo .espaco { flex: 1; }
  .bloco .cartoes { padding: 0 8px 8px; }
`;

// Arrastar pela alça ⠿ reordena os comandos do bloco e avisa a nova ordem (comandos:reordenar). Roda na página do painel (moldura.js).
const scriptBloco = () => `
  (() => {
    let arrastando = null;
    document.addEventListener('mousedown', (e) => { const a = e.target.closest?.('.alca'); if (a) a.closest('li').draggable = true; });
    document.addEventListener('dragstart', (e) => {
      const li = e.target.closest?.('li[data-bloco-item]');
      if (!li) return;
      arrastando = li; li.classList.add('arrastando');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', li.dataset.id);
    });
    document.addEventListener('dragover', (e) => {
      const li = e.target.closest?.('li[data-bloco-item]');
      if (!arrastando || !li || li === arrastando || li.parentNode !== arrastando.parentNode) return;
      e.preventDefault();
      const r = li.getBoundingClientRect();
      li.parentNode.insertBefore(arrastando, e.clientY > r.top + r.height / 2 ? li.nextSibling : li);
    });
    document.addEventListener('drop', (e) => { if (arrastando) e.preventDefault(); });
    document.addEventListener('dragend', () => {
      if (!arrastando) return;
      const ul = arrastando.parentNode;
      arrastando.draggable = false; arrastando.classList.remove('arrastando');
      enviar({ acao: 'comandos:reordenar', id: ul.dataset.bloco, op: [...ul.querySelectorAll('li[data-bloco-item]')].map((l) => l.dataset.id).join(',') });
      arrastando = null;
    });
  })();`;

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


/** @typedef {{ id: string, nome: string, comando: string, pasta: string, rodando: boolean }} Botao */
/** @typedef {{ html: () => string, blocos: () => { id: string, nome: string, ids: string[] }[], lista: () => Botao[], alternar: (m: { id: string }) => any, acao: (m: any) => any, atualizar: () => void }} Api */
// Ponte com o painel (Configurações → Comandos e rodapé do ticket); null enquanto a seção não está montada.
exports.api = /** @type {Api | null} */ (null);
exports.provider = (ctx) => {
  const botoes = () => ctx.globalState.get('botoes', []);
  const salvar = (l) => ctx.globalState.update('botoes', l);
  const achar = (id) => botoes().find((b) => b.id === id);
  // Blocos de comandos ({ id, nome, ids }): a ordem de ids é a ordem de execução. Na primeira vez nasce "Iniciar aplicação" com 4 dos comandos que já existem.
  const blocos = () => {
    const salvos = ctx.globalState.get('blocos');
    const ids = new Set(botoes().map((b) => b.id));
    if (salvos) return salvos.map((bl) => ({ ...bl, ids: bl.ids.filter((id) => ids.has(id)) }));
    const iniciais = botoes().slice(0, 4).map((b) => b.id);
    if (!iniciais.length) return [];
    const l = [{ id: 'iniciar-aplicacao', nome: 'Iniciar aplicação', ids: iniciais }];
    ctx.globalState.update('blocos', l);
    return l;
  };
  const abertos = new Set(); // botões com a lista de processos aberta
  let cache = null; // html da aba Configurações → Comandos (a lista de processos é assíncrona)
  const render = async () => {
    const procs = {};
    for (const id of abertos) {
      const b = achar(id);
      const shell = b && await terminalDe(b)?.processId;
      procs[id] = shell ? await descendentes(shell) : [];
    }
    cache = tela(botoes(), procs, blocos());
    ouvintes.forEach((f) => f());
  };
  const depois = () => setTimeout(render, 700); // dá tempo do processo morrer

  const acoes = {
    async adicionar() {
      const b = await perguntar();
      if (b) { await salvar([...botoes(), { id: crypto.randomUUID(), ...b }]); render(); }
    },
    async criarBloco() {
      const nome = await vscode.window.showInputBox({ title: 'Nome do bloco', placeHolder: 'Iniciar aplicação', ignoreFocusOut: true });
      if (!nome?.trim()) return;
      await ctx.globalState.update('blocos', [...blocos(), { id: crypto.randomUUID(), nome: nome.trim(), ids: [] }]);
      render();
    },
    async adicionarComando({ id }) {
      const b = await perguntar();
      if (!b) return;
      const atuais = blocos(), novo = { id: crypto.randomUUID(), ...b };
      await salvar([...botoes(), novo]);
      await ctx.globalState.update('blocos', atuais.map((bl) => (bl.id === id ? { ...bl, ids: [...bl.ids, novo.id] } : bl)));
      render();
    },
    async removerBloco({ id }) {
      const bl = blocos().find((x) => x.id === id);
      const ok = await vscode.window.showWarningMessage(`Remover o bloco "${bl?.nome}"? Os comandos dele continuam na lista.`, { modal: true }, 'Remover');
      if (ok) { await ctx.globalState.update('blocos', blocos().filter((x) => x.id !== id)); render(); }
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
    reordenar({ id, op }) {
      const novos = String(op || '').split(',').filter(Boolean);
      ctx.globalState.update('blocos', blocos().map((bl) => (bl.id === id ? { ...bl, ids: novos.filter((x) => bl.ids.includes(x)) } : bl)));
      render();
    },
    // Executa o bloco de cima para baixo (os que já estão rodando ficam como estão).
    async rodarBloco({ id }) {
      const bl = blocos().find((x) => x.id === id);
      for (const bid of bl?.ids || []) {
        const b = achar(bid);
        if (b && !terminalDe(b)) { acoes.rodar({ id: bid }); await new Promise((r) => setTimeout(r, 2000)); }
      }
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
      require('../infra/agentes/conversa').mencionar(`[Comando "${b.nome}" da Crafting Table · comando: \`${b.comando}\` · pasta: ${b.pasta} · ${shell ? `rodando no terminal "${b.nome}" (shell PID ${shell}${pids.length ? `, processos ${pids.join(', ')}` : ''})` : 'parado'}]`);
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

  // A tela mora em Configurações → Comandos e o atalho no rodapé do ticket (moldura.js): ela pede o html e repassa os cliques.
  exports.api = {
    html: () => cache ?? tela(botoes(), {}, blocos()),
    lista: () => botoes().map((b) => ({ id: b.id, nome: b.nome, comando: b.comando, pasta: b.pasta, rodando: Boolean(terminalDe(b)) })),
    blocos: () => blocos(),
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
  .folha { margin: 0 12px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--sombra); }
  .cartoes { list-style: none; margin: 0; padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
  .cartoes > li { padding: 9px 8px 9px 10px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--sombra);
    transition: border-color 140ms, transform 140ms; }
  .cartoes > li:hover { background: var(--surface); border-color: var(--accent); transform: translateY(-1px); }
  .centro { text-align: center; padding: 24px 12px; line-height: 1.6; color: var(--text-dim); font-size: 12.5px; }
  .centro .icone { font-size: 26px; opacity: .55; }
  ${botao.CSS}
</style>`;

exports.ui = { pagina, ESTILO_NOTAS };
exports.scriptBloco = scriptBloco;
exports._teste = { tela, descendentes };
