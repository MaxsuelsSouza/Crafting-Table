const vscode = require('vscode');
const crypto = require('crypto');
const { cdp } = require('./musica');

// Espelho do YouTube Music: mostra ao vivo a página do Chromium escondido (screencast do DevTools) e devolve
// cliques, rolagem e teclado. A página é redimensionada para o tamanho da view, então nada fica espremido.
// Só transmite enquanto a view está visível. O som sai do Chromium, com ou sem o espelho aberto.

const pagina = (nonce) => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #030303; }
  #tela { display: block; width: 100%; height: 100%; object-fit: fill; outline: none; user-select: none; -webkit-user-drag: none; }
  #aviso { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #aaa;
    font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-align: center; padding: 20px; pointer-events: none; }
  #aviso[hidden] { display: none; }
</style></head><body>
<img id="tela" tabindex="0" alt="">
<div id="aviso">Ligando o YouTube Music…</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const tela = document.getElementById('tela'), aviso = document.getElementById('aviso');
  // Tamanho da view → tamanho da página no Chromium
  new ResizeObserver(() => vscode.postMessage({ tipo: 'tamanho', w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 })).observe(document.body);
  addEventListener('message', (e) => {
    const m = e.data;
    if (m.tipo === 'quadro') { tela.src = 'data:image/jpeg;base64,' + m.data; aviso.hidden = true; }
    if (m.tipo === 'aviso') { aviso.textContent = m.texto; aviso.hidden = !m.texto; }
  });
  // Posição como fração da imagem: a extensão converte para o tamanho atual da página.
  const pos = (e) => ({ fx: e.offsetX / tela.clientWidth, fy: e.offsetY / tela.clientHeight });
  const mods = (e) => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
  const BOTAO = ['left', 'middle', 'right'];
  tela.addEventListener('mousedown', (e) => { tela.focus(); e.preventDefault(); vscode.postMessage({ tipo: 'mouse', type: 'mousePressed', button: BOTAO[e.button], clickCount: e.detail || 1, modifiers: mods(e), ...pos(e) }); });
  tela.addEventListener('mouseup', (e) => vscode.postMessage({ tipo: 'mouse', type: 'mouseReleased', button: BOTAO[e.button], clickCount: e.detail || 1, modifiers: mods(e), ...pos(e) }));
  let ultimoMove = 0;
  tela.addEventListener('mousemove', (e) => { if (Date.now() - ultimoMove < 40) return; ultimoMove = Date.now(); vscode.postMessage({ tipo: 'mouse', type: 'mouseMoved', button: 'none', modifiers: mods(e), ...pos(e) }); });
  tela.addEventListener('wheel', (e) => { e.preventDefault(); vscode.postMessage({ tipo: 'roda', deltaX: e.deltaX, deltaY: e.deltaY, ...pos(e) }); }, { passive: false });
  tela.addEventListener('contextmenu', (e) => e.preventDefault());
  // Teclado: só com o espelho em foco. Atalhos com Ctrl/Cmd ficam para o VS Code (menos editar texto).
  const tecla = (type) => (e) => {
    // Colar: a área de transferência do Chromium escondido é outra; a extensão lê a do VS Code e digita o texto.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); if (type === 'keyDown') vscode.postMessage({ tipo: 'colarDoVscode' }); return; }
    if ((e.ctrlKey || e.metaKey) && !'acxz'.includes(e.key.toLowerCase())) return;
    e.preventDefault();
    vscode.postMessage({ tipo: 'tecla', type, key: e.key, code: e.code, keyCode: e.keyCode, modifiers: mods(e) });
  };
  tela.addEventListener('keydown', tecla('keyDown'));
  tela.addEventListener('keyup', tecla('keyUp'));
  // Colar pelo menu (botão direito do VS Code): manda o texto direto.
  document.addEventListener('paste', (e) => { e.preventDefault(); vscode.postMessage({ tipo: 'colar', texto: e.clipboardData.getData('text') }); });
</script></body></html>`;

exports.provider = () => {
  let view, tam = { w: 400, h: 700, dpr: 1 }, transmitindo = false, vigia, ultimoQuadro = 0;
  const avisar = (texto) => view?.webview.postMessage({ tipo: 'aviso', texto });

  const ligarEspelho = async () => {
    if (!view?.visible) return;
    try {
      if ((await cdp.ligar()) !== 'ja') transmitindo = false;
      if (cdp.conexaoNova()) transmitindo = false;
      if (transmitindo) return;
      // Passkey: a janela nativa do Chromium abriria na tela virtual, invisível, e o login travaria.
      // Sem a interface nativa, o Google oferece "Tentar de outro jeito" (senha, código no celular).
      await cdp.chamar('WebAuthn.enable', { enableUI: false });
      await cdp.chamar('Emulation.setDeviceMetricsOverride', { width: Math.round(tam.w), height: Math.round(tam.h), deviceScaleFactor: tam.dpr, mobile: false });
      await cdp.chamar('Page.startScreencast', { format: 'jpeg', quality: 75, maxWidth: Math.round(tam.w * tam.dpr), maxHeight: Math.round(tam.h * tam.dpr) });
      transmitindo = true;
    } catch (e) { transmitindo = false; avisar(`YouTube Music indisponível: ${e.message}`); }
  };
  const pararEspelho = async () => {
    if (!transmitindo) return;
    transmitindo = false;
    try { await cdp.chamar('Page.stopScreencast'); await cdp.chamar('Emulation.clearDeviceMetricsOverride'); } catch {}
  };

  const quadros = cdp.ouvir((m) => {
    if (m.method !== 'Page.screencastFrame') return;
    cdp.chamar('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
    ultimoQuadro = Date.now();
    if (view?.visible) view.webview.postMessage({ tipo: 'quadro', data: m.params.data });
  });

  const receber = async (m) => {
    const x = (m.fx ?? 0) * tam.w, y = (m.fy ?? 0) * tam.h;
    try {
      if (m.tipo === 'tamanho') { tam = { w: m.w, h: m.h, dpr: m.dpr }; transmitindo = false; return ligarEspelho(); }
      if (m.tipo === 'mouse') return cdp.chamar('Input.dispatchMouseEvent', { type: m.type, x, y, button: m.button, clickCount: m.clickCount || 0, modifiers: m.modifiers });
      if (m.tipo === 'roda') return cdp.chamar('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: m.deltaX, deltaY: m.deltaY });
      if (m.tipo === 'colar') return cdp.chamar('Input.insertText', { text: m.texto });
      if (m.tipo === 'colarDoVscode') return cdp.chamar('Input.insertText', { text: await vscode.env.clipboard.readText() });
      if (m.tipo === 'tecla') {
        const texto = m.key === 'Enter' ? '\r' : m.key.length === 1 ? m.key : undefined;
        const type = m.type === 'keyUp' ? 'keyUp' : texto ? 'keyDown' : 'rawKeyDown';
        return cdp.chamar('Input.dispatchKeyEvent', { type, key: m.key, code: m.code, windowsVirtualKeyCode: m.keyCode, modifiers: m.modifiers,
          ...(type === 'keyDown' ? { text: texto, unmodifiedText: texto } : {}) });
      }
    } catch {}
  };

  const navegar = (expr) => cdp.chamar('Runtime.evaluate', { expression: expr }).catch(() => {});
  const botoes = [
    vscode.commands.registerCommand('claudeAbas.musica.recarregar', async () => { await cdp.chamar('Page.reload').catch(() => {}); transmitindo = false; }),
    vscode.commands.registerCommand('claudeAbas.musica.voltar', () => navegar('history.back()')),
    vscode.commands.registerCommand('claudeAbas.musica.inicio', () => navegar(`location.href = 'https://music.youtube.com/'`))
  ];

  return vscode.Disposable.from(quadros, ...botoes, { dispose: () => clearInterval(vigia) }, vscode.window.registerWebviewViewProvider('claudeAbas.musica', {
    resolveWebviewView(v) {
      view = v;
      view.webview.options = { enableScripts: true };
      view.webview.html = pagina(crypto.randomBytes(16).toString('hex'));
      view.webview.onDidReceiveMessage(receber);
      view.onDidChangeVisibility(() => (view.visible ? ligarEspelho() : pararEspelho()));
      // Chromium fechado ou reconectado (reload): religa a transmissão. Sem quadro há 5 s (a troca de site
      // no login às vezes para o screencast): recomeça, o que também manda a imagem atual.
      vigia = setInterval(() => {
        if (!view.visible) return;
        if (transmitindo && Date.now() - ultimoQuadro > 5000) { transmitindo = false; ultimoQuadro = Date.now(); }
        ligarEspelho();
      }, 2000);
      ligarEspelho();
    }
  }, { webviewOptions: { retainContextWhenHidden: true } }));
};
