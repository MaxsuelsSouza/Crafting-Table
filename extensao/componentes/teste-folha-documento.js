// node teste-folha-documento.js: aba Ticket do ticket-documento (render por tipo, ações locais, cabeçalho sem provedor, zero rede)
const Module = /** @type {any} */ (require('module')); const load = Module._load;
const chamadas = [];
const vscode = {
  EventEmitter: class { fire() {} }, workspace: {}, Uri: { file: (f) => ({ fsPath: f }) },
  window: { showInputBox: async () => 'Novo título', showQuickPick: async () => 'Concluído' },
  commands: { executeCommand: async (...a) => chamadas.push(['cmd', ...a]) }, env: { openExternal: async (u) => chamadas.push(['ext', u.fsPath]) }
};
Module._load = (r, ...a) => (r === 'vscode' ? vscode : load(r, ...a));
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'fdoc-'));
const https = require('https');
https.request = () => { throw new Error('rede'); };
global.fetch = () => { throw new Error('rede'); };

const tk = require('../infra/ticket/tickets');
const { folhaDocumento } = require('./folha-documento');
const { acoes } = require('../painel/documento');
const moldura = require('../painel/moldura');
const jira = require('../infra/provedores/fachada').jira;

const mk = (n, tipo, conteudo) => {
  const chave = `DOC-00${n}`, arquivo = `doc.${tipo}`, d = tk.pasta(chave);
  fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, arquivo), conteudo);
  return tk.gravar({ idProvedor: chave, chave, provedor: 'documento', site: 'documento:local', link: '', titulo: 'Doc ' + n, status: 'Documento', tipo: 'Documento',
    documento: { arquivo, nome: arquivo, tipo, em: new Date().toISOString() }, conversas: [], criado: Date.now() });
};
const uri = (a) => 'vscode-resource://' + a;
const tmd = mk(1, 'md', '# Titulo\n\ntexto **forte**'), ttxt = mk(2, 'txt', 'linha <b>crua</b>'), tpng = mk(3, 'png', 'x'), tpdf = mk(4, 'pdf', 'x'), tdocx = mk(5, 'docx', 'x');
const h = (t) => folhaDocumento(tk.ler(t.chave), undefined, uri);

assert.ok(h(tmd).includes('<h') && h(tmd).includes('<b>forte</b>'));
assert.ok(h(ttxt).includes('<pre class="doc-txt">') && h(ttxt).includes('&lt;b&gt;') || h(ttxt).includes('&#60;b&#62;'));
assert.ok(h(tpng).includes('<img') && h(tpng).includes('vscode-resource://' + path.join(tk.pasta('DOC-003'), 'doc.png')));
for (const t of [tpdf, tdocx]) { const x = h(t); assert.ok(x.includes('data-acao="docAbrir"') && !x.includes('<iframe') && !x.includes('<img')); }

const aberto = { t: tmd }, renders = [];
const a = acoes({ ticketAberto: () => aberto.t, render: () => renders.push(1) });
(async () => {
  a.docSalvarDescricao({ texto: 'transcrição' });
  assert.strictEqual(fs.readFileSync(path.join(tk.pasta('DOC-001'), '.documento-texto.md'), 'utf8'), 'transcrição');
  assert.ok(h(tmd).includes('transcrição'));
  await a.docEditarTitulo(); await a.docEditarStatus();
  assert.deepStrictEqual([tk.ler('DOC-001').titulo, tk.ler('DOC-001').status], ['Novo título', 'Concluído']);
  a.docComentar({ texto: 'um comentário' });
  const cs = JSON.parse(fs.readFileSync(path.join(tk.pasta('DOC-001'), '.comentarios.json'), 'utf8'));
  assert.strictEqual(cs.length, 1); assert.strictEqual(cs[0].autorId, 'externo');
  assert.ok(h(tmd).includes('um comentário'));
  a.docComentar({ texto: '  ' }); assert.strictEqual(JSON.parse(fs.readFileSync(path.join(tk.pasta('DOC-001'), '.comentarios.json'), 'utf8')).length, 1);
  aberto.t = tpdf; await a.docAbrir(); aberto.t = tdocx; await a.docAbrir(); await a.docPasta();
  assert.deepStrictEqual(chamadas.map((c) => c[0]), ['cmd', 'ext', 'cmd']);

  // cabeçalho: sem botão do provedor, com o status local
  const cab = moldura.cabecalho(tk.ler('DOC-001'), { aba: 'ticket', secao: 'x', dentro: true });
  assert.ok(!cab.includes('data-acao="jira"') && cab.includes('Concluído'), cab);
  assert.ok(jira.ehDocumento(tk.ler('DOC-001')));
  console.log('ok teste-folha-documento');
})().catch((e) => { console.error(e); process.exit(1); });
