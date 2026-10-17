// @ts-check
// node janelas/implementacoes/testes/teste-subtarefas.js — ticket com subtarefas: Etapa 0 (coleta, plano, validação, portão), branch única
// <tipo>/<CHAVE> (feature, bugfix ou hotfix; de onde ela parte), grupos em sequência e em paralelo (worktree, integração, verificação final), resumo do pai e o selo da lista.
// Claude simulado (maestro.rodar trocado), git real em repositórios temporários, comandos simulados. Nada sai da máquina.
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert'),
  https = require('https');
const { execFileSync } = require('child_process');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'subtarefas-home-'));
const Module = /** @type {any} */ (require('module'));
const load = Module._load;
const noop = new Proxy(function () {}, { get: () => () => {}, apply: () => undefined });
const vscodeMock = new Proxy(
  {},
  {
    get: (_, k) =>
      k === 'workspace'
        ? { getConfiguration: () => ({ get: () => undefined }) }
        : k === 'window'
          ? {
              showInformationMessage: async () => 'Aprovar',
              showWarningMessage: async () => 'Aprovar',
              showInputBox: async () => 'junte tudo',
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
const esteira = require('../esteira');
const prompts = require('../prompts');
const implementacoes = require('../implementacoes');
const T = esteira._teste;
const { separar, situacao: situacaoSub } = require('../etapas/00-subtarefas/regras/filtro');
const { lerPlanoMd } = require('../etapas/00-subtarefas/regras/ler-plano');
const { validarPlano } = require('../etapas/00-subtarefas/regras/validar-plano');
const { basesDe } = require('../etapas/05-implementacao/regras/base-branch');
const worktree = require('../etapas/00-subtarefas/regras/worktree');
const { dirGrupo, lerPlano, lerSubs } = require('../etapas/00-subtarefas/arquivos');

// ── repositórios git temporários ──
const gitX = (cwd, ...a) =>
  execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' }).trim();
const criarRepo = (nome, camada) => {
  const caminho = fs.mkdtempSync(path.join(os.tmpdir(), `repo-${nome}-`));
  gitX(caminho, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(caminho, 'a.txt'), 'um\n');
  gitX(caminho, 'add', '.');
  gitX(caminho, 'commit', '-q', '-m', 'init');
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'origin-'));
  execFileSync('git', ['clone', '-q', '--bare', caminho, bare]);
  gitX(caminho, 'remote', 'add', 'origin', bare);
  gitX(caminho, 'fetch', '-q', 'origin');
  return { caminho, camada, branchPrincipal: 'main' };
};

// ── ticket, Jira simulado e serviços ──
let n = 0;
const novoTicket = (subtarefas) => {
  const chave = `SUB-${++n}`;
  tickets.gravar({
    idProvedor: chave,
    chave,
    provedor: 'jira',
    site: 'https://x',
    link: `https://x/${chave}`,
    titulo: 'Reserva de estoque',
    tipo: 'Story',
    status: '',
    conversas: [],
    subtarefas
  });
  return { ...tickets.ler(chave), id: chave };
};
const jiraDe = (t) => ({
  key: t.chave,
  tipo: 'Story',
  resumo: t.titulo,
  descricao: '<p>Reservar estoque ao separar o pedido e liberar ao cancelar, com tela no coletor.</p>',
  comentarios: [],
  anexos: [],
  subtarefas: t.subtarefas
});
const servicos = (t, repos) => ({
  pastaAba: (id) => tickets.pasta(id, 'impl'),
  pasta: (id) => tickets.pasta(id),
  render: () => {},
  ticketAberto: () => t,
  reposDe: () => repos,
  cacheJira: { [t.id]: jiraDe(t) }
});
T.deps.subtarefas = async (s, t) =>
  t.subtarefas.map((x) => ({ key: x.key, resumo: x.resumo, status: x.status, md: `Descrição de ${x.key}` }));
T.deps.cfg = () => /** @type {any} */ ({ get: (k) => ({ modelo: '', bancoConexao: '', bancoAmbiente: '' })[k] });
T.deps.comandos = () => [];
T.deps.executar = async () => ({ codigo: 0, saida: 'ok' });

// ── Claude simulado: cada etapa grava o seu arquivo num setImmediate; a 5 escreve um arquivo em cada repositório que recebeu ──
let plano = ''; // texto do plano-subtarefas.md que a etapa 0 grava
let segurar = null; // n da etapa que fica "rodando" (o Claude não termina): para testar o ⏸
let aoImplementar = (r, dir) => fs.writeFileSync(path.join(r, `feito-${path.basename(dir)}.txt`), 'x\n');
const prompt_ = [];
const reposDosExtras = (extras) => extras.filter((x) => fs.existsSync(path.join(x, '.git')));
const simTeste = require('./simular-teste');
simTeste.instalar();
maestro.rodar = /** @type {any} */ (
  (dir, opts) => {
    if (simTeste.simular(dir, opts)) return true; // etapa 7 (no pai): testes/simular-teste.js
    const num = Number(/Etapa (\d)/.exec(opts.titulo)[1]);
    prompt_.push({ n: num, dir, titulo: opts.titulo, prompt: opts.prompt, extras: opts.extras });
    if (num === segurar) return true; // segue "rodando" até o ⏸
    setImmediate(() => {
      if (num === 0) fs.writeFileSync(path.join(dir, prompts.ARQ[0]), plano);
      if (num === 5) for (const r of reposDosExtras(opts.extras)) aoImplementar(r, dir);
      const arq = prompts.ARQ[num];
      if (arq && !fs.existsSync(path.join(dir, arq)))
        fs.writeFileSync(
          path.join(dir, arq),
          num === 4 ? '# Plano\nRepositórios afetados: backend, mobile\n' : `# etapa ${num}\n`
        );
      opts.aoMudar();
    });
    return true;
  }
);

const esperar = async (cond, rotulo, ms = 15000) => {
  for (const fim = Date.now() + ms; Date.now() < fim; ) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error(`timeout: ${rotulo}`);
};
const fase = (dir) => T.estado(dir).fase;
// Aprova a etapa em que o pai ou o grupo está aguardando (abre o arquivo antes, como na tela).
const aprovar = async (s, key) => {
  const a = esteira.acoes(s),
    dir = key ? dirGrupo(s.pastaAba(s.ticketAberto().id), key) : s.pastaAba(s.ticketAberto().id);
  a.esteiraAbrir({ id: T.estado(dir).etapa, key });
  await a.esteiraAprovar({ key });
};

// Sem branch do ticket, o disparo pergunta antes de criar (uma pausa por repositório): aceita a sugestão.
const aceitarCriar = async (s) => {
  const t = s.ticketAberto(),
    dir = s.pastaAba(t.id);
  while (T.estado(dir).pausa?.motivo === 'criar') await T.responder(s, t, T.estado(dir).pausa.opcoes[0]);
};

// Grupo até o portão da etapa 4 (a 2 também pede aprovação quando a prontidão não é alta, como no ticket simples).
const ateQuatro = async (s, key, dir) => {
  for (;;) {
    await esperar(() => fase(dir) === 'aguardando', `portão do ${key}`);
    if (T.estado(dir).etapa === 4) return;
    await aprovar(s, key);
  }
};

const PLANO_SEQ = (k) => `# Plano das subtarefas · ${k}
Execução: sequencia

## G1 · Reserva no backend
- Subtarefas: ${k}-1, ${k}-2
- Camadas: backend
- Arquivos: src/Reserva.cs
- Depende de: nenhum
- Por que: mesmo serviço

## G2 · Tela do coletor
- Subtarefas: ${k}-3
- Camadas: backend
- Arquivos: src/Tela.cs
- Depende de: G1
- Por que: usa o endpoint do G1

## Ordem
G1 e depois G2.

## Já feito
${k}-4 na branch feature/${k}-4.
`;
const subs = (k) => [
  { key: `${k}-1`, resumo: 'Endpoint de reserva', status: 'A fazer', tipo: 'Subtarefa' },
  { key: `${k}-2`, resumo: 'Liberar ao cancelar', status: 'Em andamento', tipo: 'Subtarefa' },
  { key: `${k}-3`, resumo: 'Tela do coletor', status: 'A fazer', tipo: 'Subtarefa' },
  { key: `${k}-4`, resumo: 'Tabela de reserva', status: 'Concluído', tipo: 'Subtarefa' },
  { key: `${k}-5`, resumo: '[QA] Testes da reserva', status: 'A fazer', tipo: 'Subtarefa' },
  { key: `${k}-6`, resumo: 'Ideia descartada', status: 'Cancelado', tipo: 'Subtarefa' }
];

(async () => {
  // ═══ 1. Regras puras: filtro, leitura e validação do plano ═══
  {
    const sep = separar(subs('X'));
    assert.deepStrictEqual([sep.abertas.length, sep.concluidas.length, sep.fora.length], [3, 1, 2]);
    assert.strictEqual(situacaoSub({ status: 'Pronto para desenvolver' }), 'aberta');
    assert.strictEqual(situacaoSub({ status: 'Done' }), 'concluida');
    assert.strictEqual(situacaoSub({ status: 'A fazer', tipo: 'QA' }), 'fora');
    const p = lerPlanoMd(PLANO_SEQ('X'));
    assert.strictEqual(p.execucao, 'sequencia');
    assert.deepStrictEqual(
      p.grupos.map((g) => [g.id, g.subtarefas, g.dependeDe]),
      [
        ['G1', ['X-1', 'X-2'], []],
        ['G2', ['X-3'], ['G1']]
      ]
    );
    const ab = ['X-1', 'X-2', 'X-3'];
    assert.deepStrictEqual(validarPlano(p, ab, ['X-4']), []);
    const erro = (txt) => validarPlano(lerPlanoMd(txt), ab, ['X-4']).join(' | ');
    assert.ok(/máximo é 2/.test(erro(PLANO_SEQ('X') + '\n## G3 · Mais\n- Subtarefas: X-3\n')));
    assert.ok(
      /fora de todos os grupos: X-3/.test(erro(PLANO_SEQ('X').replace('- Subtarefas: X-3', '- Subtarefas: X-4')))
    );
    assert.ok(/já está concluída/.test(erro(PLANO_SEQ('X').replace('X-1, X-2', 'X-1, X-2, X-4'))));
    assert.ok(
      /precisa de "Depende de: G1"/.test(erro(PLANO_SEQ('X').replace('- Depende de: G1', '- Depende de: nenhum')))
    );
    const par = PLANO_SEQ('X').replace('sequencia', 'paralelo').replace('- Depende de: G1', '- Depende de: nenhum');
    assert.deepStrictEqual(validarPlano(lerPlanoMd(par), ab, []), []);
    assert.ok(/arquivo nos dois grupos/.test(erro(par.replace('src/Tela.cs', 'src/Reserva.cs'))));
  }

  // ═══ 2. Bases para criar a branch do ticket (base-branch.js): trabalho já feito, pai, avô, principal ═══
  {
    const r = criarRepo('base', 'backend');
    const d = (branches) => ({ trabalho: [{ caminho: r.caminho, branches }] });
    const b1 = { nome: 'B-1-antiga', local: true, adiante: 2, commits: [{}] };
    const b2 = { nome: 'feature/B-1-tela', local: false, remoto: true, adiante: 1, commits: [{}] };
    assert.deepStrictEqual(basesDe(r, 'story/B-1', d([])), {
      sugerida: 'origin/main',
      principal: 'origin/main',
      outras: []
    });
    assert.deepStrictEqual(basesDe(r, 'story/B-1', d([b1, b2])), {
      sugerida: 'B-1-antiga',
      principal: 'origin/main',
      outras: ['origin/feature/B-1-tela']
    });
    assert.strictEqual(basesDe(r, 'story/B-1', d([{ ...b1, adiante: 0, commits: [] }])).sugerida, 'origin/main'); // já integrada
    gitX(r.caminho, 'branch', 'story/PAI-1');
    gitX(r.caminho, 'push', '-q', 'origin', 'main:refs/heads/feature/AVO-1');
    gitX(r.caminho, 'fetch', '-q', 'origin');
    assert.deepStrictEqual(basesDe(r, 'story/B-1', d([]), { pai: 'PAI-1', avo: 'AVO-1' }), {
      sugerida: 'story/PAI-1',
      principal: 'origin/main',
      outras: ['origin/feature/AVO-1']
    });
  }

  // ═══ 3. Sequência: etapa 0 → portão → G1 (1 → 7) → G2 (1 → 7) → resumo do pai; branch parte da concluída ═══
  {
    const repo = criarRepo('seq', 'backend');
    const t0 = novoTicket([]),
      k = t0.chave;
    // a subtarefa concluída tem código numa branch dela: a branch do ticket deve partir dela
    gitX(repo.caminho, 'checkout', '-q', '-b', `feature/${k}-4`);
    fs.writeFileSync(path.join(repo.caminho, 'tabela.sql'), 'create table reserva;\n');
    gitX(repo.caminho, 'add', '.');
    gitX(repo.caminho, '-c', 'user.email=t@t', 'commit', '-q', '-m', `${k}-4 tabela de reserva`);
    gitX(repo.caminho, 'checkout', '-q', 'main');
    tickets.gravar({ ...tickets.ler(k), subtarefas: subs(k) });
    const t = { ...tickets.ler(k), id: k },
      s = servicos(t, [repo]),
      DIR = s.pastaAba(t.id);
    // selo antes de começar: 4 contam (QA e cancelada ficam fora)
    assert.ok(implementacoes.selos(t).includes('4 subtarefas'));
    // aba Esteira antes de começar avisa da etapa 0; aba Dossiê lista as subtarefas
    assert.ok(esteira.corpo(t, {}, DIR).includes('Etapa 0 · Subtarefas'));
    assert.ok(esteira.corpoDossie(t, {}, DIR).includes('Plano ainda não gerado'));

    plano = PLANO_SEQ(k);
    await T.seguir(s, t);
    await esperar(() => fase(DIR) === 'aguardando', 'portão da etapa 0');
    let e = T.estado(DIR);
    assert.deepStrictEqual([e.etapa, e.subtarefas], [0, 'sim']);
    assert.deepStrictEqual(
      prompt_.map((p) => p.n),
      [0]
    );
    assert.ok(
      prompt_[0].prompt.includes('ETAPA 0 · PLANO DAS SUBTAREFAS') && prompt_[0].prompt.includes('NO MÁXIMO 2 grupos')
    );
    const sj = lerSubs(DIR);
    assert.deepStrictEqual(
      sj.map((x) => [x.key, x.situacao, x.grupo || '']),
      [
        [`${k}-1`, 'aberta', 'G1'],
        [`${k}-2`, 'aberta', 'G1'],
        [`${k}-3`, 'aberta', 'G2'],
        [`${k}-4`, 'concluida', ''],
        [`${k}-5`, 'fora', ''],
        [`${k}-6`, 'fora', '']
      ]
    );
    assert.strictEqual(sj[3].branch, `feature/${k}-4`); // a concluída tem a branch achada
    assert.ok(fs.readFileSync(path.join(DIR, 'subtarefas', `${k}-1.md`), 'utf8').includes(`Descrição de ${k}-1`));
    assert.strictEqual(lerPlano(DIR).execucao, 'sequencia');
    assert.ok(esteira.corpo(t, {}, DIR).includes('Revise a etapa 0'));
    assert.ok(esteira.corpoDossie(t, {}, DIR).includes('Reserva no backend'));
    assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main'); // nada de branch antes do portão

    await aprovar(s);
    // sem branch do ticket: pergunta antes de criar, com a branch da concluída como base sugerida
    assert.deepStrictEqual(
      [T.estado(DIR).pausa.motivo, T.estado(DIR).pausa.nome, T.estado(DIR).pausa.sugerida],
      ['criar', `story/${k}`, `feature/${k}-4`]
    );
    await aceitarCriar(s);
    const G1 = dirGrupo(DIR, 'G1'),
      G2 = dirGrupo(DIR, 'G2');
    // branch única, a partir da concluída
    assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), `story/${k}`);
    assert.ok(fs.existsSync(path.join(repo.caminho, 'tabela.sql')));
    await ateQuatro(s, 'G1', G1);
    assert.strictEqual(T.estado(G2).iniciado, undefined); // G2 espera o G1
    const pG1 = prompt_.filter((p) => p.dir === G1);
    assert.deepStrictEqual(
      pG1.map((p) => p.n),
      [2, 3, 4]
    );
    assert.ok(!prompt_.some((p) => p.dir === G2)); // G2 não começou
    assert.ok(
      pG1[0].prompt.includes(`GRUPO G1 DAS SUBTAREFAS (${k}-1, ${k}-2)`) &&
        pG1[0].prompt.includes('Branch única do ticket')
    );
    assert.ok(fs.readFileSync(path.join(G1, '.contexto-grupo.md'), 'utf8').includes(`Descrição de ${k}-2`));
    assert.ok(esteira.corpo(t, {}, DIR).includes('G1 · Revise a etapa 4'));
    assert.ok(implementacoes.selos(t).includes('1/4 subtarefas')); // só a concluída antes

    await aprovar(s, 'G1');
    await ateQuatro(s, 'G2', G2);
    assert.strictEqual(fase(G1), 'concluido');
    assert.ok(implementacoes.selos(t).includes('3/4 subtarefas'));
    await aprovar(s, 'G2');
    await esperar(() => fase(DIR) === 'concluido', 'pai concluído');
    const resumo = fs.readFileSync(path.join(DIR, 'implementacao.md'), 'utf8');
    assert.ok(resumo.includes('## G1 · Reserva no backend') && resumo.includes('## G2 · Tela do coletor'));
    assert.ok(
      fs.existsSync(path.join(repo.caminho, 'feito-G1.txt')) && fs.existsSync(path.join(repo.caminho, 'feito-G2.txt'))
    );
    assert.strictEqual(gitX(repo.caminho, 'log', '--oneline', `main..story/${k}`).split('\n').length, 1); // só o commit da concluída; a esteira não commita
    assert.ok(implementacoes.selos(t).includes('4/4 subtarefas'));
    assert.strictEqual(require('../../../infra/ticket/situacao').situacaoDe(t, 'impl').texto, 'Concluído');
  }

  // ═══ 4. Paralelo: G1 (backend) e G2 (mobile, worktree) ao mesmo tempo; integração e verificação final ═══
  {
    const back = criarRepo('back', 'backend'),
      mob = criarRepo('mob', 'mobile');
    const t0 = novoTicket([]),
      k = t0.chave;
    tickets.gravar({ ...tickets.ler(k), subtarefas: subs(k).slice(0, 3) });
    const t = { ...tickets.ler(k), id: k },
      s = servicos(t, [back, mob]),
      DIR = s.pastaAba(t.id);
    plano = PLANO_SEQ(k)
      .replace('sequencia', 'paralelo')
      .replace('- Depende de: G1', '- Depende de: nenhum')
      .replace(
        '## G2 · Tela do coletor\n- Subtarefas: ' + k + '-3\n- Camadas: backend',
        '## G2 · Tela do coletor\n- Subtarefas: ' + k + '-3\n- Camadas: mobile'
      )
      .replace(/## Já feito[\s\S]*$/, '');
    let finais = 0;
    T.deps.comandos = () => [{ id: 'c1', nome: 'Testes', comando: 'x test', pasta: back.caminho }];
    T.deps.executar = async (cmd, cwd, dir) => {
      if (dir === DIR) finais++;
      return { codigo: 0, saida: 'ok' };
    };
    await T.seguir(s, t);
    await esperar(() => fase(DIR) === 'aguardando', 'portão da etapa 0 (paralelo)');
    await aprovar(s);
    await aceitarCriar(s);
    const G1 = dirGrupo(DIR, 'G1'),
      G2 = dirGrupo(DIR, 'G2');
    const wt = worktree.caminho(k, 'G2', mob);
    assert.ok(fs.existsSync(path.join(wt, '.git'))); // worktree destacado do G2
    assert.ok(!wt.includes(`${path.sep}.claude${path.sep}`)); // fora de ~/.claude
    assert.strictEqual(gitX(mob.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), `story/${k}`); // o mesmo nome nos dois repositórios
    assert.strictEqual(gitX(wt, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD'); // destacado: nenhuma branch nova
    // os dois ao mesmo tempo
    await esperar(() => fase(G1) === 'aguardando' && fase(G2) === 'aguardando', 'os dois grupos no primeiro portão');
    await Promise.all([ateQuatro(s, 'G1', G1), ateQuatro(s, 'G2', G2)]);
    const pG2 = prompt_.filter((p) => p.dir === G2);
    assert.ok(
      pG2[0].extras.includes(wt) && !pG2[0].extras.includes(mob.caminho) && !pG2[0].extras.includes(back.caminho)
    );
    assert.ok(fs.readFileSync(path.join(G2, '.contexto-grupo.md'), 'utf8').includes('POR OUTRO AGENTE AO MESMO TEMPO'));
    await aprovar(s, 'G2');
    await esperar(() => fase(G2) === 'concluido', 'G2 concluído');
    assert.ok(fs.existsSync(path.join(wt, 'feito-G2.txt')) && !fs.existsSync(path.join(mob.caminho, 'feito-G2.txt'))); // ainda no worktree
    assert.strictEqual(fase(DIR), 'grupos'); // espera o G1
    await aprovar(s, 'G1');
    await esperar(() => fase(DIR) === 'concluido', 'pai concluído (paralelo)');
    assert.ok(fs.existsSync(path.join(mob.caminho, 'feito-G2.txt'))); // integrado na checkout
    assert.ok(fs.existsSync(path.join(back.caminho, 'feito-G1.txt')));
    assert.ok(!fs.existsSync(wt)); // worktree removido
    assert.strictEqual(gitX(mob.caminho, 'worktree', 'list').split('\n').length, 1);
    assert.strictEqual(finais, 1); // verificação final com tudo junto
    assert.ok(JSON.parse(fs.readFileSync(path.join(DIR, 'verificacao.json'), 'utf8')).final);
    assert.ok(
      JSON.parse(fs.readFileSync(path.join(G2, 'verificacao.json'), 'utf8')).pendencias[0].includes('worktree')
    );
    T.deps.comandos = () => [];
  }

  // ═══ 5. Plano inválido: volta uma vez ao Claude com os erros; continua inválido → erro ═══
  {
    const repo = criarRepo('inv', 'backend');
    const t0 = novoTicket([]),
      k = t0.chave;
    tickets.gravar({ ...tickets.ler(k), subtarefas: subs(k).slice(0, 3) });
    const t = { ...tickets.ler(k), id: k },
      s = servicos(t, [repo]),
      DIR = s.pastaAba(t.id);
    plano = `# Plano\nExecução: unico\n\n## G1 · Tudo\n- Subtarefas: ${k}-1\n`;
    const antes = prompt_.length;
    await T.seguir(s, t);
    await esperar(() => fase(DIR) === 'erro', 'plano inválido duas vezes');
    const p0 = prompt_.slice(antes);
    assert.deepStrictEqual(
      p0.map((p) => [p.n, /ajuste/.test(p.titulo)]),
      [
        [0, false],
        [0, true]
      ]
    );
    assert.ok(
      fs.readFileSync(path.join(DIR, '.respostas.md'), 'utf8').includes(`fora de todos os grupos: ${k}-2, ${k}-3`)
    );
    // agora o Claude acerta: ▶ refaz a etapa 0 e para no portão
    plano = `# Plano\nExecução: unico\n\n## G1 · Tudo\n- Subtarefas: ${k}-1, ${k}-2, ${k}-3\n- Camadas: backend\n`;
    await T.seguir(s, t);
    await esperar(() => fase(DIR) === 'aguardando', 'plano corrigido');
  }

  // ═══ 6. Ticket sem subtarefa aberta segue como hoje (etapa 1, sem etapa 0) ═══
  {
    const repo = criarRepo('simples', 'backend');
    const t0 = novoTicket([{ key: 'Z-1', resumo: '[QA] testes', status: 'A fazer', tipo: 'Subtarefa' }]),
      t = { ...t0 },
      s = servicos(t, [repo]),
      DIR = s.pastaAba(t.id);
    const antes = prompt_.length;
    await T.seguir(s, t);
    await esperar(() => prompt_.length > antes, 'etapa 2 do ticket simples');
    assert.strictEqual(prompt_[antes].n, 2);
    assert.strictEqual(T.estado(DIR).subtarefas, 'nao');
    assert.strictEqual(implementacoes.selos(t), ''); // só QA: sem selo
  }

  // ═══ 7. Paralelo no mesmo repositório: ⏸ para os dois grupos, ▶ retoma; conflito na integração pausa o pai ═══
  {
    const repo = criarRepo('conf', 'backend');
    const t0 = novoTicket([]),
      k = t0.chave;
    tickets.gravar({ ...tickets.ler(k), subtarefas: subs(k).slice(0, 3) });
    const t = { ...tickets.ler(k), id: k },
      s = servicos(t, [repo]),
      DIR = s.pastaAba(t.id),
      a = esteira.acoes(s);
    plano = PLANO_SEQ(k).replace('sequencia', 'paralelo').replace('- Depende de: G1', '- Depende de: nenhum');
    await T.seguir(s, t);
    await esperar(() => fase(DIR) === 'aguardando', 'portão da etapa 0 (conflito)');
    segurar = 3;
    await aprovar(s);
    await aceitarCriar(s);
    const G1 = dirGrupo(DIR, 'G1'),
      G2 = dirGrupo(DIR, 'G2'),
      wt = worktree.caminho(k, 'G2', repo);
    for (const g of [
      ['G1', G1],
      ['G2', G2]
    ])
      for (;;) {
        await esperar(
          () => (T.estado(g[1]).etapa === 3 && fase(g[1]) === 'rodando') || fase(g[1]) === 'aguardando',
          `${g[0]} na etapa 3`
        );
        if (fase(g[1]) !== 'aguardando') break;
        await aprovar(s, g[0]);
      }
    assert.ok(T.situacao(DIR).rodando);
    a.esteiraPausar();
    assert.deepStrictEqual(
      [G1, G2].map((d) => [fase(d), T.estado(d).pausa?.motivo]),
      [
        ['pausado', 'manual'],
        ['pausado', 'manual']
      ]
    );
    assert.strictEqual(fase(DIR), 'pausado');
    segurar = null;
    // os dois mudam o mesmo trecho do a.txt: o worktree não aplica
    aoImplementar = (r, dir) => fs.writeFileSync(path.join(r, 'a.txt'), `mudado pelo ${path.basename(dir)}\n`);
    await a.esteiraRetomar();
    await ateQuatro(s, 'G1', G1);
    await ateQuatro(s, 'G2', G2);
    await aprovar(s, 'G1');
    await aprovar(s, 'G2');
    await esperar(() => fase(DIR) === 'pausado', 'conflito na integração');
    const p = T.estado(DIR).pausa;
    assert.strictEqual(p.motivo, 'integrar');
    assert.ok(fs.existsSync(`${wt}.patch`) && fs.existsSync(wt)); // nada se perde
    assert.ok(esteira.corpo(t, {}, DIR).includes('Já integrei à mão'));
    await a.esteiraResponder({ op: String(p.opcoes.indexOf('Já integrei à mão (remover o worktree)')) });
    await esperar(() => fase(DIR) === 'concluido', 'pai concluído depois da integração à mão');
    assert.ok(!fs.existsSync(wt));
    assert.strictEqual(fs.readFileSync(path.join(repo.caminho, 'a.txt'), 'utf8'), 'mudado pelo G1\n');
  }

  // ═══ 8. Tipo do ticket não reconhecido: a branch não tem nome; a esteira pausa, a resposta vira a categoria e o nome sai dela ═══
  {
    const repo = criarRepo('tipo', 'backend');
    const t0 = novoTicket([]),
      k = t0.chave;
    tickets.gravar({ ...tickets.ler(k), tipo: 'Coisa estranha', subtarefas: subs(k).slice(0, 1) });
    const t = { ...tickets.ler(k), id: k },
      s = servicos(t, [repo]),
      DIR = s.pastaAba(t.id);
    plano = `# Plano\nExecução: unico\n\n## G1 · Tudo\n- Subtarefas: ${k}-1\n- Camadas: backend\n`;
    await T.seguir(s, t);
    await esperar(() => fase(DIR) === 'aguardando', 'portão da etapa 0 (tipo)');
    assert.ok(esteira.corpo(t, {}, DIR).includes(`&#60;prefixo&#62;/${k}`));
    await aprovar(s);
    const p = T.estado(DIR).pausa;
    assert.strictEqual(p.motivo, 'tipo');
    assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main'); // sem nome, nenhuma branch
    await esteira.acoes(s).esteiraResponder({ op: String(p.opcoes.indexOf('hotfix (incidente)')) });
    assert.strictEqual(tickets.ler(k).categoria, 'incidente');
    assert.strictEqual(T.estado(DIR).pausa.nome, `hotfix/${k}`);
    await aceitarCriar(s);
    assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), `hotfix/${k}`);
  }

  console.log('ok');
  setTimeout(() => process.exit(0), 100);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
