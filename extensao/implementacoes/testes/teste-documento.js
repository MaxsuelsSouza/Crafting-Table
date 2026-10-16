// @ts-check
// node implementacoes/testes/teste-documento.js — Implementação com ticket-documento: o pedido aponta o documento e o contexto, mencionar cita o
// documento, título da conversa, aba Docs com selo "documento". Ticket do Jira intacto. Nada sai da máquina.
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert'),
  https = require('https');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'impldoc-home-'));
const Module = /** @type {any} */ (require('module'));
const load = Module._load;
const vscodeMock = new Proxy(
  {},
  {
    get: (_, k) =>
      k === 'EventEmitter'
        ? class {
            event() {}
            fire() {}
            dispose() {}
          }
        : k === 'workspace'
          ? { getConfiguration: () => ({ get: () => undefined }) }
          : new Proxy(function () {}, { get: () => () => {}, apply: () => Promise.resolve() })
  }
);
Module._load = (r, ...a) => (r === 'vscode' ? vscodeMock : load(r, ...a));
https.request = /** @type {any} */ (
  () => {
    throw new Error('REDE: https.request');
  }
);
globalThis.fetch = /** @type {any} */ (
  () => {
    throw new Error('REDE: fetch');
  }
);

const tickets = require('../../infra/tickets');
const sessao = require('../../infra/sessao');
const doc = require('../../provedores/documento');
const impl = require('../implementacoes');
const { pedido, tituloConversa } = require('../../modulos/conversas')._teste2;
const { _textoTicket } = require('../../infra/claude');
const abaDocs = require('../../componentes/aba-docs');

const orig = path.join(os.tmpdir(), `Requisitos-${Date.now()}.md`);
fs.writeFileSync(orig, '# Requisitos\nEmitir nota.\n');
const t = doc.criarPorDocumento(orig);
const dir = tickets.pasta(t.chave);
sessao.focar(t.chave, impl.ID);
const s = {
  pasta: (id) => tickets.pasta(id),
  pastaAba: (id) => tickets.pasta(id, impl.ID),
  ticketAberto: () => tickets.ler(t.chave)
};

// pedido
const p = pedido(s, tickets.ler(t.chave));
const ctx = path.join(dir, '.contexto-ticket.md'),
  origDoc = path.join(dir, t.documento.arquivo);
assert.ok(p.includes(origDoc) && p.includes(ctx), p);
assert.ok(!/undefined/.test(p));
assert.ok(p.includes('Ticket por documento (sem ferramenta de gestão)'));
assert.ok(p.includes(`Pasta desta etapa: ${s.pastaAba(t.chave)}`));
assert.ok(fs.existsSync(ctx));
assert.ok(fs.readFileSync(ctx, 'utf8').includes(t.documento.arquivo));

// mencionar
const m = _textoTicket(tickets.ler(t.chave), impl.ID, '@x');
assert.ok(m.includes(origDoc) && m.includes(ctx) && m.endsWith('\n@x'));

// título
assert.strictEqual(tituloConversa(tickets.ler(t.chave), impl.ID), `${t.chave} · ${impl.ETAPA} · ${t.titulo}`);
assert.strictEqual(
  tituloConversa({ chave: 'X-1', documento: { nome: 'a.md' } }, impl.ID),
  `X-1 · ${impl.ETAPA} · a.md`
);
assert.strictEqual(tituloConversa({ chave: 'X-1' }, impl.ID), `X-1 · ${impl.ETAPA}`);

// aba Docs: original e anexo extra com origem 'documento'
const an = path.join(dir, '.anexos');
fs.mkdirSync(an, { recursive: true });
fs.writeFileSync(path.join(an, 'print.txt'), 'x');
const og = path.join(dir, '.origem.json'),
  o = JSON.parse(fs.readFileSync(og, 'utf8'));
o['print.txt'] = { origem: 'documento', id: 'print.txt' };
fs.writeFileSync(og, JSON.stringify(o));
const docs = abaDocs.docsDoTicket(s, { ...tickets.ler(t.chave), id: t.chave });
assert.ok(
  docs.some((d) => d.nome === t.documento.arquivo) && docs.some((d) => d.nome === 'print.txt'),
  JSON.stringify(docs.map((d) => d.nome))
);
const html = abaDocs.corpo({ docs, origens: o, jira: { anexos: [] }, baixando: new Set(), dir }, false);
assert.ok(html.includes('>documento<') && !html.includes('Baixado dos anexos'));
const html2 = abaDocs.corpo(
  {
    docs: [docs[0]],
    origens: { [docs[0].nome]: { origem: 'jira', id: '1' } },
    jira: { anexos: [] },
    baixando: new Set(),
    dir
  },
  false
);
assert.ok(html2.includes('Baixado dos anexos'));

// Jira: pedido com link, sem bloco, sem contexto
const tj = {
  chave: 'JIRA-9',
  idProvedor: 'JIRA-9',
  provedor: 'jira',
  site: 'https://x.atlassian.net',
  titulo: 'Titulo',
  link: 'https://x/browse/JIRA-9',
  status: '',
  conversas: []
};
tickets.gravar(tj);
const pj = pedido({ ...s, pasta: (id) => tickets.pasta(id), pastaAba: () => '/pa' }, tj);
assert.strictEqual(
  pj,
  `Ticket JIRA-9: Titulo · ${impl.ETAPA}\nhttps://x/browse/JIRA-9\nPasta desta etapa: /pa (documentos, notas em ${pj.match(/notas em ([^)]*)\)/)[1]}). Grave só nela.\nAnexos do ticket em ${tickets.pasta('JIRA-9')}. Não use as outras pastas nem conversas do ticket.\n`
);
assert.ok(!fs.existsSync(path.join(tickets.pasta('JIRA-9'), '.contexto-ticket.md')));
assert.strictEqual(
  _textoTicket(tj, impl.ID, 'z'),
  `Ticket JIRA-9 (pasta do ticket: ${tickets.pasta('JIRA-9', impl.ID)})\nz`
);
console.log('ok');
