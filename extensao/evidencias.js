// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { esc } = require('./ticket')._teste;
const emulador = require('./emulador');

// Evidências por conversa do Claude: <pasta da conversa>/evidencias. O ticket da branch só nomeia os arquivos.
const sessao = require('./sessao');
const aoVivo = require('./componentes/ao-vivo');
const cardCenario = require('./componentes/card-cenario');
const ADB = path.join(emulador.SDK, 'platform-tools', 'adb');
const IMAGEM = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const VIDEO = new Set(['.mp4', '.webm', '.mov']);

// Chave do ticket pela branch do projeto aberto (ex.: feature/WMS-13429-x → WMS-13429).
function ticketAtual() {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!cwd) return Promise.resolve('sem-ticket');
  return new Promise((resolve) => execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }, (err, out) =>
    resolve((!err && String(out).match(/[A-Z][A-Z0-9]+-\d+/i)?.[0].toUpperCase()) || 'sem-ticket')));
}

// Saídas da skill testes-funcionais para o ticket da conversa (o hook crafting-testes.py grava .ticket).
function fontesDaSkill(sid) {
  let t;
  try { t = JSON.parse(fs.readFileSync(path.join(sessao.pasta(sid), '.ticket'), 'utf8')); } catch { return []; }
  return [
    t.mobile && { titulo: 'Skill · prints e vídeo da jornada (Maestro)', dir: path.join(t.mobile, 'resultados', `evidencias-${t.chave}`) },
    t.backend && { titulo: 'Skill · evidência consolidada', dir: path.join(t.backend, 'testes-funcionais', 'resultados', `evidencia-${t.chave}`) }
  ].filter(Boolean);
}

const carimbo = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

function listar(dir) {
  let nomes;
  try { nomes = fs.readdirSync(dir); } catch { return []; }
  return nomes.filter((n) => !n.startsWith('.')).map((n) => {
    const full = path.join(dir, n);
    const st = fs.statSync(full);
    const ext = path.extname(n).toLowerCase();
    return st.isFile() && { nome: n, full, mtime: st.mtimeMs, tipo: IMAGEM.has(ext) ? 'imagem' : VIDEO.has(ext) ? 'video' : 'outro' };
  }).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
}

const adb = (args) => new Promise((resolve) => execFile(ADB, args, { timeout: 30000 }, (err, out, errOut) => resolve({ ok: !err, msg: String(errOut || err?.message || '') })));

const estilo = `
  body { font-family: var(--fc-font); color: var(--text); margin: 0; }
  button { font: inherit; cursor: pointer; }
  .topo { display: flex; align-items: center; gap: 8px; }
  .titulo { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ticket { flex: none; font-family: var(--fc-font); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--r-pill);
    color: var(--accent-soft); background: color-mix(in srgb, var(--accent-soft) 14%, transparent); }
  .pasta { font-size: 10.5px; color: var(--text-dim); margin: 3px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .acoes { display: flex; align-items: center; gap: 4px; margin: 14px 0 4px; }
  .acoes .espaco { flex: 1; }
  .gravar:hover, .icone:hover { background: var(--surface-2); }
  .gravar::before, .gravando::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--danger); margin-right: 7px; vertical-align: 0; }
  .gravando { color: var(--danger); font-weight: 600; background: color-mix(in srgb, var(--danger) 12%, transparent); }
  .gravando::before { animation: pulso 1.1s infinite; }
  @keyframes pulso { 50% { opacity: .2; } }
  #relogio { font-family: var(--fc-font); margin-left: 6px; font-weight: 500; }
  .icone { padding: 5px 7px; color: var(--text-dim); display: flex; }
  .icone:hover { color: var(--text); }
  .icone svg { width: 15px; height: 15px; }
  .erro { color: var(--danger); font-size: 12px; }
  .contagem { font-size: 11px; color: var(--text-dim); margin: 16px 0 8px; display: flex; align-items: center; gap: 6px; }
  .tag { font-size: 10px; padding: 0 6px; border-radius: var(--r-pill); border: 1px solid var(--border); }
  .grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
  .item { position: relative; cursor: pointer; border-radius: var(--r-lg); overflow: hidden; aspect-ratio: 9 / 16;
    background: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,.35); transition: transform .15s, box-shadow .15s; }
  .item:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,.45); }
  .thumb { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
  .play { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; padding-left: 3px; box-sizing: border-box;
    color: var(--on-cor); background: var(--danger); box-shadow: 0 2px 8px color-mix(in srgb, var(--danger) 45%, transparent); }
  .ext { font-size: 11px; font-weight: 700; letter-spacing: .04em; color: var(--text-dim); }
  .legenda { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 7px 6px; font-size: 10px; color: var(--on-cor);
    background: linear-gradient(transparent, rgba(0,0,0,.8)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0; transition: opacity .15s; }
  .item:hover .legenda { opacity: 1; }
  .del { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; padding: 0; border-radius: 50%; font-size: 11px;
    background: rgba(0,0,0,.55); color: var(--on-cor); opacity: 0; transition: opacity .15s; }
  .item:hover .del, .item:hover .arroba { opacity: 1; }
  .arroba { position: absolute; top: 6px; left: 6px; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; font-size: 12px;
    background: rgba(0,0,0,.55); color: var(--on-cor); opacity: 0; transition: opacity .15s; cursor: pointer; }
  .arroba:hover { background: var(--accent); }
  .del:hover { background: var(--danger); }
  .vazio { color: var(--text-dim); }
  .centro { text-align: center; margin-top: 28px; line-height: 1.6; font-size: 12.5px; }
  .centro .icone-grande { font-size: 26px; opacity: .5; }
`;

const { ESTILO_NOTAS } = require('./comandos').ui;
const estiloEvid = `<style>
  .ticket { font-family: var(--fc-font); font-size: 10.5px; font-weight: 600; padding: 1px 7px; border-radius: var(--r-pill);
    color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent); }
  .fb-btn.gravar::before, .fb-btn.gravando::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--perigo); }
  .fb-btn.gravando { color: var(--perigo); font-weight: 600; background: color-mix(in srgb, var(--perigo) 12%, transparent); }
  .fb-btn.gravando::before { animation: pulso 1.1s infinite; }
  .fb-btn.icone { color: var(--text-dim); }
  .fb-btn.icone:hover { color: var(--text); }
  .folha { padding: 10px; }
  .folha .contagem { margin: 0 2px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); display: flex; gap: 6px; align-items: center; }
  .folha .tag { text-transform: none; letter-spacing: 0; }
  .erro { margin: 0 12px 8px; }
</style>`;

const pagina = (nonce, csp, corpo, gravandoDesde) => `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>${estilo}</style></head><body>${corpo}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-acao]');
    if (!el) return;
    e.stopPropagation();
    vscode.postMessage({ acao: el.dataset.acao, nome: el.dataset.nome });
  });
  // Redesenho a cada linha do Ao vivo: a página e a caixa Ao vivo voltam para onde estavam (sem pular para o topo).
  const st = () => vscode.getState() || {};
  const pag = document.scrollingElement;
  pag.scrollTop = st().evPagina || 0;
  ${aoVivo.script('evVivo')}
  ${cardCenario.script('evAbertos')}
  addEventListener('scroll', () => vscode.setState({ ...st(), evPagina: pag.scrollTop }), { passive: true });
  const desde = ${gravandoDesde || 0};
  const rel = document.getElementById('relogio');
  if (desde && rel) setInterval(() => {
    const s = Math.floor((Date.now() - desde) / 1000);
    rel.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }, 500);
</script></body></html>`;

exports.provider = (ctx) => {
  let view, dir, ticket, observador, erro, gravacao, raizesAtuais, todos = [], vigiaQa, vigiadoQa;

  const render = async () => {
    if (!view) return;
    ticket = await ticketAtual();
    const sid = sessao.atual(); // ticket aberto no painel ou, sem ele, a conversa atual
    if (!sid) {
      view.webview.html = pagina(crypto.randomBytes(16).toString('hex'), view.webview.cspSource,
        ESTILO_NOTAS + '<div class="topo"><span class="rotulo">Evidências</span></div><div class="folha"><div class="centro"><div class="icone">💬</div>Nenhuma conversa detectada ainda neste projeto.<br>Envie uma mensagem no Claude.</div></div>');
      return;
    }
    const novo = path.join(sessao.pasta(sid), 'evidencias');
    if (novo !== dir) {
      dir = novo;
      fs.mkdirSync(dir, { recursive: true });
      // Como no hub: o Claude/skill rodando no terminal acha a pasta por esta variável.
      ctx.environmentVariableCollection.replace('WMS_DOC_HUB_EVIDENCE_DIR', dir);
      observador?.dispose();
      observador = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(dir), '*'));
      observador.onDidCreate(render); observador.onDidDelete(render); observador.onDidChange(render);
    }
    // QA: planejamento e Ao vivo do ▶ (qa.js) no topo; redesenha quando o estado ou o Ao vivo mudam.
    const dirQa = sessao.foco() && sessao.focoLista() === 'qa' ? require('./tickets').pasta(sessao.foco(), 'qa') : null;
    if (dirQa !== vigiadoQa) {
      vigiaQa?.close(); vigiaQa = null; vigiadoQa = dirQa;
      if (dirQa) {
        fs.mkdirSync(dirQa, { recursive: true });
        let espera;
        vigiaQa = fs.watch(dirQa, (_, nome) => { if ([...aoVivo.ARQUIVOS, '.qa.json', '.planejamento.json', '.cenarios.json', '.ambiente.json'].includes(nome)) { clearTimeout(espera); espera = setTimeout(render, 200); } });
      }
    }
    const arquivos = listar(dir);
    const extras = fontesDaSkill(sid).map((f) => ({ ...f, arquivos: listar(f.dir) })).filter((f) => f.arquivos.length);
    const raizes = [sessao.RAIZ, sessao.TICKETS, ...extras.map((f) => f.dir)];
    if (JSON.stringify(raizes) !== JSON.stringify(raizesAtuais)) {
      raizesAtuais = raizes;
      view.webview.options = { enableScripts: true, localResourceRoots: raizes.map((r) => vscode.Uri.file(r)) };
    }
    // Evidências por cenário do QA (qa/evidencias/CTnn/<execução>/): também abrem pelo clique.
    const doQa = dirQa ? require('./qa').cenarios(dirQa).cenarios.flatMap((c) => (c.execucoes || []).flatMap((x) => require('./qa').arquivosDe(dirQa, x)))
      .map((full) => ({ nome: path.basename(full), full, tipo: IMAGEM.has(path.extname(full).toLowerCase()) ? 'imagem' : VIDEO.has(path.extname(full).toLowerCase()) ? 'video' : 'outro' })) : [];
    todos = [...arquivos, ...extras.flatMap((f) => f.arquivos), ...doQa];
    const grade = (lista, apagavel) => `<div class="grade">${lista.map((a) => `
        <div class="item" data-acao="abrir" data-nome="${esc(a.full)}" title="${esc(a.full)}">
          <div class="thumb">${a.tipo === 'imagem' ? `<img src="${view.webview.asWebviewUri(vscode.Uri.file(a.full))}?v=${a.mtime}">`
            : a.tipo === 'video' ? '<span class="play">▶</span>'
            : `<span class="ext">${esc(path.extname(a.nome).slice(1).toUpperCase() || 'ARQ')}</span>`}</div>
          <span class="legenda">${esc(a.nome)}</span>
          <button class="arroba" data-acao="mencionar" data-nome="${esc(a.full)}" title="Mencionar no Claude">@</button>
          ${apagavel ? `<button class="del" data-acao="excluir" data-nome="${esc(a.full)}" title="Excluir">✕</button>` : ''}
        </div>`).join('')}</div>`;
    let tituloConversa;
    try { const c = require('./conversas')._teste; tituloConversa = c.titulo(path.join(c.projeto(), `${sid}.jsonl`)); } catch {}
    const corpo = `${ESTILO_NOTAS}${estiloEvid}
      <div class="topo">
        <span class="rotulo">Evidências</span>
        <span class="titulo" title="${esc(sid)}">${esc(tituloConversa || sid.slice(0, 8))}</span>
        ${ticket && ticket !== 'sem-ticket' ? `<span class="ticket">${esc(ticket)}</span>` : ''}
      </div>
      ${erro ? `<p class="erro">${esc(erro)}</p>` : ''}
      ${dirQa ? require('./qa').html(dirQa, (f) => view.webview.asWebviewUri(vscode.Uri.file(f))) : ''}
      ${arquivos.length ? `<div class="folha"><p class="contagem">${arquivos.length} evidência${arquivos.length === 1 ? '' : 's'}</p>${grade(arquivos, true)}</div>` : ''}
      ${extras.map((f) => `<div class="folha"><p class="contagem" title="${esc(f.dir)}">${esc(f.titulo)} <span class="tag">somente leitura</span></p>${grade(f.arquivos, false)}</div>`).join('')}`;
    erro = null;
    view.webview.html = pagina(crypto.randomBytes(16).toString('hex'), view.webview.cspSource, corpo, gravacao?.desde);
  };

  const falhar = (msg) => { erro = msg; render(); };
  const cenarioDir = (nome) => (vigiadoQa && typeof nome === 'string' && path.dirname(path.resolve(nome)) === path.join(vigiadoQa, 'evidencias') ? path.resolve(nome) : null);
  const precisaEmulador = () => {
    const emu = emulador.emuladorRodando();
    if (!emu) falhar('Nenhum emulador rodando. Abra pelo botão 📱 primeiro.');
    return emu;
  };

  const acoes = {
    async print() {
      const emu = precisaEmulador();
      if (!emu) return;
      try {
        fs.writeFileSync(path.join(dir, `${ticket}-print-${carimbo()}.png`), await emulador.print(emu));
      } catch (e) { falhar('Não consegui tirar o print: ' + (e.details || e.message)); }
    },
    // opcoes vindas de fora (testes.js): sid/chave da conversa e continuo = emenda os trechos de 3 min.
    gravar(opcoes = {}) {
      const emu = precisaEmulador();
      if (!emu || gravacao) return;
      const destino = opcoes.destino || (opcoes.sid ? path.join(sessao.pasta(opcoes.sid), 'evidencias') : dir);
      if (!destino) return;
      fs.mkdirSync(destino, { recursive: true });
      const nome = `${opcoes.chave || ticket || 'sem-ticket'}-video-${carimbo()}.mp4`;
      const remoto = `/sdcard/${nome}`;
      const proc = spawn(ADB, ['-s', emu.serial, 'shell', 'screenrecord', remoto], { stdio: 'ignore' });
      const atual = gravacao = { proc, serial: emu.serial, desde: Date.now(), opcoes, parado: false };
      // Sai sozinho no parar (SIGINT) ou no limite de 3 min do Android: em ambos, baixa o vídeo.
      proc.on('exit', async () => {
        gravacao = null;
        render();
        await new Promise((r) => setTimeout(r, 1000)); // screenrecord fecha o mp4 depois do sinal
        const r = await adb(['-s', emu.serial, 'pull', remoto, path.join(destino, nome)]);
        await adb(['-s', emu.serial, 'shell', 'rm', '-f', remoto]);
        if (!r.ok) falhar('Não consegui baixar o vídeo: ' + r.msg);
        if (opcoes.continuo && !atual.parado) acoes.gravar(opcoes);
      });
      render();
    },
    parar() {
      if (!gravacao) return;
      gravacao.parado = true;
      adb(['-s', gravacao.serial, 'shell', 'pkill', '-INT', 'screenrecord']);
    },
    mencionar({ nome }) {
      if (todos.some((x) => x.full === nome)) require('./claude').mencionar(`@${nome}`);
    },
    abrir({ nome }) {
      const a = todos.find((x) => x.full === nome);
      if (!a) return;
      // Os webviews do VS Code não tocam mp4 (sem H.264): vídeo abre no player do sistema.
      if (a.tipo === 'video') vscode.env.openExternal(vscode.Uri.file(a.full));
      else vscode.commands.executeCommand('vscode.open', vscode.Uri.file(a.full), vscode.ViewColumn.Beside);
    },
    async excluir({ nome }) {
      // Só apaga da pasta da conversa; as pastas da skill são só leitura aqui.
      const alvo = path.join(dir, path.basename(nome));
      const ok = await vscode.window.showWarningMessage(`Excluir "${path.basename(nome)}"?`, { modal: true, detail: 'Vai para a lixeira do sistema.' }, 'Excluir');
      if (ok) await vscode.workspace.fs.delete(vscode.Uri.file(alvo), { useTrash: true });
    },
    // Pasta de evidências de um cenário do QA (qa/evidencias/CTnn): só caminhos dentro da pasta do QA aberto.
    pastaCenario({ nome }) {
      const alvo = cenarioDir(nome);
      if (alvo) { fs.mkdirSync(alvo, { recursive: true }); vscode.env.openExternal(vscode.Uri.file(alvo)); }
    },
    async copiarCenario({ nome }) {
      const alvo = cenarioDir(nome);
      if (alvo) { await vscode.env.clipboard.writeText(alvo); vscode.window.showInformationMessage('Caminho das evidências do cenário copiado.'); }
    }
  };

  exports.gravar = (opcoes) => acoes.gravar(opcoes);
  exports.pararGravacao = () => acoes.parar();

  return vscode.Disposable.from(
    { dispose: () => { observador?.dispose(); vigiaQa?.close(); gravacao?.proc.kill(); } },
    require('./grupo').registrar('claudeAbas.evidencias', {
      resolveWebviewView(v) {
        view = v;
        view.webview.onDidReceiveMessage((m) => acoes[m.acao]?.(m));
        view.onDidChangeVisibility(() => view.visible && render()); // pega troca de branch
        sessao.onDidChange(() => render());
        render();
      }
    }, { webviewOptions: { retainContextWhenHidden: true } })
  );
};
