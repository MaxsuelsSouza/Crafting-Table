// @ts-check
const { CSS: MARCA, fontesCss } = require('./marca');
const vscode = require('vscode');
const rodape = require('../componentes/rodape');

// Junta várias telas numa só view (uma seção visível por vez).
// Cada módulo continua igual: registra a sua tela por aqui e recebe uma view "de mentira";
// só a seção ativa chega à tela de verdade. As outras continuam renderizando por baixo, sem aparecer.
// A primeira seção é a principal. Se ela tiver moldura(id), as outras são mostradas dentro dela
// (cabeçalho e rodapé da principal); senão, um menu simples no topo troca as seções.
const GRUPOS = {
  'claudeAbas.tickets': [['claudeAbas.painel', 'Ticket'], ['claudeAbas.evidencias', 'Evidências'], ['claudeAbas.conversas', 'Conversas']]
};
// Seções feitas de duas telas, uma embaixo da outra na mesma página (as duas usam a pagina() de comandos.js).
const JUNTAS = {};
const parteDe = (id) => Object.keys(JUNTAS).find((j) => JUNTAS[j].includes(id));
const partes = {}; // id da parte -> provider
const grupoDe = (id) => Object.keys(GRUPOS).find((g) => GRUPOS[g].some(([s]) => s === id));
const secoes = {}; // id da seção -> { provider }
const montados = {}; // grupo -> { adicionar(alvo), remover(alvo) }: janelas extras que espelham a mesma tela (tela cheia)
let painelCheia = null;
let memoria; // globalState: última seção aberta de cada grupo (só grupos sem moldura)

const MENU_CSS = `<style>
  .grupo-menu { display: flex; gap: 2px; margin: 10px 12px 2px; padding: 4px; overflow-x: auto; scrollbar-width: none; border-radius: var(--r-lg);
    background: var(--surface); border: 1px solid var(--border); }
  .grupo-menu button { flex: none; height: 24px; padding: 0 9px; border: 0; border-radius: var(--r-md); background: transparent; cursor: pointer;
    color: var(--text); font: inherit; font-size: 11.5px; }
  .grupo-menu button:hover { background: var(--surface-2); }
  .grupo-menu button.is-on { background: var(--accent); color: var(--on-cor); font-weight: 600; }
</style>`;

// Entrega a API do VS Code para o menu e para o script da página (acquireVsCodeApi só pode ser chamado uma vez).
//   [data-secao]           troca de seção; com data-aba/data-cmd, a principal recebe { acao: cmd || 'aba', id: aba } antes
//   [data-painel="cmd"]    manda { acao: cmd, id } para a principal sem trocar de seção (botões da moldura)
const script = (n) => `<script${n}>(() => {
    const api = acquireVsCodeApi(); window.acquireVsCodeApi = () => api;
    ${rodape.script()}
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-secao],[data-painel]');
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.painel) return api.postMessage({ acao: '__painel', cmd: b.dataset.painel, id: b.dataset.id });
      if (b.classList.contains('is-on') && !b.dataset.aba && !b.dataset.cmd) return;
      window.dispatchEvent(new Event('crafting:sair')); // a página grava o que estiver pendente antes de sumir
      api.postMessage({ acao: '__secao', id: b.dataset.secao, aba: b.dataset.aba, cmd: b.dataset.cmd });
    }, true);
  })();</script>`;

// Fonte única da extensão: Mono em todo texto (a nota mantém a fonte escolhida no editor, que é mais específica).

function comMenu(html, grupo, atual, moldura, web) {
  const nonce = html.match(/nonce-([A-Za-z0-9+/=]+)/)?.[1];
  const n = nonce ? ` nonce="${nonce}"` : '';
  const principal = GRUPOS[grupo][0][0];
  const m = moldura && atual !== principal ? moldura(atual) : null;
  const css = MARCA + fontesCss((p) => web.asWebviewUri(vscode.Uri.file(p))) + (moldura ? m?.css || '' : MENU_CSS); // a paleta da marca vem por último no head: vale sobre os :root de cada tela
  const topo = moldura ? m?.topo || ''
    : `<nav class="grupo-menu">${GRUPOS[grupo].map(([id, nome]) => `<button data-secao="${id}" class="${id === atual ? 'is-on' : ''}">${nome}</button>`).join('')}</nav>`;
  html = html.replace(/default-src 'none';/, `default-src 'none'; font-src ${web.cspSource};`);
  const cabeca = html.includes('</head>') ? html.replace('</head>', `${css}${script(n)}</head>`) : css + script(n) + html;
  const comTopo = cabeca.replace(/<body([^>]*)>/, `<body$1>${topo}`);
  return m?.rodape ? comTopo.replace(/<\/body>(?![\s\S]*<\/body>)/, `${m.rodape}</body>`) : comTopo;
}

// Junta as telas das partes numa página só: o <head> e o script da primeira, o corpo de cada uma num
// <section data-dono> (o script de comandos.js manda o dono junto com o clique) — cada clique volta para a parte dona.
function juntar(ids) {
  return {
    resolveWebviewView(view) {
      const htmls = ids.map(() => ''), msg = ids.map(() => []), vis = ids.map(() => []);
      const corpo = (h) => (h.match(/<body[^>]*>([\s\S]*?)(?:<script[\s\S]*)?<\/body>/) || [, h])[1];
      const compor = () => {
        const base = htmls.find(Boolean);
        if (!base) return;
        const secoes = ids.map((id, i) => (htmls[i] ? `<section data-dono="${id}">${corpo(htmls[i])}</section>` : '')).join('');
        view.webview.html = base.replace(/(<body[^>]*>)[\s\S]*?(<script[\s\S]*<\/body>|<\/body>)/, (_, ab, fim) => ab + secoes + fim);
      };
      view.webview.onDidReceiveMessage((m) => msg[Math.max(0, ids.indexOf(m?.dono))].forEach((f) => f(m)));
      view.onDidChangeVisibility(() => vis.forEach((l) => l.forEach((f) => f())));
      ids.forEach((id, i) => {
        const sub = (lista) => (f) => { lista.push(f); return { dispose: () => lista.splice(lista.indexOf(f) >>> 0, 1) }; };
        partes[id]?.resolveWebviewView({
          webview: {
            get html() { return htmls[i]; },
            set html(h) { htmls[i] = h; compor(); },
            get options() { return view.webview.options; },
            set options(o) { view.webview.options = o; },
            get cspSource() { return view.webview.cspSource; },
            asWebviewUri: (u) => view.webview.asWebviewUri(u),
            postMessage: (m) => view.webview.postMessage(m),
            onDidReceiveMessage: sub(msg[i])
          },
          get visible() { return view.visible; },
          onDidChangeVisibility: sub(vis[i]),
          onDidDispose: view.onDidDispose,
          show: (p) => view.show?.(p)
        }, {}, new vscode.CancellationTokenSource().token);
      });
    }
  };
}

function montarGrupo(grupo, real) {
  const ids = GRUPOS[grupo].map(([s]) => s);
  const principal = ids[0];
  const moldura = secoes[principal]?.provider.moldura;
  let atual = !moldura && ids.includes(memoria.get(`grupo.${grupo}`)) ? memoria.get(`grupo.${grupo}`) : principal;
  const ativo = (id) => id === atual;
  const vis = {}, msg = {}, htmls = {};
  const alvos = [real]; // a view da barra lateral e, na tela cheia, a aba do editor: todas mostram a mesma coisa
  const desenhar = () => alvos.forEach((a) => { a.webview.html = comMenu(htmls[atual], grupo, atual, moldura, a.webview); });
  const opcoes = { enableScripts: true, localResourceRoots: [vscode.Uri.file(require('path').join(__dirname, '..'))] };
  real.webview.options = opcoes;

  for (const id of ids) if (JUNTAS[id]) secoes[id] = { provider: juntar(JUNTAS[id]) };
  for (const id of ids) {
    vis[id] = []; msg[id] = []; htmls[id] = '';
    if (!secoes[id]) continue;
    const sub = (lista) => (f) => { lista.push(f); return { dispose: () => lista.splice(lista.indexOf(f) >>> 0, 1) }; };
    const falsa = {
      webview: {
        get html() { return htmls[id]; },
        set html(h) { htmls[id] = h; if (ativo(id)) desenhar(); },
        get options() { return real.webview.options; },
        // as raízes que cada seção pede (evidências, tickets) somam-se à da extensão; sem isso as miniaturas não carregam
        set options(o) { (o.localResourceRoots || []).forEach((r) => { if (!opcoes.localResourceRoots.some((x) => x.fsPath === r.fsPath)) opcoes.localResourceRoots.push(r); }); alvos.forEach((a) => { a.webview.options = { ...a.webview.options, ...o, enableScripts: true, localResourceRoots: opcoes.localResourceRoots }; }); },
        get cspSource() { return real.webview.cspSource; },
        asWebviewUri: (u) => real.webview.asWebviewUri(u),
        postMessage: (m) => (ativo(id) ? Promise.all(alvos.map((a) => a.webview.postMessage(m))).then((r) => r.some(Boolean)) : Promise.resolve(false)),
        onDidReceiveMessage: sub(msg[id])
      },
      get visible() { return ativo(id) && alvos.some((a) => a.visible); },
      onDidChangeVisibility: sub(vis[id]),
      onDidDispose: real.onDidDispose,
      show: (p) => real.show?.(p)
    };
    secoes[id].provider.resolveWebviewView(falsa, {}, new vscode.CancellationTokenSource().token);
  }

  const trocar = (id) => {
    if (id === atual || !ids.includes(id)) return;
    const antes = atual;
    atual = id;
    if (!moldura) memoria.update(`grupo.${grupo}`, id);
    desenhar();
    vis[antes].forEach((f) => f());
    vis[id].forEach((f) => f());
  };
  const paraPrincipal = (m) => msg[principal].forEach((f) => f(m));
  // A principal avisa quando a moldura muda (outro ticket, outra aba): redesenha a seção de fora que está na tela.
  secoes[principal]?.provider.aoMudarMoldura?.(() => { if (atual !== principal) desenhar(); });
  // Voltar para a principal sem clique (ex.: o ticket foi fechado).
  secoes[principal]?.provider.aoPedirSecao?.((id) => trocar(id || principal));

  const aoReceber = (m) => {
    if (m?.acao === '__painel') return paraPrincipal({ acao: m.cmd, id: m.id });
    if (m?.acao === '__secao') {
      if (m.aba || m.cmd) paraPrincipal({ acao: m.cmd || 'aba', id: m.aba });
      return trocar(m.id);
    }
    msg[atual].forEach((f) => f(m));
  };
  const aoVisivel = () => vis[atual].forEach((f) => f());
  real.webview.onDidReceiveMessage(aoReceber);
  real.onDidChangeVisibility(aoVisivel);
  // Tela cheia: outra janela (aba do editor) entra no espelho; o estado continua um só.
  montados[grupo] = {
    adicionar(alvo) { alvo.webview.options = opcoes; alvos.push(alvo); alvo.webview.onDidReceiveMessage(aoReceber); alvo.onDidChangeVisibility(aoVisivel); desenhar(); aoVisivel(); },
    remover(alvo) { const i = alvos.indexOf(alvo); if (i > 0) alvos.splice(i, 1); aoVisivel(); }
  };
}

// ── Tela cheia: abre a Crafting Table numa aba do editor e esconde as barras laterais ──
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function abrirTelaCheia() {
  const g = 'claudeAbas.tickets';
  if (!montados[g]) { await vscode.commands.executeCommand('claudeAbas.tickets.focus'); for (let i = 0; i < 20 && !montados[g]; i++) await espera(150); }
  if (!montados[g]) return vscode.window.showWarningMessage('Abra a Crafting Table na barra lateral uma vez antes de usar a tela cheia.');
  if (painelCheia) painelCheia.reveal(vscode.ViewColumn.Active);
  else {
    const p = vscode.window.createWebviewPanel('claudeAbas.cheia', 'Crafting Table', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file(require('path').join(__dirname, '..'))] });
    p.iconPath = vscode.Uri.file(require('path').join(__dirname, '..', 'icons', 'crafting-table.png'));
    const alvo = { webview: p.webview, get visible() { return p.visible; }, onDidChangeVisibility: (f) => p.onDidChangeViewState(f), onDidDispose: p.onDidDispose };
    painelCheia = p;
    p.onDidDispose(() => { montados[g]?.remover(alvo); painelCheia = null; vscode.commands.executeCommand('setContext', 'claudeAbas.cheia', false); });
    montados[g].adicionar(alvo);
  }
  vscode.commands.executeCommand('setContext', 'claudeAbas.cheia', true);
  await vscode.commands.executeCommand('workbench.action.maximizeEditorHideSidebar');
}
async function sairTelaCheia() {
  painelCheia?.dispose();
  await vscode.commands.executeCommand('workbench.view.extension.claudeAbas-tickets'); // mostra a barra lateral de volta
}

module.exports = {
  // No lugar de vscode.window.registerWebviewViewProvider: se a tela faz parte de um grupo, entra nele.
  registrar(id, provider, opcoes) {
    if (parteDe(id)) { partes[id] = provider; return { dispose() {} }; }
    if (!grupoDe(id)) return vscode.window.registerWebviewViewProvider(id, provider, opcoes);
    secoes[id] = { provider };
    return { dispose() {} };
  },
  telaCheiaAberta: () => !!painelCheia,
  provider(ctx) {
    memoria = ctx.globalState;
    ctx.subscriptions.push(vscode.commands.registerCommand('claudeAbas.telaCheia', abrirTelaCheia), vscode.commands.registerCommand('claudeAbas.sairTelaCheia', sairTelaCheia));
    return vscode.Disposable.from(...Object.keys(GRUPOS).map((g) => vscode.window.registerWebviewViewProvider(g, {
      resolveWebviewView: (real) => montarGrupo(g, real)
    }, { webviewOptions: { retainContextWhenHidden: true } })));
  },
  _teste: { comMenu, GRUPOS }
};
