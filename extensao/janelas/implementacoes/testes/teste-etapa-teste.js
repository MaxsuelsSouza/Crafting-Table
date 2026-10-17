// @ts-check
// node janelas/implementacoes/testes/teste-etapa-teste.js — etapa 7 (Teste na aplicação) com o Claude e a aplicação simulados
// (testes/simular-teste.js): passa e segue para o Resumo; CT que falha volta para a 5 com os achados e reabre o fluxo; abaixo do mínimo
// na 2ª vez pausa e "seguir abaixo" marca entregavel:false; aplicação que não sobe dá score 0 e pausa sem voltar para a 5; plano sem
// CT crítico pausa e o texto livre refaz a 7.1 com o ajuste. Nada sai da máquina.
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert');
const { execFileSync } = require('child_process');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'etapa7-home-'));
const Module = /** @type {any} */ (require('module'));
const load = Module._load;
const noop = new Proxy(function () {}, { get: () => () => {}, apply: () => undefined });
Module._load = (r, ...a) =>
  r === 'vscode'
    ? new Proxy(
        {},
        { get: (_, k) => (k === 'workspace' ? { getConfiguration: () => ({ get: () => undefined }) } : noop) }
      )
    : load(r, ...a);

const tickets = require('../../../infra/ticket/tickets');
const maestro = require('../../../infra/agentes/maestro');
const controle = require('../../../infra/controle');
const esteira = require('../esteira');
const simTeste = require('./simular-teste');
const { RETESTAR, ABAIXO } = require('../etapas/07-teste/opcoes');
const T = esteira._teste;
simTeste.instalar();
T.deps.cfg = () => /** @type {any} */ ({ get: () => '' });
T.deps.comandos = () => []; // verificação sem comandos: passa

const gitX = (cwd, ...a) =>
  execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' }).trim();
const prompt_ = [];
maestro.rodar = /** @type {any} */ (
  (dir, opts) => {
    if (simTeste.simular(dir, opts)) return true;
    const n = Number(/Etapa (\d)/.exec(opts.titulo)[1]);
    prompt_.push({ n, prompt: opts.prompt });
    setImmediate(() => {
      if (n === 5) fs.writeFileSync(path.join(dir, 'implementacao.log.md'), '# log\n');
      if (n === 8) fs.writeFileSync(path.join(dir, 'implementacao.md'), '# resumo\n');
      opts.aoMudar();
    });
    return true;
  }
);
const esperar = async (cond, dir, ms = 8000) => {
  for (const fim = Date.now() + ms; Date.now() < fim; await new Promise((r) => setTimeout(r, 15))) if (cond()) return;
  throw new Error('timeout: ' + JSON.stringify(T.estado(dir)));
};

let k = 0;
// Ticket na etapa 6 concluída: branch story/<CHAVE> com uma alteração (sem commit), como a esteira deixa.
function preparar(extras = {}) {
  const chave = `TST-${++k}`;
  tickets.gravar({
    idProvedor: chave,
    chave,
    provedor: 'jira',
    site: 'https://x',
    link: `https://x/${chave}`,
    titulo: 'Salvar',
    tipo: 'Story',
    status: '',
    conversas: [],
    ...extras
  });
  const t = { ...tickets.ler(chave), id: chave };
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-t7-'));
  gitX(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'um\n');
  gitX(repo, 'add', '.');
  gitX(repo, 'commit', '-q', '-m', 'init');
  gitX(repo, 'checkout', '-q', '-b', `story/${chave}`);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'dois\n');
  const r = { caminho: repo, camada: 'web', branchPrincipal: 'main' };
  const s = {
    pastaAba: (id) => tickets.pasta(id, 'impl'),
    pasta: (id) => tickets.pasta(id),
    render: () => {},
    ticketAberto: () => t,
    reposDe: () => [r],
    cacheJira: {}
  };
  const dir = s.pastaAba(t.id);
  fs.mkdirSync(dir, { recursive: true });
  for (const n of ['plano-mudanca.md', 'implementacao.log.md', 'verificacao.json'])
    fs.writeFileSync(path.join(dir, n), '{}');
  T.mudar(dir, { etapa: 6, fase: 'rodando', branches: { [repo]: `story/${chave}` }, principalOk: true });
  return { s, t, dir };
}
const resultado = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'teste.json'), 'utf8'));

(async () => {
  // ═══ 1. Tudo passa com print e vídeo: score 5 ≥ mínimo 3 (história), segue para o Resumo sem portão ═══
  {
    const { s, t, dir } = preparar();
    simTeste.sim.titulos.length = 0;
    await T.proxima(s, t, 6, controle.nova(dir));
    await esperar(() => T.estado(dir).fase === 'concluido', dir);
    const r = resultado(dir);
    assert.deepStrictEqual([r.score, r.minimo, r.entregavel, r.cts.length], [5, 3, true, 2]);
    assert.ok(
      r.cts.every((c) => c.print && c.video) && r.cts[0].criticidade === 'critica' && r.cts[1].tipo === 'regressao'
    );
    assert.deepStrictEqual(simTeste.sim.titulos, ['7.1', '7.3']);
    assert.strictEqual(T.estado(dir).etapa, 8);
    assert.ok(prompt_.at(-1).n === 8 && prompt_.at(-1).prompt.includes('teste.json'));
    assert.ok(fs.existsSync(path.join(dir, 'teste', 'evidencias', 'CT01')));
    assert.ok(require('../selos').selos(t).includes('Score 5/5'));
    const corpo = require('../abas/teste').corpo(t, {}, dir);
    assert.ok(corpo.includes('Score 5/5') && corpo.includes('base 3') && corpo.includes('plano-cts.md'));
  }

  // ═══ 2. CT crítico falha: volta para a 5 com os achados, passa pela 6 e testa de novo com o fluxo reaberto ═══
  {
    const { s, t, dir } = preparar();
    let vez = 0;
    simTeste.sim.resultado = (id) => (id === 'CT01' && vez++ === 0 ? 'falhou' : 'passou');
    prompt_.length = 0;
    await T.proxima(s, t, 6, controle.nova(dir));
    await esperar(() => T.estado(dir).fase === 'concluido', dir);
    const p5 = prompt_.find((p) => p.n === 5);
    assert.ok(
      p5 &&
        p5.prompt.includes('teste na aplicação (etapa 7) ficou abaixo do mínimo') &&
        p5.prompt.includes('CT01 [falhou'),
      p5?.prompt
    );
    const r = resultado(dir);
    assert.deepStrictEqual([r.score, r.tentativa], [5, 2]);
    assert.strictEqual(
      require('../../../componentes/fluxo-passos').ler(path.join(dir, 'teste')).passos[0].execucoes.length,
      2
    );
  }

  // ═══ 3. Falha de novo depois da correção: pausa 'teste'; seguir abaixo do mínimo → entregavel:false e Resumo ═══
  {
    const { s, t, dir } = preparar();
    simTeste.sim.resultado = (id) => (id === 'CT02' ? 'falhou' : 'passou');
    await T.proxima(s, t, 6, controle.nova(dir));
    await esperar(() => T.estado(dir).pausa?.motivo === 'teste', dir);
    const p = T.estado(dir).pausa;
    assert.deepStrictEqual(p.opcoes, [T.CORRIGIR, RETESTAR, ABAIXO]);
    assert.ok(p.pergunta.includes('Score 2/5') && p.pergunta.includes('regressão')); // regressão falhou: teto 2
    await T.responder(s, t, ABAIXO);
    await esperar(() => T.estado(dir).fase === 'concluido', dir);
    assert.strictEqual(resultado(dir).entregavel, false);
  }

  // ═══ 4. A aplicação não sobe: score 0, pausa sem voltar para a 5; rodar de novo depois de subir segue ═══
  {
    const { s, t, dir } = preparar({ tipo: 'Bug', prioridade: 'High' });
    simTeste.sim.resultado = () => 'passou';
    simTeste.sim.subiu = false;
    prompt_.length = 0;
    await T.proxima(s, t, 6, controle.nova(dir));
    await esperar(() => T.estado(dir).pausa?.motivo === 'teste', dir);
    assert.deepStrictEqual([resultado(dir).score, T.estado(dir).pausa.opcoes], [0, [RETESTAR, ABAIXO]]);
    assert.ok(!prompt_.some((x) => x.n === 5));
    assert.strictEqual(resultado(dir).minimo, 5); // bug 4 + prioridade alta 1
    simTeste.sim.subiu = true;
    await T.responder(s, t, RETESTAR);
    await esperar(() => T.estado(dir).fase === 'concluido', dir);
    assert.strictEqual(resultado(dir).score, 5);
  }

  // ═══ 5. Plano sem CT crítico: pausa; o texto livre refaz a 7.1 com o ajuste ═══
  {
    const { s, t, dir } = preparar();
    simTeste.sim.plano = simTeste.PLANO.replace('Criticidade: critica', 'Criticidade: alta');
    simTeste.sim.titulos.length = 0;
    await T.proxima(s, t, 6, controle.nova(dir));
    await esperar(() => T.estado(dir).pausa?.motivo === 'teste', dir);
    assert.ok(T.estado(dir).pausa.pergunta.includes('Criticidade: critica'));
    simTeste.sim.plano = simTeste.PLANO;
    await T.responder(s, t, 'o salvar é crítico');
    await esperar(() => T.estado(dir).fase === 'concluido', dir);
    assert.deepStrictEqual(simTeste.sim.titulos, ['7.1', '7.1', '7.3']);
    assert.ok(fs.readdirSync(path.join(dir, 'teste')).some((n) => /^plano-cts\..+\.md$/.test(n))); // o plano anterior fica guardado
  }
  console.log('teste-etapa-teste: ok');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
