// @ts-check
// node incidentes/testes/teste-documento.js — Mergulho (etapas 1 e 2) com ticket-documento: contexto, prompts, anexos extras. Sem rede; claude stubado.
const assert = require('assert');
const fs = require('fs'),
  os = require('os'),
  path = require('path');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mgdoc-'));
process.env.HOME = home;
const Module = /** @type {any} */ (require('module')),
  carregar = Module._load;
let escolhidos = [];
const vsc = {
  window: { showOpenDialog: async () => escolhidos.map((p) => ({ fsPath: p })) },
  Uri: { file: (p) => ({ fsPath: p }) },
  env: { openExternal: async () => true },
  commands: {},
  workspace: { getConfiguration: () => ({ get: (_k, d) => d, inspect: () => undefined, update: async () => {} }) }
};
Module._load = (r, ...a) => (r === 'vscode' ? vsc : carregar(r, ...a));
const rede = [];
for (const m of ['http', 'https'])
  require(m).request = (...a) => {
    rede.push(a[0]);
    throw new Error('rede proibida');
  };
// @ts-ignore
global.fetch = () => {
  rede.push('fetch');
  throw new Error('rede proibida');
};

const orq = require('../orquestrador'),
  maestro = require('../../painel/maestro'),
  tickets = require('../../infra/tickets');
const docs = require('../../provedores/documento'),
  folha = require('../../componentes/folha-documento');
const { prompt, FERRAMENTAS } = require('../prompt'),
  { estado, mudar } = require('../estado'),
  { rodarEtapa, anexosFaltando } = orq,
  controle = require('../../infra/controle');

// claude stubado: guarda o último pedido
/** @type {any} */ let ultimo = null;
maestro.rodar = (_d, o) => {
  ultimo = o;
  return true;
};

const fonte = path.join(home, 'relato.md');
fs.writeFileSync(fonte, '# Incidente\nO app travou ao finalizar.');
const t = docs.criarPorDocumento(fonte);
const pasta = tickets.pasta(t.chave),
  dir = path.join(pasta, 'incidente');
fs.mkdirSync(dir, { recursive: true });
const cacheJira = {};
const s = {
  pastaAba: () => dir,
  pasta: () => pasta,
  render() {},
  ticketAberto: () => t,
  reposDe: () => [],
  cacheJira,
  atualizarJira: async () => {
    throw new Error('não deve buscar');
  }
};

(async () => {
  // ferramentas
  const f = FERRAMENTAS('/m');
  for (const x of ['Bash(pdftotext:*)', 'Bash(pdftoppm:*)', 'Bash(unzip:*)']) assert.ok(f.includes(x), x);

  // etapa 1: contexto com o caminho do original; prompt com o bloco; sem anexo pausando
  await rodarEtapa(s, t, 1, controle.nova(dir));
  const ctx = fs.readFileSync(path.join(dir, '.jira-contexto.md'), 'utf8');
  assert.ok(
    ctx.includes(path.join(pasta, t.documento.arquivo)) &&
      ctx.includes('.documento-extraido.md') &&
      fs.readFileSync(path.join(pasta, '.documento-extraido.md'), 'utf8').includes('O app travou')
  );
  assert.ok(ultimo.prompt.includes('Ticket por documento') && ultimo.prompt.includes('.documento-paginas'));
  assert.ok(estado(dir).fase === 'rodando' && cacheJira[t.id].key === t.chave);

  // etapa 2: não pausa por anexos; sem extras o bloco ainda cita .anexos/
  ultimo = null;
  mudar(dir, { etapa: 2, fase: 'parado' });
  await rodarEtapa(s, t, 2, controle.nova(dir));
  assert.ok(ultimo && estado(dir).fase !== 'pausado');
  assert.deepStrictEqual(anexosFaltando(s, t), []);

  // docAnexar simulado: dois arquivos, um repetido
  const png = path.join(home, 'tela.png'),
    mp4 = path.join(home, 'video.mp4');
  fs.writeFileSync(png, 'x');
  fs.writeFileSync(mp4, 'yy');
  escolhidos = [png, mp4];
  const a = require('../../painel/documento').acoes(s);
  await a.docAnexar();
  await a.docAnexar();
  assert.deepStrictEqual(fs.readdirSync(path.join(pasta, '.anexos')).sort(), [
    'tela-2.png',
    'tela.png',
    'video-2.mp4',
    'video.mp4'
  ]);
  const org = JSON.parse(fs.readFileSync(path.join(pasta, '.origem.json'), 'utf8'));
  assert.ok(org['tela-2.png'].origem === 'documento' && org[t.documento.arquivo]);
  assert.ok(fs.existsSync(png) && fs.existsSync(mp4)); // origem intacta
  assert.ok(folha.folhaDocumento(t).includes('tela-2.png') && folha.folhaDocumento(t).includes('docAnexar'));
  ultimo = null;
  mudar(dir, { etapa: 2, fase: 'parado' });
  await rodarEtapa(s, t, 2, controle.nova(dir));
  assert.ok(ultimo.prompt.includes(path.join(pasta, '.anexos')) && estado(dir).fase !== 'pausado');
  assert.deepStrictEqual(anexosFaltando(s, t), []);

  // ticket Jira: sem bloco, gatekeeper e prompt como antes
  const tj = { id: 'WMS-9', chave: 'WMS-9', link: 'x' };
  for (const n of [1, 2]) assert.ok(!prompt(tj, dir, n, [], 'x').includes('Ticket por documento'));
  const sj = { ...s, cacheJira: { 'WMS-9': { anexos: [{ id: '1', nome: 'a.png' }] } } };
  assert.deepStrictEqual(
    anexosFaltando(sj, tj).map((x) => x.id),
    ['1']
  );

  assert.deepStrictEqual(rede, []);
  console.log('OK teste-documento (incidentes)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
