// node teste-lista-documento.js: ticket-documento convive com ticket do Jira na lista, cabeçalho e ações (zero rede)
const Module = /** @type {any} */ (require('module')); const load = Module._load;
const msgs = [], ext = [], avisos = [];
const noop = () => {};
const vscode = {
  EventEmitter: class { constructor() { this.event = noop; } fire() {} dispose() {} }, Disposable: { from: (...d) => ({ dispose() {} }) },
  workspace: { getConfiguration: () => ({ get: () => undefined, update: async () => {} }), onDidChangeConfiguration: () => ({ dispose() {} }), workspaceFolders: [] },
  Uri: { file: (f) => ({ fsPath: f }), parse: (x) => x }, StatusBarAlignment: {}, ThemeColor: class {},
  window: { showInformationMessage: async (m) => { msgs.push(m); }, showErrorMessage: async () => {}, showWarningMessage: async (m, o) => { avisos.push([m, o]); return 'Excluir'; }, setStatusBarMessage: noop, showQuickPick: async () => undefined },
  commands: { executeCommand: async () => {}, registerCommand: () => ({ dispose() {} }) }, env: { openExternal: async (u) => { ext.push(u); } }
};
vscode.window = new Proxy(vscode.window, { get: (o, k) => (k in o ? o[k] : /^on/.test(String(k)) ? () => ({ dispose() {} }) : undefined) });
vscode.workspace = new Proxy(vscode.workspace, { get: (o, k) => (k in o ? o[k] : /^on/.test(String(k)) ? () => ({ dispose() {} }) : undefined) });
let provider;
let cfgReal;
Module._load = (r, ...a) => (r === 'vscode' ? vscode : r === '../configuracao/configuracao' ? (cfgReal ||= { ...load(r, ...a), pendencias: async () => [], siteJira: () => 'https://x.atlassian.net', projetoJira: () => ['WMS'], boardsJira: () => ['B'] }) : r === './grupo' ? { ...load(r, ...a), registrar: (_i, p) => { provider = p; return { dispose() {} }; } } : load(r, ...a));
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ldoc-'));
require('https').request = () => { throw new Error('rede'); };
global.fetch = () => { throw new Error('rede'); };

const tk = require('../infra/ticket/tickets');
const lista = require('../painel/lista');
const listaTickets = require('./lista-tickets');
const card = require('./card-ticket');
const pillMod = require('./pill');

const t0 = Date.now();
const jiraT = tk.gravar({ idProvedor: 'WMS-1', chave: 'WMS-1', provedor: 'jira', site: 'https://x.atlassian.net', link: 'https://x.atlassian.net/browse/WMS-1', titulo: 'Ticket do Jira', status: 'Em andamento', listas: ['refinamento'], conversas: [], criado: t0 });
const mk = (n, tipo, titulo, extra = {}) => {
  const chave = `DOC-00${n}`, arquivo = `doc.${tipo}`, d = tk.pasta(chave);
  fs.mkdirSync(path.join(d, '.anexos'), { recursive: true }); fs.writeFileSync(path.join(d, arquivo), 'x'); fs.writeFileSync(path.join(d, '.anexos', 'print.png'), 'p');
  return tk.gravar({ idProvedor: chave, chave, provedor: 'documento', site: 'documento:local', link: '', titulo, status: 'Documento', tipo: 'Documento', listas: ['refinamento'],
    documento: { arquivo, nome: arquivo, tipo, em: new Date().toISOString() }, conversas: [], criado: t0 + n, ...extra });
};
const dmd = mk(1, 'md', 'Regra de frete'), dpdf = mk(2, 'pdf', 'Contrato assinado', { status: 'Em revisão' });

// 1. Lista mista: selos, status neutro, sem link, ordem de criação (a webview ordena; o HTML vem na ordem de listar()).
const html = listaTickets.corpo([jiraT, dmd, dpdf].map((x) => ({ ...x, refinando: false })), null, { modo: 'refinamento', vinculados: {} });
assert.ok(!/undefined|NaN|null/.test(html), 'sem undefined');
assert.ok(html.includes('📄 Texto') && html.includes('📄 PDF'));
assert.ok(html.includes('Em andamento') && html.includes('Em revisão') && !html.includes('>Documento</span>'));
assert.ok(!/href=|atlassian/.test(card.card(dmd)));
assert.ok(/data-busca="doc-001 regra de frete [^"]*documento texto"/.test(card.card(dmd)) && card.card(dpdf).includes('contrato assinado'));
assert.ok(card.card(dmd).includes('st-ia') && card.card(dmd).includes('title="Abrir o ticket"'));
// snapshot do card do Jira: sem selo de documento
assert.strictEqual(card.card({ ...jiraT, refinando: false }), `<li data-acao="abrir" data-id="WMS-1" data-busca="wms-1 ticket do jira em andamento" title="Abrir o ticket">
    <div class="corpo">
      <div class="nome"><span>Ticket do Jira</span></div>
      <div class="det"><span class="chave">WMS-1</span>${pillMod.status('Em andamento')}${pillMod.pill('Tipo?', { cor: 'novo', dica: 'Tipo não reconhecido: ao abrir o ticket a extensão pergunta qual é' })}
        <span>${card._teste.conversas(0)}</span></div>
    </div>
    <span class="mini"><button class="perigo" data-acao="excluir" data-id="WMS-1" title="Excluir (a pasta vai para _arquivados, nada é apagado)"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/></svg></button></span></li>`);
assert.deepStrictEqual(tk.listar().filter((t) => ['WMS-1', 'DOC-001', 'DOC-002'].includes(t.chave)).map((t) => t.chave).sort(), ['DOC-001', 'DOC-002', 'WMS-1']);

(async () => {
  // 2. Vinculados: chave DOC-* vinda do provedor não aparece nem tem prévia/puxar/link.
  const estado = new Map();
  const jira = require('../infra/provedores/fachada').jira;
  jira.conectado = async () => true;
  for (const n of ['etapas', 'labels', 'boardsPorNome']) jira[n] = async () => [];
  jira.meus = async () => [{ key: 'DOC-001', resumo: 'colisão', status: 'Em andamento' }, { key: 'WMS-9', resumo: 'real', status: 'Em andamento' }];
  jira.buscar = async () => { throw new Error('rede'); };
  const s = { secrets: {}, globalState: { get: (k) => estado.get(k), update: async (k, v) => { estado.set(k, v); } }, render() {}, cacheJira: {}, atualizarJira() { throw new Error('rede'); } };
  lista.iniciar(s.globalState);
  lista.carregarSeNecessario(s); await new Promise((r) => setTimeout(r, 30));
  const h = lista.corpo(s, '', () => false);
  assert.ok(h.includes('WMS-9') && !/data-id="DOC-001" data-busca="doc-001 colis/.test(h) && !h.includes('colisão'));
  const a = lista.acoes(s);
  await a.meuVer({ id: 'DOC-001' }); a.previaJira({ id: 'DOC-001' }); a.meuPuxar({ id: 'DOC-777' });
  assert.strictEqual(msgs.length, 3); assert.ok(msgs.every((m) => /documento/.test(m))); assert.strictEqual(ext.length, 0);

  // 3. Painel: cabeçalho nas 4 abas, ações mudas e excluir.
  require('../painel/painel').provider({ secrets: {}, globalState: s.globalState, subscriptions: [], extensionUri: { fsPath: '/x' }, extensionPath: '/x' });
  let tratar;
  const view = { webview: { options: {}, html: '', onDidReceiveMessage: (f) => { tratar = f; }, postMessage: noop, asWebviewUri: (u) => u, cspSource: '' }, onDidChangeVisibility: noop, visible: true, title: '' };
  provider.resolveWebviewView(view);
  const envia = (m) => tratar(m);
  for (const modo of ['refinamento', 'impl', 'qa', 'incidentes']) {
    await lista.acoes(s).listaModo({ id: modo });
    envia({ acao: 'abrir', id: 'DOC-001' });
    const topo = provider.moldura('x').topo;
    assert.ok(!topo.includes('data-acao="jira"') && !topo.includes('data-painel="jira"') && !/ no Jira|Ver o ticket no/.test(topo) && !topo.includes('undefined'), modo);
    assert.ok(topo.includes('DOC-001') && topo.includes('st-novo'), modo);
  }
  msgs.length = 0;
  envia({ acao: 'abrir', id: 'DOC-001' }); envia({ acao: 'abrir', id: 'DOC-001', key: 'DOC-001-1' }); envia({ acao: 'jira' });
  assert.strictEqual(msgs.length, 2); assert.strictEqual(ext.length, 0);

  // Excluir: arquiva a pasta com .anexos/ e o documento; o original (fora da pasta) segue intacto.
  const original = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'orig-')), 'contrato.pdf'); fs.writeFileSync(original, 'ORIGINAL');
  const dd = require('../infra/provedores/documento').criarPorDocumento(original, { listas: [lista.modo()] });
  await envia({ acao: 'excluir', id: dd.chave }); await new Promise((r) => setTimeout(r, 20));
  assert.ok(/documento/.test(avisos.at(-1)[1].detail));
  assert.strictEqual(tk.ler(dd.chave), null);
  const arq = path.join(tk.RAIZ, '_arquivados'), pasta = fs.readdirSync(arq).find((n) => n.startsWith(dd.chave));
  assert.ok(pasta && fs.readdirSync(path.join(arq, pasta)).some((n) => n.endsWith('.pdf')));
  assert.strictEqual(fs.readFileSync(original, 'utf8'), 'ORIGINAL');
  console.log('ok lista-documento'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
