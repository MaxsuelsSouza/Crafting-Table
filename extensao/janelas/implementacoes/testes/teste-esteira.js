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
  const num = /Reprodução/.test(opts.titulo) ? 'R' : Number(/Etapa (\d)/.exec(opts.titulo)[1]);
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
    await esperar(fase('concluido'));
    e = T.estado(DIR);
    assert.deepStrictEqual([e.etapa, e.tentativas, e.correcao], [7, 0, false]);
    const nomeRamo = 'feature/' + t.chave; // Story → feature
    assert.strictEqual(gitX(repo.caminho, 'rev-parse', '--abbrev-ref', 'HEAD'), nomeRamo);
    assert.ok(fs.existsSync(path.join(repo.caminho, 'novo.txt')));
    assert.strictEqual(gitX(repo.caminho, 'log', '--oneline').split('\n').length, 1); // nenhum commit da esteira
    const ns = prompt_.map((p) => p.n);
    assert.deepStrictEqual(ns, [2, 3, 4, 5, 5, 7]); // 5 rodou duas vezes: implementação e correção
    assert.ok(prompt_[3].ferramentas.includes('Edit') && prompt_[3].extras.includes(repo.caminho));
    assert.ok(
      !prompt_[3].prompt.includes('CORREÇÃO') &&
        prompt_[4].prompt.includes('ESTA É UMA CORREÇÃO') &&
        prompt_[4].prompt.includes('Cancelar_Nota')
    );
    assert.ok(prompt_[5].prompt.includes('novo.txt')); // o resumo recebe o que mudou no repositório
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
    await esperar(fase('concluido'));
    assert.deepStrictEqual(salvos, [[repo.caminho, 'main']]);
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
    await esperar(fase('pausado'));
    assert.deepStrictEqual(
      [T.estado(DIR).pausa.motivo, T.estado(DIR).tentativas, prompt_.filter((p) => p.n === 5).length],
      ['verificacao', 2, 3]
    );
    assert.ok(esteira.corpo(t, {}, DIR).includes('Seguir para o resumo assim mesmo'));
    await T.responder(s, t, T.RESUMIR);
    await esperar(fase('concluido'));
    assert.ok(prompt_.at(-1).n === 7);
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
      'esteiraAjuste',
      'esteiraAprovar',
      'esteiraDossieDe',
      'esteiraIniciar',
      'esteiraObs',
      'esteiraPausar',
      'esteiraResponder',
      'esteiraRetomar'
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
  // uma branch por ticket, <tipo>/<CHAVE>, sem slug (CLAUDE.md, "Branch de trabalho")
  assert.strictEqual(
    T.ramo({ chave: 'WMS-12', titulo: 'Cálculo de Média/Saída — Ação!', tipo: 'História' }),
    'feature/WMS-12'
  );
  assert.strictEqual(T.ramo({ chave: 'WMS-13', tipo: 'Task' }), 'feature/WMS-13');
  assert.strictEqual(T.ramo({ chave: 'WMS-14', tipo: 'Bug' }), 'bugfix/WMS-14');
  assert.strictEqual(T.ramo({ chave: 'WMS-15', tipo: 'Bug Experimental' }), 'bugfix/WMS-15');
  assert.strictEqual(T.ramo({ chave: 'WMS-16', tipo: 'Incidente' }), 'hotfix/WMS-16');
  assert.strictEqual(
    T.ramo({ chave: 'WMS-17', tipo: 'Coisa', categoria: 'bug', categoriaOrigem: 'usuario' }),
    'bugfix/WMS-17'
  ); // escolha do usuário
  assert.strictEqual(T.ramo({ chave: 'DOC-001', documento: { nome: 'Requisitos_v2.md' } }), null); // tipo desconhecido: a esteira pergunta
  const etapas = require('../../../infra/agentes/etapas');
  assert.ok(etapas.VAGAS['impl.mapa'] && etapas.MODULOS.find((m) => m.id === 'impl').etapas.length === 7);
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

  // ═══ 12. Ticket do tipo Bug: a Reprodução vem antes do Entendimento; falhou + evidência confirma, sem isso pausa ═══
  {
    const fluxo = require('../../../componentes/fluxo-passos'),
      reproducao = require('../etapas/01-dossie/reproducao');
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
    const novo = () => {
      const repo = criarRepo('backend', 'backend'),
        t = novoTicket({ titulo: 'Erro ao cancelar nota' }),
        s = servicos(t, [repo]);
      s.cacheJira[t.id] = { ...jira, key: t.chave };
      DIR = s.pastaAba(t.id);
      return { t, s };
    };
    const plano = (dir) => {
      fluxo.plano(dir, [
        { titulo: 'Abrir a nota', texto: 'abre' },
        { titulo: 'Cancelar a nota', texto: 'erro 500' }
      ]);
    };
    const rodar = (dir, id, status, comPrint) => {
      fluxo.iniciar(dir, id);
      if (comPrint) {
        const f = path.join(dir, 'p.png');
        fs.writeFileSync(f, 'x');
        fluxo.evidencia(dir, id, [f]);
      }
      fluxo.concluir(dir, id, status, 'visto');
    };

    // a) confirmado com evidência: segue sozinha até o portão do Entendimento
    {
      prompt_.length = 0;
      const { t, s } = novo();
      roteiro = {
        R: (dir) => {
          plano(dir);
          rodar(dir, 'P01', 'passou');
          rodar(dir, 'P02', 'falhou', true);
        }
      };
      await T.seguir(s, t);
      await esperar(fase('aguardando'));
      assert.deepStrictEqual(
        prompt_.map((p) => p.n),
        ['R', 2]
      ); // sem spec a prontidão não é alta: o Entendimento para no portão
      assert.strictEqual(T.estado(DIR).etapa, 2);
      assert.strictEqual(T.estado(DIR).reproducao, 'ok');
      const md = fs.readFileSync(path.join(DIR, 'reproducao.md'), 'utf8');
      assert.ok(
        md.includes('Erro confirmado') &&
          md.includes('P02') &&
          md.includes('evidência: evidencias/P02/') &&
          md.includes('PAI-1-erro.png'),
        md
      );
      assert.ok(
        fs.existsSync(path.join(DIR, 'evidencias-ticket', 'PAI-1-erro.png')) &&
          !fs.existsSync(path.join(DIR, 'evidencias-ticket', 'planilha.xlsx'))
      );
      assert.ok(
        prompt_[0].prompt.includes('REPRODUÇÃO DO BUG') &&
          prompt_[0].prompt.includes('PAI-1-erro.png') &&
          prompt_[0].ferramentas.includes(`Bash(${reproducao.BIN}:*)`)
      );
      assert.ok(!prompt_[0].ferramentas.includes('Edit') && !prompt_[0].ferramentas.includes('Write')); // não altera código
      assert.ok(
        dossie.lerGravado(DIR).exigeReproducao &&
          fs.readFileSync(path.join(DIR, 'dossie.md'), 'utf8').includes('exige a etapa de Reprodução')
      );
      const html = reproducao.corpo(t, { jira: s.cacheJira[t.id], uri: (f) => 'vsc://' + f }, DIR);
      assert.ok(html.includes('Erro confirmado') && html.includes('data-cen="P02"') && html.includes('PAI-1-erro.png'));
    }
    // b) nada falhou: pausa; "Tentar de novo" replaneja; "Seguir sem confirmar" libera o Entendimento
    {
      prompt_.length = 0;
      const { t, s } = novo();
      let vez = 0;
      roteiro = {
        R: (dir) => {
          plano(dir);
          rodar(dir, 'P01', 'passou');
          rodar(dir, 'P02', ++vez === 1 ? 'passou' : 'bloqueado');
        }
      };
      await T.seguir(s, t);
      await esperar(fase('pausado'));
      assert.strictEqual(T.estado(DIR).pausa.motivo, 'repro-nao');
      assert.deepStrictEqual(T.estado(DIR).pausa.opcoes, [T.TENTAR, T.SEM_CONFIRMAR]);
      await T.responder(s, t, T.TENTAR);
      await esperar(fase('pausado'));
      assert.strictEqual(vez, 2);
      assert.ok(fs.readdirSync(DIR).some((n) => /^fluxo\..+\.json$/.test(n))); // o fluxo anterior fica guardado
      await T.responder(s, t, T.SEM_CONFIRMAR);
      await esperar(fase('aguardando'));
      assert.strictEqual(T.estado(DIR).reproducao, 'aceita');
      assert.deepStrictEqual(
        prompt_.map((p) => p.n),
        ['R', 'R', 2]
      );
      assert.ok(fs.readFileSync(path.join(DIR, 'reproducao.md'), 'utf8').includes('Erro não confirmado'));
    }
    // c) falhou sem evidência anexada: a evidência é obrigatória
    {
      prompt_.length = 0;
      const { t, s } = novo();
      roteiro = {
        R: (dir) => {
          plano(dir);
          rodar(dir, 'P01', 'passou');
          rodar(dir, 'P02', 'falhou', false);
        }
      };
      await T.seguir(s, t);
      await esperar(fase('pausado'));
      const p = T.estado(DIR).pausa;
      assert.strictEqual(p.motivo, 'repro-evidencia');
      assert.ok(p.pergunta.includes('P02'));
    }
    // d) o Claude terminou sem registrar cenário: erro, não avança
    {
      prompt_.length = 0;
      const { t, s } = novo();
      roteiro = { R: () => {} };
      await T.seguir(s, t);
      await esperar(fase('erro'));
      assert.deepStrictEqual(
        prompt_.map((p) => p.n),
        ['R']
      );
    }
    // e) ticket que não é bug: sem Reprodução e a aba explica
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
