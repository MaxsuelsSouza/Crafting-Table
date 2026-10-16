// @ts-check
// node janelas/refinamento/testes/teste-documento.js — Refinamento com ticket-documento: contexto entregue à IA, card vira subtarefa local,
// dúvida vira comentário local, vigia dispara a triagem com o comentário externo (não com o da extensão). Nada sai da máquina.
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert'),
  https = require('https');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'refdoc-home-'));
const Module = /** @type {any} */ (require('module'));
const load = Module._load;
const msgs = [];
const vscodeMock = new Proxy(
  {},
  {
    get: (_, k) =>
      k === 'workspace'
        ? { getConfiguration: () => ({ get: () => undefined }) }
        : k === 'window'
          ? new Proxy(
              {},
              {
                get:
                  (_, f) =>
                  (...a) => {
                    msgs.push([f, ...a]);
                    return Promise.resolve(/^show(Warning|Information)Message$/.test(String(f)) ? 'ok' : undefined);
                  }
              }
            )
          : new Proxy(function () {}, { get: () => () => {}, apply: () => Promise.resolve() })
  }
);
Module._load = (r, ...a) => (r === 'vscode' ? vscodeMock : load(r, ...a));
// Sem rede: qualquer tentativa falha o teste.
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

const tickets = require('../../../infra/ticket/tickets');
const doc = require('../../../infra/provedores/documento');
const orq = require('../orquestrador');
const maestro = require('../../../infra/agentes/maestro');
const { acoes } = require('../abas/tarefas');
const duv = require('../abas/duvidas');
const { tarefasDe, duvidasDe, impactosDe, TAREFAS, DUVIDAS, IMPACTOS } = require('../locais');

const chamadas = [];
maestro.rodar = (p, o) => {
  chamadas.push(o);
  return true;
};
maestro.rodando = () => false;

(async () => {
  // Ticket-documento a partir de um .md temporário.
  const orig = path.join(os.tmpdir(), `Requisitos-${Date.now()}.md`);
  fs.writeFileSync(orig, '# Requisitos\nO sistema deve emitir nota.\n');
  const t0 = doc.criarPorDocumento(orig);
  assert.strictEqual(t0.chave, 'DOC-001');
  const dir = tickets.pasta(t0.chave);
  tickets.gravar({ ...tickets.ler(t0.chave), spec: { repo: dir, dir: 'DOC-001-x' } });
  const t = tickets.ler(t0.chave);
  const jira = require('../../../infra/provedores/fachada').jira;
  assert.ok(jira.ehDocumento(t));

  const gravar = (id, nome, dado) => fs.writeFileSync(path.join(tickets.pasta(id), nome), JSON.stringify(dado));
  const servicos = {
    render() {},
    gravar,
    abrirAba() {},
    secrets: {},
    notificar() {},
    cacheJira: {},
    pasta: (id) => tickets.pasta(id),
    ticketAberto: () => tickets.ler('DOC-001'),
    aberto: 'DOC-001',
    atualizarJira() {},
    orq
  };
  orq.iniciar(servicos, { subscriptions: [] });

  // 1. etapa grava o contexto e o prompt aponta contexto e original.
  assert.strictEqual(orq.etapa(t, 'Siga a skill sdd.'), true);
  const ctx = path.join(dir, '.contexto-ticket.md');
  assert.ok(fs.existsSync(ctx), '.contexto-ticket.md gravado de forma síncrona');
  assert.match(fs.readFileSync(ctx, 'utf8'), /DOC-001/);
  const p = chamadas[0].prompt;
  assert.ok(p.includes('Ticket por documento (sem ferramenta de gestão)'));
  assert.ok(p.includes(ctx));
  assert.ok(p.includes(path.join(dir, t.documento.arquivo)));

  // Ticket do Jira: prompt sem o bloco.
  const tj = {
    chave: 'JIRA-9',
    idProvedor: 'JIRA-9',
    provedor: 'jira',
    site: 'https://x.atlassian.net',
    spec: { repo: dir }
  };
  tickets.gravar({ ...tj, titulo: 'j', status: '', conversas: [] });
  orq.etapa(tj, 'Siga.');
  assert.ok(!chamadas[1].prompt.includes('Ticket por documento'));
  assert.ok(!fs.existsSync(path.join(tickets.pasta('JIRA-9'), '.contexto-ticket.md')));

  // 2. Aprovar card: subtarefa local DOC-001-1; link vazio não quebra.
  gravar('DOC-001', TAREFAS, [
    { id: 't01', titulo: 'Emitir nota', descricao: 'd', status: 'pendente', estimativa: '2h' },
    {
      id: 'qa',
      tipo: 'qa',
      titulo: '[QA] Planejamento dos Casos de Testes',
      arquivo: path.join(dir, 'testes.md'),
      status: 'pendente'
    }
  ]);
  fs.writeFileSync(path.join(dir, 'testes.md'), '# Plano\n1. caso');
  const a = acoes(servicos);
  await a.tarefaAprovar({ id: 't01' });
  const subs = JSON.parse(fs.readFileSync(path.join(dir, '.subtarefas.json'), 'utf8'));
  assert.strictEqual(subs[0].key, 'DOC-001-1');
  assert.strictEqual(tarefasDe(dir)[0].ticket, 'DOC-001-1');
  assert.strictEqual(tarefasDe(dir)[0].status, 'aprovada');
  await a.tarefaAprovar({ id: 'qa' });
  const subs2 = JSON.parse(fs.readFileSync(path.join(dir, '.subtarefas.json'), 'utf8'));
  assert.strictEqual(subs2[1].resumo, '[QA] Planejamento dos Casos de Testes');
  assert.match(subs2[1].descricao, /caso/);
  const html = require('../abas/tarefas').telaTarefas(tickets.ler('DOC-001'), tarefasDe(dir));
  assert.ok(!/href=""/.test(html), 'sem link quebrado');
  assert.match(html, /subtarefa no documento|DOC-001-1/);

  // 3. Dúvida enviada vira comentário local (da extensão: autorId local).
  gravar('DOC-001', DUVIDAS, [{ id: 'D1', texto: 'Qual o prazo?', em: new Date().toISOString() }]);
  await duv.acoes(servicos).duvidaEnviar({ id: 'D1' });
  assert.ok(duvidasDe(dir)[0].enviadaEm);
  const cs = JSON.parse(fs.readFileSync(path.join(dir, '.comentarios.json'), 'utf8'));
  assert.strictEqual(cs.length, 1);
  assert.strictEqual(cs[0].autorId, 'local');

  // 4. Vigia: o da extensão não dispara; o externo dispara [triagem] (há dúvida aberta).
  const n0 = chamadas.length;
  await orq.vigiarComentarios();
  assert.strictEqual(chamadas.length, n0, 'comentário da própria extensão não dispara');
  assert.strictEqual(impactosDe(dir).length, 0);
  doc.adicionarComentario('DOC-001', { autor: 'Ana', texto: 'O prazo é 30 dias.', externo: true });
  await orq.vigiarComentarios();
  assert.strictEqual(impactosDe(dir).length, 1);
  assert.strictEqual(chamadas.length, n0 + 1);
  assert.match(chamadas[n0].prompt, /\[triagem\]/);
  assert.match(chamadas[n0].prompt, /O prazo é 30 dias/);
  assert.match(chamadas[n0].prompt, /D1: Qual o prazo/);
  assert.ok(chamadas[n0].prompt.includes('Ticket por documento'), 'a triagem herda o bloco');

  // Sem comentário novo, nada novo.
  await orq.vigiarComentarios();
  assert.strictEqual(chamadas.length, n0 + 1);
  assert.ok(
    !msgs.some((m) => m[0] === 'showErrorMessage'),
    'nenhum erro mostrado: ' + JSON.stringify(msgs.filter((m) => m[0] === 'showErrorMessage'))
  );
  console.log('ok');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
