const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

// YouTube Music na barra de status (controle principal) e no espelho da barra de atividades (espelho.js).
// Um Chromium com perfil próprio abre o music.youtube.com numa tela virtual (Xvfb): janela de verdade (só assim
// sai som e o player não trava), mas numa tela que ninguém vê. A extensão lê e controla a página pelo
// protocolo de depuração (DevTools) na porta abaixo.
const PORTA = 9333;
const TELA = ':87'; // tela virtual do Xvfb
const LARGURA_TELA = 1280, ALTURA_TELA = 800;
const PERFIL = path.join(os.homedir(), '.config', 'crafting-table', 'youtube-music');
const URL_YTM = 'https://music.youtube.com';
// Não guardar cópia dos cookies de login para devolver depois: o Google renova esses cookies a cada poucos minutos
// e, ao ver um valor antigo reaparecer, trata como cookie roubado e encerra a sessão (aconteceu).
const SEGREDO_ANTIGO = 'musica.cookies';

const temComando = (c) => { try { execFileSync('which', [c], { stdio: 'ignore' }); return true; } catch { return false; } };
const navegador = () => ['chromium', 'chromium-browser', 'google-chrome'].find(temComando);
const json = async (rota) => (await fetch(`http://127.0.0.1:${PORTA}${rota}`)).json();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── DevTools: uma conexão com a página, refeita quando cai; eventos para quem assinar (o espelho) ──
let conexao = null;
const ouvintes = new Set();
async function conectar(url) {
  const ws = new WebSocket(url);
  await new Promise((ok, erro) => { ws.addEventListener('open', ok); ws.addEventListener('error', erro); });
  let id = 0;
  const pendentes = {};
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { pendentes[m.id]?.(m); delete pendentes[m.id]; } else ouvintes.forEach((f) => f(m));
  });
  ws.addEventListener('close', () => { if (conexao?.ws === ws) conexao = null; });
  const chamar = (method, params = {}) => new Promise((ok) => { pendentes[++id] = ok; ws.send(JSON.stringify({ id, method, params })); });
  return { ws, chamar };
}
async function pagina() {
  if (conexao) return conexao;
  const alvo = (await json('/json')).find((t) => t.type === 'page');
  if (!alvo) throw new Error('sem página');
  conexao = await conectar(alvo.webSocketDebuggerUrl);
  conexao.novo = true; // o espelho religa o screencast quando a conexão é refeita
  return conexao;
}
const chamar = async (method, params) => (await pagina()).chamar(method, params);
async function avaliar(expr) {
  const r = await chamar('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
}

// ── O que a página sabe (seletores do music.youtube.com; ajustar aqui quando o site mudar) ──
const LER_ESTADO = `(() => {
  const v = document.querySelector('video');
  const barra = document.querySelector('ytmusic-player-bar');
  return {
    musica: location.hostname === 'music.youtube.com',
    // Só dá para dizer "deslogado" com a barra do topo desenhada (o botão Sign in aparece nela).
    pronto: !!document.querySelector('ytmusic-nav-bar ytmusic-settings-button, ytmusic-nav-bar .sign-in-link'),
    logado: location.hostname === 'music.youtube.com' && !!document.querySelector('ytmusic-nav-bar ytmusic-settings-button, ytmusic-nav-bar .sign-in-link')
      && !document.querySelector('a[href*="ServiceLogin"]'),
    titulo: barra?.querySelector('.title')?.innerText?.trim() || '',
    artista: (barra?.querySelector('.byline')?.innerText || '').split('•')[0].trim(),
    tocando: !!v && !v.paused && !!barra?.querySelector('.title')?.innerText
  };
})()`;
// Itens tocáveis da página: sugestões da página inicial ou resultados da pesquisa.
const LER_ITENS = `(() => {
  const out = [], vistos = new Set();
  const busca = location.pathname.startsWith('/search');
  const itens = busca ? document.querySelectorAll('ytmusic-search-page ytmusic-responsive-list-item-renderer')
    : document.querySelectorAll('ytmusic-carousel-shelf-renderer ytmusic-two-row-item-renderer, ytmusic-carousel-shelf-renderer ytmusic-responsive-list-item-renderer');
  for (const i of itens) {
    const href = [...i.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).find((h) => /^(watch|playlist)\\?/.test(h));
    if (!href || vistos.has(href)) continue;
    vistos.add(href);
    const linhas = i.innerText.split('\\n').map((x) => x.trim()).filter(Boolean);
    const secao = busca ? 'Resultados' : (i.closest('ytmusic-carousel-shelf-renderer')?.querySelector('ytmusic-carousel-shelf-basic-header-renderer .title')?.innerText || '').trim();
    out.push({ secao, titulo: linhas[0] || '', sub: linhas.slice(1).join(' · '), href });
  }
  return out.slice(0, 80);
})()`;
// Ir para o início sem recarregar: a música continua e as sugestões voltam para a página.
const INICIO = `(() => { const a = document.querySelector('ytmusic-pivot-bar-item-renderer[tab-id="FEmusic_home"], a[href="/"]'); a?.click(); return !!a; })()`;
const CLICAR = (sel) => `(() => { const b = document.querySelector(${JSON.stringify(sel)}); b?.click(); return !!b; })()`;
// Toca pelo botão de play do item (sem recarregar); sem ele, pelo link do título; recarregar só em último caso.
const tocar = (href) => avaliar(`(() => {
  const a = document.querySelector('a[href=' + ${JSON.stringify(JSON.stringify(href))} + ']');
  const b = a?.closest('ytmusic-two-row-item-renderer, ytmusic-responsive-list-item-renderer')?.querySelector('ytmusic-play-button-renderer');
  if (b) b.click(); else if (a) a.click(); else location.href = ${JSON.stringify(`${URL_YTM}/${href.replace(/^playlist\?/, 'watch?')}`)};
})()`);
// Pesquisa pela caixa do próprio site (navegação interna: a música que está tocando continua).
async function pesquisar(q) {
  const ok = await avaliar(`(() => {
    const caixa = document.querySelector('ytmusic-search-box input#input, ytmusic-search-box input');
    if (!caixa) return false;
    caixa.focus(); caixa.value = ${JSON.stringify(q)};
    caixa.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (ok) for (const type of ['keyDown', 'keyUp']) await chamar('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });
  else await avaliar(`location.href = ${JSON.stringify(`${URL_YTM}/search?q=${encodeURIComponent(q)}`)}`);
}

// ── Liga a tela virtual e o Chromium (ou se reconecta a eles, depois de um reload do VS Code) ──
let ligacao = null; // barra de status e espelho podem pedir ao mesmo tempo: um Chromium só
const ligar = () => (ligacao ||= ligarDeVerdade().finally(() => { ligacao = null; }));
async function ligarDeVerdade() {
  try { await json('/json/version'); return 'ja'; } catch {}
  const bin = navegador();
  if (!bin) throw new Error('instale o Chromium (sudo apt install chromium)');
  const xvfb = temComando('Xvfb');
  if (xvfb && !fs.existsSync(`/tmp/.X${TELA.slice(1)}-lock`)) {
    spawn('Xvfb', [TELA, '-screen', '0', `${LARGURA_TELA}x${ALTURA_TELA}x24`, '-nolisten', 'tcp'], { stdio: 'ignore', detached: true }).unref();
    for (let i = 0; i < 20 && !fs.existsSync(`/tmp/.X11-unix/X${TELA.slice(1)}`); i++) await espera(100);
  }
  fs.mkdirSync(PERFIL, { recursive: true });
  const env = { ...process.env, ...(xvfb ? { DISPLAY: TELA } : {}) };
  if (xvfb) delete env.WAYLAND_DISPLAY;
  spawn(bin, [`--user-data-dir=${PERFIL}`, `--remote-debugging-port=${PORTA}`, `--app=${URL_YTM}`, '--ozone-platform=x11',
    '--window-position=0,0', `--window-size=${LARGURA_TELA},${ALTURA_TELA}`, '--autoplay-policy=no-user-gesture-required',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    '--no-first-run', '--no-default-browser-check'], { stdio: 'ignore', detached: true, env }).unref();
  // Reload do VS Code não fecha o Chromium (a extensão se reconecta); quando o VS Code fecha de verdade, o vigia
  // fecha o Chromium pelo Browser.close (grava os cookies) e desliga a tela virtual.
  spawn(process.execPath, [path.join(__dirname, 'bin', 'vigia-musica.js'), String(process.ppid), String(PORTA), TELA],
    { stdio: 'ignore', detached: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }).unref();
  for (let i = 0; i < 60; i++) { try { await json('/json/version'); return xvfb ? 'novo' : 'novo-sem-xvfb'; } catch { await espera(250); } }
  throw new Error('o Chromium não respondeu');
}
async function fechar() {
  try { const b = await conectar((await json('/json/version')).webSocketDebuggerUrl); await b.chamar('Browser.close'); } catch {}
}

// ── Barra de status: [▶ ícone][letreiro][⌄] ──
exports.provider = (ctx) => {
  const icone = vscode.window.createStatusBarItem('craftingTable.musica.icone', vscode.StatusBarAlignment.Left, -100);
  const texto = vscode.window.createStatusBarItem('craftingTable.musica.texto', vscode.StatusBarAlignment.Left, -101);
  const seta = vscode.window.createStatusBarItem('craftingTable.musica.seta', vscode.StatusBarAlignment.Left, -102);
  for (const i of [icone, texto, seta]) i.name = 'YouTube Music';
  icone.text = '$(play-circle)';
  icone.color = '#ff0033';
  icone.command = texto.command = 'craftingTable.musica.alternar';
  seta.text = '$(chevron-down)';
  seta.command = 'craftingTable.musica.lista';
  seta.tooltip = 'YouTube Music: sugestões, pesquisa e controles';
  [icone, texto, seta].forEach((i) => i.show());

  let estado = null; // último LER_ESTADO; null = fechado
  let pos = 0, ligando = false;
  ctx.secrets.delete(SEGREDO_ANTIGO); // cópia da versão anterior: não serve mais
  const LARGURA = 26;

  const letreiro = () => {
    if (ligando) { texto.text = '$(loading~spin) YouTube Music'; return; }
    if (!estado?.titulo) { texto.text = 'YouTube Music'; texto.tooltip = estado ? 'Escolha uma música na ⌄' : 'Abrir o YouTube Music'; return; }
    const nome = `${estado.titulo}${estado.artista ? ` — ${estado.artista}` : ''}`;
    texto.tooltip = `${estado.tocando ? 'Pausar' : 'Tocar'}: ${nome}`;
    if (!estado.tocando) { texto.text = `$(debug-pause) ${nome.slice(0, LARGURA)}`; return; }
    if (nome.length <= LARGURA) { texto.text = nome; return; }
    // O nome entra pela direita e some atrás do ícone, em volta contínua.
    const fita = `${nome}     •     `;
    pos = (pos + 1) % fita.length;
    texto.text = (fita + fita).slice(pos, pos + LARGURA);
  };

  const atualizar = async () => {
    try {
      estado = await avaliar(LER_ESTADO);
    } catch { estado = null; conexao = null; }
  };

  const abrir = async () => {
    if (ligando) return;
    ligando = true; letreiro();
    try {
      const r = await ligar();
      if (r === 'novo-sem-xvfb') vscode.window.showWarningMessage('YouTube Music: sem o Xvfb a janela do Chromium aparece na tela. Instale com: sudo apt install xvfb');
      for (let i = 0; i < 40 && !estado?.musica; i++) { await espera(500); await atualizar(); }
    } catch (e) {
      vscode.window.showErrorMessage(`YouTube Music: ${e.message}`);
    } finally { ligando = false; }
  };

  const timers = [setInterval(atualizar, 1000), setInterval(letreiro, 280)];

  const comandos = [
    vscode.commands.registerCommand('craftingTable.musica.alternar', async () => {
      if (!estado) return abrir();
      if (!estado.titulo) return vscode.commands.executeCommand('craftingTable.musica.lista');
      await avaliar(CLICAR('#play-pause-button'));
      setTimeout(atualizar, 300);
    }),
    vscode.commands.registerCommand('craftingTable.musica.lista', async () => {
      const qp = vscode.window.createQuickPick();
      qp.placeholder = 'Escolha o que tocar, ou digite para pesquisar no YouTube Music';
      qp.matchOnDescription = true;
      qp.busy = true;
      qp.show();
      if (!estado) await abrir();
      if (!estado) return qp.hide();
      const controles = [
        { label: '$(debug-step-over) Próxima', acao: () => avaliar(CLICAR('.next-button')) },
        { label: '$(debug-reverse-continue) Anterior', acao: () => avaliar(CLICAR('.previous-button')) },
        { label: '$(home) Voltar às sugestões', acao: () => avaliar(INICIO) },
        { label: '$(play-circle) Abrir o espelho do YouTube Music', acao: () => vscode.commands.executeCommand('claudeAbas.musica.focus') },
        { label: '$(close) Fechar YouTube Music', acao: fechar }
      ];
      // Sem login toca as sugestões gerais; entrar na conta é pelo espelho (a tela de login do Google).
      if (!estado.logado) controles.push({ label: '$(account) Entrar na conta do YouTube Music', description: 'sugestões da sua conta',
        acao: async () => { await avaliar(`document.querySelector('a[href*="ServiceLogin"]')?.click()`); vscode.commands.executeCommand('claudeAbas.musica.focus'); } });

      let itens = [];
      const montar = () => {
        const q = qp.value.trim();
        const lista = [];
        if (q) lista.push({ label: `$(search) Pesquisar "${q}" no YouTube Music`, alwaysShow: true, manter: true,
          acao: async () => { qp.busy = true; await pesquisar(q); itens = []; for (let i = 0; i < 10 && !itens.length; i++) { await espera(600); itens = (await avaliar(LER_ITENS)) || []; } qp.value = ''; montar(); qp.busy = false; } });
        let secao;
        for (const s of itens) {
          if (s.secao !== secao) { secao = s.secao; lista.push({ label: secao || 'Sugestões', kind: vscode.QuickPickItemKind.Separator }); }
          lista.push({ label: s.titulo, description: s.sub, acao: () => tocar(s.href) });
        }
        if (!itens.length && !q) lista.push({ label: 'Nenhuma sugestão na página agora', description: 'use "Voltar às sugestões"', acao: () => {} });
        qp.items = [...lista, { label: 'Controles', kind: vscode.QuickPickItemKind.Separator }, ...controles];
      };
      for (let i = 0; i < 8 && !itens.length; i++) {
        itens = (await avaliar(LER_ITENS).catch(() => [])) || [];
        if (!itens.length) { if (i === 0) await avaliar(INICIO).catch(() => {}); await espera(700); }
      }
      montar();
      qp.busy = false;
      qp.onDidChangeValue(montar);
      qp.onDidAccept(async () => {
        const it = qp.selectedItems[0];
        if (!it?.manter) qp.hide();
        await it?.acao?.();
        setTimeout(atualizar, 800);
      });
      qp.onDidHide(() => qp.dispose());
    })
  ];

  letreiro();
  atualizar();
  return vscode.Disposable.from(icone, texto, seta, ...comandos, { dispose: () => timers.forEach(clearInterval) });
};

// Para o espelho (espelho.js): ligar o Chromium e conversar com a página.
exports.cdp = { ligar, chamar, ouvir: (f) => { ouvintes.add(f); return { dispose: () => ouvintes.delete(f) }; }, conexaoNova: () => conexao?.novo && !(conexao.novo = false) };
exports._teste = { LER_ESTADO, LER_ITENS, INICIO, PORTA, avaliar, tocar, pesquisar };
