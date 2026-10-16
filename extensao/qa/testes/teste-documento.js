// @ts-check
// node qa/testes/teste-documento.js — QA de ticket por documento: plano, publicação e rótulos pelo adaptador local (sem rede, sem conta).
const assert = require('assert');
const fs = require('fs'),
  os = require('os'),
  path = require('path');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-doc-'));
process.env.HOME = home;
const Module = /** @type {any} */ (require('module')),
  carregar = Module._load;
const avisos = [];
const vscodeMock = {
  window: {
    showWarningMessage: async (m) => {
      avisos.push(m);
      return 'Salvar';
    },
    showInputBox: async () => '',
    showErrorMessage: async () => {},
    createOutputChannel: () => ({})
  },
  workspace: { getConfiguration: () => ({ get: () => undefined }) },
  commands: { executeCommand: () => {} },
  Uri: { file: (f) => ({ fsPath: f }) },
  env: {},
  EventEmitter: class {}
};
Module._load = (r, ...a) => (r === 'vscode' ? vscodeMock : carregar(r, ...a));
const rede = [];
for (const m of ['http', 'https'])
  require(m).request = (...a) => {
    rede.push(a[0]);
    throw new Error('sem rede neste teste');
  };
global.fetch = /** @type {any} */ (
  async () => {
    throw new Error('sem rede neste teste');
  }
);

const prov = require('../../infra/provedores/documento'),
  tickets = require('../../infra/ticket/tickets');
const qa = require('../motor'),
  { acoes } = require('../abas/acoes');
const maestro = require('../../infra/agentes/maestro');
require('../../infra/ticket/sessao').focoLista = () => 'qa';

const PLANO =
  '## Cenários de Teste\n\n#### CT01 – Separar pedido\n\n**Dado que** o pedido existe\n**Quando** separa\n**Então** conclui\n\n#### CT02 – Pedido vazio\n\n**Dado que** vazio\n';
(async () => {
  const fonte = path.join(home, 'regras.md');
  fs.writeFileSync(fonte, '# Regras\nSeparar por onda');
  const t = prov.criarPorDocumento(fonte, { listas: ['qa'] });
  assert.strictEqual(t.chave, 'DOC-001');
  const dir = tickets.pasta(t.chave, 'qa'),
    raiz = tickets.pasta(t.chave);
  fs.mkdirSync(dir, { recursive: true });
  const s = {
    secrets: {},
    cacheJira: {},
    render: () => {},
    ticketAberto: () => t,
    pastaAba: () => dir,
    pedirSecao: () => {},
    reposDe: () => []
  };
  const jira = require('../../infra/provedores/fachada').jira;
  assert.ok(jira.ehDocumento(t) && qa.ehLocal(dir));

  // ▶ sem plano: sem_plano, sem erro, sem rede
  await acoes(s).qaPlay();
  assert.strictEqual(qa.estado(dir).fase, 'sem_plano');
  let h = qa.html(dir);
  assert.ok(h.includes('salva no documento') && !h.includes('no Jira'));

  // Criar planejamento: o Claude (stub) escreve qa-plano.md na área da IA; a extensão publica a subtarefa local.
  const { areaIA } = require('../../infra/agentes/area-ia');
  let promptVisto = '';
  maestro.rodando = () => false;
  maestro.rodar = (d, o) => {
    promptVisto = o.prompt;
    fs.mkdirSync(areaIA(d), { recursive: true });
    fs.writeFileSync(path.join(areaIA(d), 'qa-plano.md'), PLANO);
    setTimeout(() => o.aoMudar(), 5);
    return true;
  };
  await acoes(s).qaCriarPlano();
  for (let i = 0; i < 100 && qa.estado(dir).fase !== 'plano_encontrado'; i++)
    await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(qa.estado(dir).fase, 'plano_encontrado', JSON.stringify(qa.estado(dir)));
  assert.ok(
    promptVisto.includes('DOCUMENTO') &&
      promptVisto.includes(path.join(raiz, 'regras.md')) &&
      !promptVisto.includes('.documento-extraido.md')
  );
  // Portão: o plano fica só local até o Aprovar; nada na subtarefa local antes disso.
  assert.ok(!fs.existsSync(path.join(raiz, '.subtarefas.json')) && qa.estado(dir).publicarPendente);
  assert.ok(fs.existsSync(path.join(dir, 'planejamento-qa-v1.md')));
  await acoes(s).qaPlanoAprovar();
  const subs = JSON.parse(fs.readFileSync(path.join(raiz, '.subtarefas.json'), 'utf8'));
  assert.strictEqual(subs[0].key, 'DOC-001-1');
  assert.strictEqual(subs[0].resumo, '[QA] Planejamento dos Casos de Testes');
  assert.deepStrictEqual([qa.estado(dir).fase, qa.estado(dir).subtarefa], ['plano_aprovado', 'DOC-001-1']);
  // com o texto extraído presente, o prompt cita
  fs.writeFileSync(path.join(raiz, '.documento-extraido.md'), 'texto');
  assert.ok(qa.promptCriar(dir).includes('.documento-extraido.md'));

  // ▶ de novo com o plano aprovado não pede aprovação outra vez; cenários CT01…
  assert.deepStrictEqual(
    qa.cenarios(dir).cenarios.map((c) => c.id),
    ['CT01', 'CT02']
  );

  // Publicar: comentário local + evidência em .publicado/
  const ev = path.join(dir, 'ev.png');
  fs.writeFileSync(ev, 'x');
  const r = qa.cenarios(dir);
  r.cenarios.forEach((c) => {
    c.status = 'passou';
    c.execucoes = [{ status: 'passou', inicio: '2026-10-10T12:00:00Z', nota: 'ok', evidencias: [ev] }];
  });
  fs.writeFileSync(path.join(dir, qa.CENARIOS), JSON.stringify(r));
  const orig = qa.arquivosDe;
  qa.arquivosDe = () => [ev];
  h = qa.html(dir);
  assert.ok(h.includes('Salvar resultado no documento') && !h.includes('Publicar no Jira'));
  await acoes(s).qaPublicar();
  qa.arquivosDe = orig;
  const com = JSON.parse(fs.readFileSync(path.join(raiz, '.comentarios.json'), 'utf8'));
  assert.ok(com.length === 1 && com[0].texto.includes('CT01') && com[0].texto.includes('✅ Passou'));
  assert.ok(fs.existsSync(path.join(raiz, '.publicado', 'DOC-001-1', 'CT01-ev.png')));
  assert.ok(/Salvar no documento/.test(avisos.at(-1)));
  assert.deepStrictEqual(rede, []);

  // Ticket do Jira continua com o rótulo do provedor
  const dj = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-jira-')),
    ij = path.join(dj, 'qa');
  fs.mkdirSync(ij);
  assert.ok(!qa.ehLocal(ij));
  assert.ok(qa.html(ij).includes('QA não iniciado'));
  qa.mudar(ij, { fase: 'sem_plano' });
  assert.ok(/publica no (Jira|[A-Z]\w+)/.test(qa.html(ij)) && !qa.html(ij).includes('no documento'));
  console.log('teste-documento ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
