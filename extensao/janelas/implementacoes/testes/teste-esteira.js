// @ts-check
// node janelas/implementacoes/testes/teste-esteira.js — a esteira de Implementação ponta a ponta, com o Claude simulado (maestro.rodar trocado), git real em
// repositórios temporários e os comandos de build/teste simulados. Nada sai da máquina.
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert'),
  https = require('https');
const { execFileSync } = require('child_process');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'esteira-home-'));
const Module = /** @type {any} */ (require('module'));
const load = Module._load;
const noop = new Proxy(function () {}, { get: () => () => {}, apply: () => undefined });
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
          : k === 'window'
            ? {
                showInformationMessage: async () => 'Aprovar',
                showWarningMessage: async () => 'Aprovar',
                showInputBox: async () => 'troque o nome da função',
                showErrorMessage: async () => undefined
              }
            : k === 'Uri'
              ? { file: (f) => ({ fsPath: f }) }
              : noop
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

const tickets = require('../../../infra/ticket/tickets');
const maestro = require('../../../infra/agentes/maestro');
const controle = require('../../../infra/controle');
const esteira = require('../esteira');
const dossie = require('../../../infra/dossie');
const prompts = require('../prompts');
const T = esteira._teste;
const simTeste = require('./simular-teste');
simTeste.instalar();

// ── repositórios git temporários ──
const gitX = (cwd, ...a) =>
  execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' }).trim();
const criarRepo = (nome, camada) => {
  const caminho = fs.mkdtempSync(path.join(os.tmpdir(), `repo-${nome}-`));
  gitX(caminho, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(caminho, 'a.txt'), 'um\n');
  gitX(caminho, 'add', '.');
  gitX(caminho, 'commit', '-q', '-m', 'init');
  return { caminho, camada, branchPrincipal: 'main' };
};
// "origin" local para o fetch/pull: clone bare do repositório.
const comOrigin = (r) => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'origin-'));
  execFileSync('git', ['clone', '-q', '--bare', r.caminho, bare]);
  gitX(r.caminho, 'remote', 'add', 'origin', bare);
  return r;
};

// ── ticket e serviços ──
let n = 0;
const novoTicket = (extras = {}) => {
  const chave = `IMP-${++n}`;
  tickets.gravar({
    idProvedor: chave,
    chave,
    provedor: 'jira',
    site: 'https://x',
    link: `https://x/${chave}`,
    titulo: 'Corrigir cancelamento da nota',
    tipo: 'Story',
    status: '',
    conversas: [],
    ...extras
  });
  return { ...tickets.ler(chave), id: chave };
};
const servicos = (t, repos) => ({
  pastaAba: (id) => tickets.pasta(id, 'impl'),
  pasta: (id) => tickets.pasta(id),
  render: () => {},
  ticketAberto: () => t,
  reposDe: () => repos,
  cacheJira: {}
});
const aprovarSpec = (t, specs) => {
  // spec e tarefas aprovadas → modo executar
  const d = path.join(specs, `${t.chave}-f`);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'spec.md'), '# Spec');
  fs.writeFileSync(path.join(d, 'tasks.md'), '# T');
  fs.writeFileSync(
    path.join(d, 'sdd-state.json'),
    JSON.stringify({
      passos: [
        { n: 1, status: 'aprovado' },
        { n: 2, status: 'aprovado' },
        { n: 4, status: 'aprovado' }
      ]
    })
  );
  fs.writeFileSync(
    path.join(tickets.pasta(t.chave), '.tarefas.json'),
    JSON.stringify([{ id: 't01', status: 'aprovada' }])
  );
  tickets.gravar({ ...tickets.ler(t.chave), spec: { repo: specs, dir: `${t.chave}-f` } });
  return { ...tickets.ler(t.chave), id: t.chave };
};

// ── Claude simulado: cada etapa grava o seu arquivo (ou a pausa) num setImmediate, como o processo real ──
let roteiro = {}; // n -> (dir, c) => void | 'pausa'
const prompt_ = [];
const rodarSimulado = (dir, opts) => {
  if (simTeste.simular(dir, opts))
    return (
      prompt_.push({
        n: `T${/7\.(\d)/.exec(opts.titulo)[1]}`,
        prompt: opts.prompt,
        ferramentas: opts.ferramentas,
        env: opts.env,
        extras: opts.extras
      }),
      true
    ); // etapa 7: testes/simular-teste.js
  const sub = /Reprodução 1\.(\d)/.exec(opts.titulo);
  const num = sub ? `R${sub[1]}` : /Reprodução/.test(opts.titulo) ? 'RP' : Number(/Etapa (\d)/.exec(opts.titulo)[1]);
  prompt_.push({ n: num, prompt: opts.prompt, ferramentas: opts.ferramentas, env: opts.env, extras: opts.extras });
  setImmediate(() => {
    const fn = roteiro[num];
    const r = fn ? fn(dir, opts) : undefined;
    if (r !== 'nada' && !r?.pausa && prompts.ARQ[num] && !fs.existsSync(path.join(dir, prompts.ARQ[num]))) {
      fs.writeFileSync(
        path.join(dir, prompts.ARQ[num]),
        num === 4 ? '# Plano\nRepositórios afetados: backend\n## Mudanças\n- a.txt\n' : `# etapa ${num}\n`
      );
    }
    opts.aoMudar();
  });
  return true;
};
maestro.rodar = /** @type {any} */ (rodarSimulado);

const esperar = async (cond, ms = 8000) => {
  for (const fim = Date.now() + ms; Date.now() < fim; ) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error('timeout: ' + JSON.stringify(T.estado(DIR)));
};
let DIR = '';
const fase = (f) => () => T.estado(DIR).fase === f;
// Sem branch do ticket a esteira pergunta antes de criar: aceita a sugestão.
const aceitarCriar = async (s, t) => {
  await esperar(() => T.estado(DIR).pausa?.motivo === 'criar');
  await T.responder(s, t, T.estado(DIR).pausa.opcoes[0]);
};
const BANCO_OFF = { get: (k) => ({ modelo: '', bancoConexao: '', bancoAmbiente: '' })[k] };
T.deps.cfg = () => /** @type {any} */ (BANCO_OFF);

(async () => {
  // ═══ 1. Executar de ponta a ponta: spec aprovada, branch, implementação, verificação que falha uma vez e corrige ═══
  {
    const repo = comOrigin(criarRepo('backend', 'backend'));
    const specs = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-'));
    const t = aprovarSpec(novoTicket(), specs),
      s = servicos(t, [repo]);
    DIR = s.pastaAba(t.id);
    roteiro = {
      5: () => {
        fs.writeFileSync(path.join(repo.caminho, 'novo.txt'), 'x\n');
      }
    };
    let execs = 0;
    T.deps.comandos = () => [{ id: 'c1', nome: 'Testes backend', comando: 'dotnet test', pasta: repo.caminho }];
    T.deps.executar = async () => ({
      codigo: ++execs === 1 ? 1 : 0,
      saida: execs === 1 ? 'FALHOU: Cancelar_Nota' : 'ok'
    });

    await T.seguir(s, t);
    await esperar(fase('aguardando')); // 1 Dossiê → 2 (sem portão: prontidão alta) → 3 → 4 (portão sempre)
    let e = T.estado(DIR);
    assert.strictEqual(e.etapa, 4);
    assert.ok(
      fs.existsSync(path.join(DIR, 'dossie.json')) &&
        fs.existsSync(path.join(DIR, 'entendimento.md')) &&
        fs.existsSync(path.join(DIR, 'varredura.md'))
    );
    assert.deepStrictEqual(
      prompt_.map((p) => p.n),
      [2, 3, 4]
    );
    assert.ok(prompt_[1].prompt.includes('VARREDURA') && prompt_[1].prompt.includes('somente leitura'));
    assert.ok(prompt_[0].prompt.includes('NÃO altere código'));
    assert.ok(!prompt_[0].ferramentas.includes('Edit') && !prompt_[1].ferramentas.includes('Write')); // nada escreve em repositório antes do portão
    assert.ok(prompt_[0].env.IMPLEMENTACAO_DIR === DIR);
    assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main'); // ainda sem branch de trabalho

    // aprovar o Plano de mudança (exige abrir antes)
    const acoes = esteira.acoes(s);
    await acoes.esteiraAprovar(); // não leu: nada acontece
    assert.strictEqual(T.estado(DIR).fase, 'aguardando');
    acoes.esteiraAbrir({ id: 4 });
    assert.strictEqual(T.estado(DIR).aprovacao.lido, true);
    await acoes.esteiraAprovar();
    // sem branch do ticket: SEMPRE pergunta antes de criar (nome no padrão do repositório, base sugerida)
    await esperar(fase('pausado'));
    const pc = T.estado(DIR).pausa;
    assert.deepStrictEqual([pc.motivo, pc.nome, pc.sugerida], ['criar', 'story/' + t.chave, 'main']); // Story sem histórico → story/
    assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
    await T.responder(s, t, pc.opcoes[0]);
    await esperar(fase('concluido'));
    e = T.estado(DIR);
    assert.deepStrictEqual([e.etapa, e.tentativas, e.correcao], [8, 0, false]);
    const nomeRamo = 'story/' + t.chave;
    assert.ok(!e.pausa && e.branches[repo.caminho] === nomeRamo);
    assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), nomeRamo);
    assert.ok(fs.existsSync(path.join(repo.caminho, 'novo.txt')));
    assert.strictEqual(gitX(repo.caminho, 'log', '--oneline').split('\n').length, 1); // nenhum commit da esteira
    const ns = prompt_.map((p) => p.n);
    assert.deepStrictEqual(ns, [2, 3, 4, 5, 5, 'T1', 'T3', 8]); // 5 rodou duas vezes: implementação e correção
    assert.ok(prompt_[3].ferramentas.includes('Edit') && prompt_[3].extras.includes(repo.caminho));
    assert.ok(
      !prompt_[3].prompt.includes('CORREÇÃO') &&
        prompt_[4].prompt.includes('ESTA É UMA CORREÇÃO') &&
        prompt_[4].prompt.includes('Cancelar_Nota')
    );
    assert.ok(prompt_.find((p) => p.n === 8).prompt.includes('novo.txt')); // o resumo recebe o que mudou no repositório
    const v = JSON.parse(fs.readFileSync(path.join(DIR, 'verificacao.json'), 'utf8'));
    assert.deepStrictEqual([v.ok, v.rodadas.length, v.tentativa], [true, 1, 1]);
    assert.ok(fs.existsSync(path.join(DIR, 'implementacao.md')));
    // a conversa interativa passa a citar os artefatos
    const { pedido } = require('../../../modulos/conversas')._teste2;
    require('../../../infra/ticket/sessao').focar(t.chave, 'impl');
    const p = pedido(s, t);
    assert.ok(p.includes('dossie.md') && p.includes('plano-mudanca.md') && p.includes('implementacao.log.md'), p);
  }

  // ═══ 2. Só título: pausa pedindo o briefing; a resposta vira fonte verbal e o Entendimento passa pelo portão ═══
  {
    prompt_.length = 0;
    roteiro = {};
    const repo = criarRepo('mobile', 'mobile');
    const t = novoTicket(),
      s = servicos(t, [repo]);
    DIR = s.pastaAba(t.id);
    await T.seguir(s, t);
    assert.deepStrictEqual(
      [T.estado(DIR).fase, T.estado(DIR).pausa.motivo, T.estado(DIR).etapa],
      ['pausado', 'briefing', 1]
    );
    assert.strictEqual(prompt_.length, 0); // sem IA enquanto não há o que entender
    assert.strictEqual(dossie.lerGravado(DIR).modo, 'perguntar');
    assert.ok(esteira.corpo(t, {}, DIR).includes('data-acao="esteiraResponder"'));
    await T.responder(s, t, 'Ao cancelar a nota, estornar o saldo do cliente.');
    await esperar(fase('aguardando'));
    assert.ok(fs.readFileSync(path.join(DIR, '.briefing.md'), 'utf8').includes('estornar o saldo'));
    const d = dossie.lerGravado(DIR);
    assert.deepStrictEqual([d.modo, d.niveis.alvo, d.exigeAprovacaoEntendimento], ['entender', 'verbal', true]);
    assert.deepStrictEqual([T.estado(DIR).etapa, prompt_.map((p) => p.n)], [2, [2]]); // parou no portão do Entendimento
    // Pedir ajuste: roda a etapa de novo sobre o documento (modo ajuste)
    await new Promise((r) => setTimeout(r, 20));
    const ant = fs.statSync(path.join(DIR, 'entendimento.md')).mtimeMs;
    await new Promise((r) => setTimeout(r, 25));
    roteiro = { 2: (dir) => fs.writeFileSync(path.join(dir, 'entendimento.md'), '# Ajustado\n') };
    await esteira.acoes(s).esteiraAjuste();
    await esperar(
      () =>
        prompt_.length === 2 &&
        T.estado(DIR).fase === 'aguardando' &&
        fs.statSync(path.join(DIR, 'entendimento.md')).mtimeMs > ant
    );
    assert.ok(
      prompt_[1].prompt.includes('AJUSTE:') &&
        fs.readFileSync(path.join(DIR, '.respostas.md'), 'utf8').includes('troque o nome da função')
    );
  }

  // ═══ 3. Pausa pedida pelo Claude na Varredura; a resposta volta no .respostas.md e a etapa roda de novo ═══
  {
    prompt_.length = 0;
    const specs = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-'));
    const t = aprovarSpec(novoTicket(), specs),
      s = servicos(t, [criarRepo('b3', 'backend')]);
    DIR = s.pastaAba(t.id);
    let vez = 0;
    roteiro = {
      3: (dir) => {
        if (vez++ === 0) {
          fs.writeFileSync(
            path.join(dir, '.pausa.md'),
            'motivo: parecido\npergunta: Já existe CancelarNotaService.\nReutilizar?\nopcoes:\n- Reutilizar\n- Criar separado\n'
          );
          return 'nada';
        }
      }
    };
    await T.seguir(s, t);
    await esperar(fase('pausado'));
    assert.deepStrictEqual([T.estado(DIR).etapa, T.estado(DIR).pausa.opcoes], [3, ['Reutilizar', 'Criar separado']]);
    assert.ok(!fs.existsSync(path.join(DIR, '.pausa.md')) && !fs.existsSync(path.join(DIR, '.pausa.json')));
    assert.strictEqual(T.estado(DIR).pausa.pergunta, 'Já existe CancelarNotaService.\nReutilizar?');
    const html = esteira.corpo(t, {}, DIR);
    assert.ok(html.includes('Já existe CancelarNotaService') && html.includes('data-op="1"'));
    await esteira.acoes(s).esteiraResponder(/** @type {any} */ ({ op: '0' }));
    await esperar(fase('aguardando')); // 3 refeita → 4 (portão)
    assert.ok(fs.readFileSync(path.join(DIR, '.respostas.md'), 'utf8').includes('Reutilizar'));
    assert.ok(prompt_.filter((p) => p.n === 3).length === 2 && prompt_.at(-1).prompt.includes('.respostas.md'));
  }

  // ═══ 4. Branch principal não configurada: pausa, a resposta é salva e a esteira segue ═══
  {
    prompt_.length = 0;
    roteiro = { 5: (dir) => fs.writeFileSync(path.join(dir, '.x'), '') };
    const repo = comOrigin(criarRepo('b4', 'backend'));
    const semBranch = { ...repo, branchPrincipal: '' };
    const specs = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-'));
    const t = aprovarSpec(novoTicket(), specs),
      s = servicos(t, [semBranch]);
    DIR = s.pastaAba(t.id);
    roteiro = { 5: () => fs.writeFileSync(path.join(repo.caminho, 'f.txt'), '1') };
    T.deps.comandos = () => []; // sem build/teste: vira pendência, não bloqueia
    const salvos = [];
    T.deps.salvarBranchPrincipal = async (c, nome) => {
      salvos.push([c, nome]);
      s.reposDe = () => [{ ...semBranch, branchPrincipal: nome }];
    };
    await T.seguir(s, t);
    await esperar(fase('aguardando'));
    await esteira.acoes(s).esteiraAprovar(); // abrir já não é exigido? (lido=false) → recusa
    assert.strictEqual(T.estado(DIR).fase, 'aguardando');
    esteira.acoes(s).esteiraAbrir({ id: 4 });
    await esteira.acoes(s).esteiraAprovar();
    await esperar(fase('pausado'));
    assert.deepStrictEqual([T.estado(DIR).pausa.motivo, T.estado(DIR).pausa.repo], ['branchPrincipal', repo.caminho]);
    await T.responder(s, t, 'main');
    await esperar(fase('pausado'));
    assert.strictEqual(T.estado(DIR).pausa.motivo, 'criar');
    await T.responder(s, t, 'feature/outro-nome'); // texto livre: outro nome, a partir da base sugerida
    await esperar(fase('concluido'));
    assert.deepStrictEqual(salvos, [[repo.caminho, 'main']]);
    assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feature/outro-nome');
    const v = JSON.parse(fs.readFileSync(path.join(DIR, 'verificacao.json'), 'utf8'));
    assert.ok(v.ok && v.pendencias.length === 1 && /Nenhum comando de build ou teste/.test(v.pendencias[0]));
  }

  // ═══ 5. Repositório com alterações suas: a esteira não mexe, pausa ═══
  {
    prompt_.length = 0;
    const repo = comOrigin(criarRepo('b5', 'backend'));
    fs.writeFileSync(path.join(repo.caminho, 'a.txt'), 'meu trabalho\n');
    const t = novoTicket(),
      s = servicos(t, [repo]);
    DIR = s.pastaAba(t.id);
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, 'plano-mudanca.md'), '# Plano\nRepositórios afetados: backend\n');
    await T.prepararBranches(s, t, DIR);
    assert.deepStrictEqual([T.estado(DIR).fase, T.estado(DIR).pausa.motivo], ['pausado', 'criar']);
    T.mudar(DIR, { pausa: null, criar: { [repo.caminho]: { nome: `story/${t.chave}`, base: 'main' } } });
    await T.prepararBranches(s, t, DIR);
    assert.deepStrictEqual([T.estado(DIR).fase, T.estado(DIR).pausa.motivo], ['pausado', 'sujo']);
    assert.strictEqual(fs.readFileSync(path.join(repo.caminho, 'a.txt'), 'utf8'), 'meu trabalho\n');
    assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
    // só as camadas do plano são tocadas
    const mob = criarRepo('m5', 'mobile'),
      back = criarRepo('k5', 'backend');
    assert.deepStrictEqual(
      T.afetados(DIR, [mob, back]).map((r) => r.camada),
      ['backend']
    );
    fs.writeFileSync(path.join(DIR, 'plano-mudanca.md'), '# Plano\n');
    assert.strictEqual(T.afetados(DIR, [mob, back]).length, 2); // sem a linha: todos
  }

  // ═══ 5b. Branch do ticket já existe: usa sem perguntar; na entrada da execução, o repositório em branch de outro ticket volta para a principal ═══
  {
    const repo = comOrigin(criarRepo('b5b', 'backend'));
    const t = novoTicket(),
      s = servicos(t, [repo]);
    DIR = s.pastaAba(t.id);
    fs.mkdirSync(DIR, { recursive: true });
    gitX(repo.caminho, 'branch', `task/${t.chave}`); // prefixo diferente do sugerido: vale a que existe
    assert.strictEqual(await T.prepararBranches(s, t, DIR), true);
    assert.deepStrictEqual(
      [T.estado(DIR).pausa, gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD')],
      [null, `task/${t.chave}`]
    );
    const { garantir } = require('../orquestrador/principal');
    assert.strictEqual(garantir(s, t, DIR, 2), true); // checkout do ticket: fica
    assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), `task/${t.chave}`);
    gitX(repo.caminho, 'checkout', '-q', '-b', 'feature/OUTRO-9');
    assert.strictEqual(garantir(s, t, DIR, 2), true);
    assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main');
    gitX(repo.caminho, 'checkout', '-q', 'feature/OUTRO-9');
    fs.writeFileSync(path.join(repo.caminho, 'a.txt'), 'trabalho do outro\n');
    assert.strictEqual(garantir(s, t, DIR, 2), false); // sujo: pausa e não mexe
    assert.deepStrictEqual(
      [T.estado(DIR).pausa.motivo, gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD')],
      ['principal', 'feature/OUTRO-9']
    );
  }

  // ═══ 6. Verificação que não passa depois de 2 correções: pausa com as saídas; "seguir assim mesmo" vai ao Resumo ═══
  {
    prompt_.length = 0;
    roteiro = {};
    const repo = comOrigin(criarRepo('b6', 'backend'));
    const specs = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-'));
    const t = aprovarSpec(novoTicket(), specs),
      s = servicos(t, [repo]);
    DIR = s.pastaAba(t.id);
    roteiro = { 5: () => fs.writeFileSync(path.join(repo.caminho, `f${Math.random()}.txt`), '1') };
    T.deps.comandos = () => [{ id: 'c', nome: 'Build', comando: 'yarn build', pasta: repo.caminho }];
    T.deps.executar = async () => ({ codigo: 2, saida: 'erro de compilação' });
    await T.seguir(s, t);
    await esperar(fase('aguardando'));
    esteira.acoes(s).esteiraAbrir({ id: 4 });
    await esteira.acoes(s).esteiraAprovar();
    await aceitarCriar(s, t);
    await esperar(fase('pausado'));
    assert.deepStrictEqual(
      [T.estado(DIR).pausa.motivo, T.estado(DIR).tentativas, prompt_.filter((p) => p.n === 5).length],
      ['verificacao', 2, 3]
    );
    assert.ok(esteira.corpo(t, {}, DIR).includes('Seguir assim mesmo'));
    await T.responder(s, t, T.RESUMIR);
    await esperar(fase('concluido'));
    assert.ok(prompt_.at(-1).n === 8);
  }

  // ═══ 7. Implementação que não alterou nada: pausa antes de verificar ═══
  {
    prompt_.length = 0;
    roteiro = {};
    const repo = comOrigin(criarRepo('b7', 'backend'));
    const t = novoTicket(),
      s = servicos(t, [repo]);
    DIR = s.pastaAba(t.id);
    fs.mkdirSync(DIR, { recursive: true });
    T.mudar(DIR, { etapa: 5, fase: 'parado' });
    fs.writeFileSync(path.join(DIR, 'plano-mudanca.md'), '# P\n');
    dossie.gravar(DIR, dossie.montar(t, {}));
    await T.seguir(s, t);
    await aceitarCriar(s, t);
    await esperar(fase('pausado'));
    assert.strictEqual(T.estado(DIR).pausa.motivo, 'sem-mudanca');
  }

  // ═══ 8. ⏸ manual cancela a rodada; ▶ aparece; botões e ações registradas ═══
  {
    const t = novoTicket(),
      s = servicos(t, []);
    DIR = s.pastaAba(t.id);
    const b = (a) => `data-acao="${a}"`;
    T.mudar(DIR, { etapa: 3, fase: 'rodando' });
    assert.ok(esteira.botaoPlay(DIR, b).includes('esteiraPausar'));
    const rodada = controle.nova(DIR);
    esteira.acoes(s).esteiraPausar();
    assert.deepStrictEqual(
      [T.estado(DIR).fase, T.estado(DIR).pausa.motivo, controle.valida(DIR, rodada)],
      ['pausado', 'manual', false]
    );
    assert.ok(esteira.botaoPlay(DIR, b).includes('esteiraRetomar') && esteira.corpo(t, {}, DIR).includes('▶ Retomar'));
    await T.aposEtapa(s, t, 3, rodada); // o Claude morto pela pausa não vira erro
    assert.strictEqual(T.estado(DIR).fase, 'pausado');
    assert.deepStrictEqual(Object.keys(esteira.acoes(s)).sort(), [
      'esteiraAbrir',
      'esteiraAbrirArquivo',
      'esteiraAjuste',
      'esteiraAprovar',
      'esteiraArquivo',
      'esteiraDossieDe',
      'esteiraIniciar',
      'esteiraObs',
      'esteiraPausar',
      'esteiraResponder',
      'esteiraRetomar',
      'testeRefazer'
    ]);
  }

  // ═══ 9. Tela inicial: explicação do dev (opcional) e a aba Dossiê ═══
  {
    const t = novoTicket(),
      s = servicos(t, []);
    DIR = s.pastaAba(t.id);
    const h = esteira.corpo(t, {}, DIR);
    assert.ok(
      h.includes('data-acao="esteiraIniciar"') && h.includes('data-obs-impl') && h.includes('data-acao="claude"')
    );
    assert.ok(esteira.ETAPAS.every((e) => h.includes(e.nome)));
    esteira.acoes(s).esteiraObs({ texto: '  explicação  ' });
    assert.strictEqual(fs.readFileSync(path.join(DIR, '.briefing.md'), 'utf8'), 'explicação\n');
    esteira.acoes(s).esteiraObs({ texto: '' });
    assert.ok(!fs.existsSync(path.join(DIR, '.briefing.md')));
    const dh = esteira.corpoDossie(t, { jira: { descricao: 'x'.repeat(80), comentarios: [] } }, DIR);
    assert.ok(dh.includes('Dossiê') && dh.includes('Entender primeiro'));
  }

  // ═══ 10. Nome da branch e vagas ═══
  // uma branch por ticket, <prefixo>/<CHAVE>, sem slug; prefixo no padrão do repositório (CLAUDE.md, "Branches")
  {
    const r = comOrigin(criarRepo('nome', 'backend'));
    assert.strictEqual(
      T.sugerido(r, { chave: 'WMS-12', titulo: 'Cálculo de Média/Saída — Ação!', tipo: 'História' }).nome,
      'story/WMS-12'
    );
    for (const b of ['feature/WMS-1', 'feature/WMS-2']) gitX(r.caminho, 'push', '-q', 'origin', `main:refs/heads/${b}`);
    gitX(r.caminho, 'fetch', '-q', 'origin');
    assert.strictEqual(T.sugerido(r, { chave: 'WMS-12', tipo: 'História' }).nome, 'feature/WMS-12'); // o repositório usa feature/
    assert.strictEqual(T.sugerido(r, { chave: 'WMS-14', tipo: 'Bug' }).nome, 'bugfix/WMS-14');
    assert.strictEqual(T.sugerido(r, { chave: 'WMS-16', tipo: 'Incidente' }).nome, 'hotfix/WMS-16');
    assert.strictEqual(
      T.sugerido(r, { chave: 'WMS-17', tipo: 'Coisa', categoria: 'bug', categoriaOrigem: 'usuario' }).nome,
      'bugfix/WMS-17'
    ); // escolha do usuário
  }
  const etapas = require('../../../infra/agentes/etapas');
  assert.ok(etapas.VAGAS['impl.mapa'] && etapas.MODULOS.find((m) => m.id === 'impl').etapas.length === 8);
  assert.strictEqual(etapas.usos('impl.mapa').length, 2);

  // ═══ 11. Pausa em texto simples (o JSON em heredoc é bloqueado pelo verificador de comandos do Claude Code) ═══
  {
    const ex = (txt) => T.parsePausa(txt);
    assert.deepStrictEqual(ex('motivo: repo\npergunta: Qual repositório?\nopcoes:\n- A (recomendada)\n- B\n'), {
      motivo: 'repo',
      pergunta: 'Qual repositório?',
      opcoes: ['A (recomendada)', 'B']
    });
    assert.deepStrictEqual(ex('pergunta: Livre?\n'), { motivo: '', pergunta: 'Livre?', opcoes: [] });
    assert.deepStrictEqual(ex('motivo: x\npergunta: Linha 1\nlinha 2\nopcoes:\n1. Um\n2) Dois\n* Três\n'), {
      motivo: 'x',
      pergunta: 'Linha 1\nlinha 2',
      opcoes: ['Um', 'Dois', 'Três']
    });
    assert.strictEqual(ex('só lixo sem pergunta') && ex('só lixo sem pergunta').pergunta, 'só lixo sem pergunta'); // sem rótulos: o texto todo é a pergunta
    assert.strictEqual(ex(''), null);
    // .pausa.json antigo continua valendo
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pausa-'));
    fs.writeFileSync(path.join(d, '.pausa.json'), JSON.stringify({ motivo: 'm', pergunta: 'p', opcoes: ['o'] }));
    assert.deepStrictEqual(T.lerPausa(d), { motivo: 'm', pergunta: 'p', opcoes: ['o'] });
    // o bin grava só os nomes do contrato, com o texto pela entrada padrão, e a pausa gravada por ele é lida
    const { spawnSync } = require('child_process'),
      bin = path.join(__dirname, '..', 'bin', 'implementacao-gravar');
    const rodar = (nome, entrada) =>
      spawnSync(process.execPath, [bin, nome], {
        input: entrada,
        env: { ...process.env, IMPLEMENTACAO_DIR: d },
        encoding: 'utf8'
      });
    assert.strictEqual(
      rodar('.pausa.md', 'motivo: parecido\npergunta: Reutilizar?\nopcoes:\n- Sim\n- Não\n').status,
      0
    );
    assert.deepStrictEqual(T.lerPausa(d), { motivo: 'parecido', pergunta: 'Reutilizar?', opcoes: ['Sim', 'Não'] }); // .pausa.md vence o .json
    assert.strictEqual(rodar('varredura.md', '# V\n').status, 0);
    assert.notStrictEqual(rodar('outro.txt', 'x').status, 0);
    assert.notStrictEqual(rodar('../fuga.md', 'x').status, 0);
    // o prompt ensina o formato novo e avisa do verificador
    const pr = prompts.prompt(3, { dir: d, t: { chave: 'X-1' }, d: {}, repos: [], banco: 'x' });
    assert.ok(
      pr.includes('.pausa.md') && pr.includes('motivo: <') && pr.includes('SEM JSON') && !pr.includes('{"motivo"')
    );
  }

  // ═══ 12. Bug/incidente: Reprodução 1.2 → 1.6 antes do Entendimento (veredito em 3 estados, ref destacada, prova print + vídeo) ═══
  {
    const fluxo = require('../../../componentes/fluxo-passos'),
      reproducao = require('../etapas/01-dossie/reproducao');
    const RD = T.depsReproducao;
    assert.strictEqual(dossie.ehBug('Bug'), true);
    assert.strictEqual(dossie.ehBug('Defeito'), true);
    assert.strictEqual(dossie.ehBug('Story'), false);
    const jira = {
      key: 'X',
      tipo: 'Bug',
      resumo: 'x',
      descricao: '<p>Ao cancelar a nota o sistema trava e mostra erro 500 na tela de baixa</p>',
      comentarios: [],
      subtarefas: [],
      anexos: [
        { id: '7', nome: 'erro.png', url: 'u', de: 'PAI-1' },
        { id: '8', nome: 'planilha.xlsx', url: 'u' }
      ]
    };
    T.deps.coletarEvidencias = (dir, anexos) =>
      reproducao.coletarEvidencias(dir, anexos, async () => Buffer.from('png'));
    // ambiente simulado: sobe na hora com o sha do HEAD do repositório; grava "vídeo" na pasta da sessão
    let gravaVideo = true,
      shaFalso = '';
    const subidos = [];
    RD.ambiente = () => 'emulador';
    RD.esperarVideo = async () => {};
    RD.obter = () => ({
      rotulo: 'emulador',
      texto: () => 'API 5111 · emulador ligado',
      guia: () => 'adb e maestro',
      comoPrint: (f) => `adb exec-out screencap -p > ${f}`,
      ferramentas: ['Bash(adb:*)'],
      mcp: undefined,
      evidencia: {
        gravar: (destino) => gravaVideo && fs.writeFileSync(path.join(destino, 'tela-01.mp4'), 'mp4'),
        parar: () => {}
      }
    });
    let REPO = null;
    RD.subir = async (dir, nome) => {
      subidos.push(nome);
      return { nome, parou_em: null, sha: { backend: shaFalso || gitX(REPO.caminho, 'rev-parse', '--short', 'HEAD') } };
    };
    const comentados = [];
    let respostasJira = [];
    RD.comentar = async (s, t, md) => {
      comentados.push(md);
      return { id: '100', created: '2026-10-17T10:00:00.000-0300' };
    };
    RD.comentarios = async () => respostasJira;
    const novo = (extras = {}, j = jira) => {
      const repo = criarRepo('backend', 'backend'),
        t = novoTicket({ titulo: 'Erro ao cancelar nota', ...extras }),
        s = servicos(t, [repo]);
      gitX(repo.caminho, 'checkout', '-q', '-b', 'trabalho-do-dev'); // o dev estava noutra branch: a reprodução roda na principal e volta
      fs.writeFileSync(path.join(repo.caminho, 'dev.txt'), 'dev\n');
      gitX(repo.caminho, 'add', '.');
      gitX(repo.caminho, 'commit', '-q', '-m', 'trabalho do dev');
      s.cacheJira[t.id] = { ...j, key: t.chave };
      DIR = s.pastaAba(t.id);
      REPO = repo;
      return { t, s, repo };
    };
    const plano = (dir) =>
      fluxo.plano(dir, [
        { titulo: 'Abrir a nota', texto: 'abre', fonte: 'descrição' },
        { titulo: 'Cancelar a nota', texto: 'erro 500', fonte: 'comentário do PO' }
      ]);
    const rodar = (dir, id, status, comPrint) => {
      fluxo.iniciar(dir, id);
      if (comPrint) {
        const f = path.join(dir, 'p.png');
        fs.writeFileSync(f, 'x');
        fluxo.evidencia(dir, id, [f]);
      }
      fluxo.concluir(dir, id, status, 'visto');
    };
    const evid = (dir) => fs.writeFileSync(path.join(dir, 'evidencias-ticket.md'), '# Evidências\nMassa: nota 123\n');
    const nums = () => prompt_.map((p) => p.n);

    // a) REPRODUZIDO: evidências → roteiro → checkout destacado na principal → reproduz (print + vídeo) → etapa 2; o HEAD volta
    {
      prompt_.length = 0;
      const { t, s, repo } = novo();
      const principal = gitX(repo.caminho, 'rev-parse', 'main');
      let headDurante = '';
      roteiro = {
        R2: evid,
        R3: plano,
        R5: (dir) => {
          headDurante =
            gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD') + ' ' + gitX(repo.caminho, 'rev-parse', 'HEAD');
          rodar(dir, 'P01', 'passou', true);
          rodar(dir, 'P02', 'falhou', true);
        }
      };
      await T.seguir(s, t);
      await esperar(fase('aguardando'));
      assert.deepStrictEqual(nums(), ['R2', 'R3', 'R5', 2]);
      assert.strictEqual(headDurante, `HEAD ${principal}`); // reproduziu no commit da principal, destacado
      assert.notStrictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD'); // voltou (e a etapa 2 levou para a principal)
      const e = T.estado(DIR);
      assert.deepStrictEqual(
        [e.etapa, e.reproducao, e.repro.veredito, e.repro.head],
        [2, 'ok', 'REPRODUZIDO', undefined]
      );
      assert.strictEqual(e.repro.refs[repo.caminho].commit, principal);
      const md = fs.readFileSync(path.join(DIR, 'reproducao.md'), 'utf8');
      assert.ok(
        md.includes('Veredito: Reproduzido') &&
          md.includes(principal.slice(0, 10)) &&
          md.includes('Ambiente: emulador'),
        md
      );
      assert.ok(
        md.includes('Erro confirmado') &&
          /evidência: evidencias\/P02\/.+\.mp4/.test(md) &&
          md.includes('PAI-1-erro.png'),
        md
      );
      assert.ok(md.includes('fonte: comentário do PO'));
      assert.ok(prompt_[0].prompt.includes('1.2 · EVIDÊNCIAS') && prompt_[0].prompt.includes('Massa de dados'));
      assert.ok(prompt_[1].prompt.includes('1.3 · ROTEIRO') && prompt_[1].prompt.includes('"fonte"'));
      assert.ok(
        prompt_[2].prompt.includes('1.5 · REPRODUZIR') &&
          prompt_[2].prompt.includes('screencap') &&
          prompt_[2].prompt.includes('main')
      );
      assert.ok(
        prompt_[2].ferramentas.includes(`Bash(${reproducao.BIN}:*)`) && prompt_[2].ferramentas.includes('Bash(adb:*)')
      );
      assert.ok(prompt_.slice(0, 3).every((p) => !p.ferramentas.includes('Edit') && !p.ferramentas.includes('Write'))); // não altera código
      const html = reproducao.corpo(t, { jira: s.cacheJira[t.id], uri: (f) => 'vsc://' + f }, DIR);
      assert.ok(
        html.includes('Reproduzido') &&
          html.includes('data-cen="P02"') &&
          html.includes('vídeo ✓') &&
          html.includes('PAI-1-erro.png')
      );
    }
    // b) NÃO REPRODUZIDO → Tentar de novo → INCONCLUSIVO (bloqueado) → Pedir dados (rascunho, só publica aprovado) → ⟳ com resposta volta à 1.2
    {
      prompt_.length = 0;
      comentados.length = 0;
      const { t, s } = novo();
      let vez = 0;
      roteiro = {
        R2: evid,
        R3: plano,
        R5: (dir) => {
          rodar(dir, 'P01', 'passou', true);
          rodar(dir, 'P02', ++vez === 1 ? 'passou' : 'bloqueado', true);
        },
        RP: (dir) => fs.writeFileSync(path.join(dir, 'comentario-jira.md'), 'Pode mandar o número da nota?')
      };
      await T.seguir(s, t);
      await esperar(fase('pausado'));
      let p = T.estado(DIR).pausa;
      assert.strictEqual(p.motivo, 'repro-nao');
      assert.deepStrictEqual(p.opcoes, [
        T.TENTAR,
        'Pedir mais dados no Jira',
        T.SEM_CONFIRMAR,
        'Encerrar a esteira (não corrigir)'
      ]);
      await T.responder(s, t, T.TENTAR);
      await esperar(() => T.estado(DIR).pausa?.motivo === 'repro-inconclusivo');
      assert.deepStrictEqual(nums(), ['R2', 'R3', 'R5', 'R3', 'R5']); // as evidências não se repetem; o roteiro, sim
      assert.ok(T.estado(DIR).pausa.pergunta.includes('bloqueado: P02'));
      assert.ok(fs.readdirSync(DIR).some((n) => /^fluxo\..+\.json$/.test(n))); // o fluxo anterior fica guardado
      await T.responder(s, t, 'Pedir mais dados no Jira');
      await esperar(() => T.estado(DIR).pausa?.motivo === 'aguardando-dados');
      p = T.estado(DIR).pausa;
      assert.ok(
        p.pergunta.includes('Pode mandar o número da nota?') && p.opcoes[0] === 'Publicar o comentário no ticket'
      );
      assert.strictEqual(comentados.length, 0); // nada publicado sem aprovação
      await T.responder(s, t, 'Qual o número da nota e o horário?'); // o dev reescreve: troca o rascunho, ainda sem publicar
      assert.ok(T.estado(DIR).pausa.pergunta.includes('horário') && comentados.length === 0);
      await T.responder(s, t, 'Publicar o comentário no ticket');
      assert.deepStrictEqual(comentados, ['Qual o número da nota e o horário?']);
      assert.ok(T.estado(DIR).pausa.publicado && T.estado(DIR).repro.pedido.id === '100');
      const impl = require('../implementacoes');
      s.atualizarJira = async (id) => {
        s.cacheJira[id] = { ...jira, key: t.chave }; // o ⟳ relê o ticket (com a resposta)
      };
      respostasJira = [{ id: '100', data: '2026-10-17T10:00:00.000-0300', autor: 'eu', texto: 'x' }];
      assert.strictEqual(await impl.aoAtualizar(s, t), false); // só o nosso: continua esperando
      prompt_.length = 0;
      vez = 0;
      respostasJira.push({ id: '101', data: '2026-10-17T11:00:00.000-0300', autor: 'PO', texto: 'nota 123' });
      assert.strictEqual(await impl.aoAtualizar(s, t), true);
      await esperar(() => T.estado(DIR).pausa?.motivo === 'repro-nao');
      assert.deepStrictEqual(nums(), ['R2', 'R3', 'R5']); // recomeçou da 1.2
      await T.responder(s, t, T.SEM_CONFIRMAR);
      await esperar(fase('aguardando'));
      assert.strictEqual(T.estado(DIR).reproducao, 'aceita');
      assert.ok(fs.readFileSync(path.join(DIR, 'reproducao.md'), 'utf8').includes('Erro não confirmado'));
      assert.strictEqual(comentados.length, 1);
    }
    // c) falhou com print mas sem vídeo: sem evidência
    {
      gravaVideo = false;
      const { t, s } = novo();
      roteiro = { R2: evid, R3: plano, R5: (dir) => rodar(dir, 'P01', 'falhou', true) };
      await T.seguir(s, t);
      await esperar(fase('pausado'));
      const p = T.estado(DIR).pausa;
      assert.ok(p.motivo === 'repro-evidencia' && p.pergunta.includes('P01'), JSON.stringify(p));
      gravaVideo = true;
    }
    // d) sem passo a passo: a IA pausa na 1.3 → INCONCLUSIVO com a pergunta dela; nada de checkout nem ambiente
    {
      prompt_.length = 0;
      subidos.length = 0;
      const { t, s } = novo();
      roteiro = {
        R2: evid,
        R3: (dir) =>
          fs.writeFileSync(
            path.join(dir, '.pausa.md'),
            'motivo: sem-passo-a-passo\npergunta: Em que tela o erro aparece?\n'
          )
      };
      await T.seguir(s, t);
      await esperar(fase('pausado'));
      const p = T.estado(DIR).pausa;
      assert.ok(p.motivo === 'repro-inconclusivo' && p.pergunta.includes('Em que tela'), JSON.stringify(p));
      assert.ok(
        p.opcoes.includes('Pedir mais dados no Jira') && !p.opcoes.includes('Encerrar a esteira (não corrigir)')
      );
      assert.deepStrictEqual([nums(), subidos], [['R2', 'R3'], []]);
    }
    // e) o ambiente roda outro commit: INCONCLUSIVO, e o HEAD volta mesmo assim
    {
      shaFalso = 'deadbee';
      const { t, s, repo } = novo();
      roteiro = { R2: evid, R3: plano };
      await T.seguir(s, t);
      await esperar(fase('pausado'));
      assert.ok(T.estado(DIR).pausa.pergunta.includes('deadbee'));
      assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), 'trabalho-do-dev');
      shaFalso = '';
    }
    // f) repositório sujo: pausa 'sujo' antes do checkout
    {
      const { t, s, repo } = novo();
      fs.appendFileSync(path.join(repo.caminho, 'a.txt'), 'mexido\n');
      roteiro = { R2: evid, R3: plano };
      await T.seguir(s, t);
      await esperar(fase('pausado'));
      assert.strictEqual(T.estado(DIR).pausa.motivo, 'sujo');
      assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), 'trabalho-do-dev');
    }
    // g) tipo não reconhecido: pausa 'tipo' antes de decidir; a resposta "bug" leva à reprodução
    {
      prompt_.length = 0;
      const { t, s } = novo({ tipo: 'Coisa' }, { ...jira, tipo: 'Coisa' });
      roteiro = { R2: evid, R3: plano, R5: (dir) => rodar(dir, 'P01', 'falhou', true) };
      await T.seguir(s, t);
      await esperar(fase('pausado'));
      assert.strictEqual(T.estado(DIR).pausa.motivo, 'tipo');
      assert.deepStrictEqual(nums(), []);
      await T.responder(s, t, 'bugfix (bug)');
      await esperar(() => T.estado(DIR).reproducao === 'ok');
      assert.deepStrictEqual(nums().slice(0, 3), ['R2', 'R3', 'R5']);
    }
    // h) o Mergulho (Incidentes) já reproduziu: não reproduz de novo
    {
      prompt_.length = 0;
      const { t, s } = novo();
      const inc = tickets.pasta(t.chave, 'incidentes');
      fs.mkdirSync(inc, { recursive: true });
      fs.writeFileSync(path.join(inc, 'reproducao.json'), JSON.stringify({ ok: true, acao: 'cancelou a nota 123' }));
      await T.seguir(s, t);
      await esperar(fase('aguardando'));
      assert.deepStrictEqual([nums(), T.estado(DIR).reproducao], [[2], 'mergulho']);
    }
    // i) a reprodução caiu no meio (HEAD destacado guardado): ao retomar, o repositório volta ao HEAD de antes
    {
      const { t, s, repo } = novo();
      gitX(repo.caminho, 'checkout', '-q', '--detach', 'main');
      T.mudar(DIR, { repro: { head: { [repo.caminho]: 'trabalho-do-dev' } } });
      roteiro = { R2: evid, R3: (dir) => fs.writeFileSync(path.join(dir, '.pausa.md'), 'pergunta: Qual tela?\n') };
      await T.seguir(s, t);
      await esperar(fase('pausado'));
      assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), 'trabalho-do-dev');
      assert.strictEqual(T.estado(DIR).repro.head, undefined);
    }
    // j) ticket que não é bug: sem Reprodução e a aba explica
    {
      const t = novoTicket(),
        html = reproducao.corpo(t, { jira: { tipo: 'Story' } }, servicos(t, []).pastaAba(t.id));
      assert.ok(html.includes('vale para tickets do tipo Bug'));
    }
  }

  console.log('ok');
  setTimeout(() => process.exit(0), 100); // o log do Ao vivo escoa por timer
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
