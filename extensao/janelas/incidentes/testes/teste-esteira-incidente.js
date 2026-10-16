// @ts-check
// node janelas/incidentes/testes/teste-esteira-incidente.js — esteira do Incidente (Mergulho) ponta a ponta nas etapas 1 a 4 com o Claude simulado
// (maestro.rodar trocado), rede bloqueada e HOME temporário; etapa 5 pelas dependências injetadas; bins e git reais em pastas temporárias.
// O que NÃO é provado aqui: emulador, adb/maestro, SQLcl e o Claude de verdade (só o contrato com a extensão).
const assert = require('assert');
const fs = require('fs'),
  os = require('os'),
  path = require('path');
const { execFileSync, spawnSync } = require('child_process');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'esteira-inc-home-'));
const Module = /** @type {any} */ (require('module')),
  carregar = Module._load;
const abertos = [];
const vsc = {
  window: {
    showInformationMessage: async () => 'Aprovar',
    showWarningMessage: async () => undefined,
    showInputBox: async () => 'use outro registro',
    showErrorMessage: async () => undefined
  },
  commands: {
    executeCommand: async (...a) => {
      abertos.push(a[0]);
    }
  },
  Uri: { file: (p) => ({ fsPath: p }) },
  ViewColumn: { Beside: 2 },
  env: { openExternal: async () => true, clipboard: { writeText: async () => {} } },
  workspace: { getConfiguration: () => ({ get: (_k, d) => d, inspect: () => undefined, update: async () => {} }) }
};
Module._load = (r, ...a) => (r === 'vscode' ? vsc : carregar(r, ...a));
const rede = [];
for (const m of ['http', 'https'])
  require(m).request = /** @type {any} */ (
    (...a) => {
      rede.push(a[0]);
      throw new Error('REDE proibida');
    }
  );
globalThis.fetch = /** @type {any} */ (
  () => {
    rede.push('fetch');
    throw new Error('REDE proibida');
  }
);

const tickets = require('../../../infra/ticket/tickets'),
  maestro = require('../../../infra/agentes/maestro');
const mg = require('../abas/mergulho'),
  rep = require('../etapas/05-reproducao'),
  fluxo = require('../../../componentes/fluxo-passos'),
  entrada = require('../entrada');
const { sincronizarRepos } = require('../etapas/03-dados-logs');
const { estado, mudar } = require('../estado'),
  { ETAPAS } = require('../etapas');

// ── Claude simulado ──
/** @type {{ n: number, prompt: string, ferramentas: string[], env: any, extras: string[] }[]} */ const chamadas = [];
/** @type {Record<number, (dir: string) => void | 'nada'>} */ let roteiro = {};
maestro.rodar = /** @type {any} */ (
  (dir, o) => {
    const n = Number(/Etapa (\d)/.exec(o.titulo)[1]);
    chamadas.push({ n, prompt: o.prompt, ferramentas: o.ferramentas, env: o.env, extras: o.extras });
    setImmediate(() => {
      const r = roteiro[n]?.(dir);
      const arq = path.join(dir, ETAPAS[n - 1].arq);
      if (r !== 'nada' && !fs.existsSync(arq) && !fs.existsSync(path.join(dir, '.pausa.json')))
        fs.writeFileSync(arq, `# etapa ${n}\n## Origem das afirmações\n- ticket (bruto)\n`);
      if (n === 3 && r !== 'nada' && !roteiro[3])
        fs.writeFileSync(path.join(dir, 'massa-real.sql'), 'select * from tarefa where id_tarefa = 987654;');
      o.aoMudar();
    });
    return true;
  }
);
const esperar = async (cond, ms = 6000) => {
  for (const fim = Date.now() + ms; Date.now() < fim; ) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error('timeout');
};

const aoVivo = require('../../../componentes/ao-vivo'),
  anotadas = []; // o Ao vivo grava em fila lenta: o teste intercepta o que foi anotado
const anotarOrig = aoVivo.anotar;
aoVivo.anotar = (d, l) => {
  anotadas.push(String(l.texto));
  return anotarOrig(d, l);
};
const vivoTem = async (_dir, txt) => esperar(() => anotadas.some((x) => x.includes(txt)));
let k = 0;
const DESC = 'Ao finalizar a tarefa de separação o app fecha sozinho e a tarefa fica pendente na base.';
const novo = (j) => {
  const chave = `INC-${++k}`;
  tickets.gravar({
    idProvedor: chave,
    chave,
    provedor: 'jira',
    site: 'https://x',
    link: `https://x/${chave}`,
    titulo: 'App fecha ao finalizar',
    status: '',
    conversas: []
  });
  const t = { ...tickets.ler(chave), id: chave },
    dir = tickets.pasta(chave, 'incidentes');
  const s = {
    pastaAba: () => dir,
    pasta: (id) => tickets.pasta(id || chave),
    render() {},
    ticketAberto: () => t,
    reposDe: () => [],
    cacheJira: { [chave]: j }
  };
  return { t, s, dir, a: mg.acoes(s) };
};
const reset = () => {
  chamadas.length = 0;
  roteiro = {};
};

(async () => {
  // ═══ F2: só o título vira pergunta, nunca invenção ═══
  {
    reset();
    const { t, s, dir, a } = novo({ key: 'x', descricao: '', comentarios: [], anexos: [] });
    await a.mergulhoIniciar({ texto: '' });
    assert.strictEqual(chamadas.length, 0, 'sem relato o Claude nem é chamado');
    let e = estado(dir);
    assert.deepStrictEqual([e.fase, e.pausa.motivo], ['pausado', 'briefing']);
    const ent = entrada.lerEntrada(dir);
    assert.deepStrictEqual([ent.modo, ent.prontidao], ['perguntar', 'baixa']);
    assert.ok(fs.existsSync(path.join(dir, 'entrada.md')) && /só o título/.test(ent.lacunas.join()));
    // a resposta vira a fonte verbal e a etapa 1 roda com ela; prontidão média: pede aprovação já na etapa 1
    await a.mergulhoResponder({ op: undefined, texto: 'O operador finaliza a tarefa 987654 e o app fecha.' });
    await esperar(() => estado(dir).fase === 'aguardando');
    e = estado(dir);
    assert.ok(e.obsPO.includes('987654') && e.etapa === 1);
    assert.ok(
      chamadas[0].prompt.includes('explicação do dev/PO') && chamadas[0].prompt.includes('Origem das afirmações')
    );
    assert.deepStrictEqual(
      [entrada.lerEntrada(dir).modo, entrada.lerEntrada(dir).exigeAprovacaoInicial],
      ['investigar', true]
    );
    assert.ok(t);
  }

  // ═══ F2 + F4: entrada boa → etapas 1 a 3 seguem sozinhas; a 4 sempre pede aprovação; segurança do pedido ═══
  {
    reset();
    const { dir, a } = novo({ key: 'x', descricao: DESC, comentarios: [], anexos: [] });
    await a.mergulhoIniciar({ texto: '' });
    await esperar(() => estado(dir).fase === 'aguardando');
    assert.strictEqual(estado(dir).etapa, 4);
    assert.deepStrictEqual(
      chamadas.map((c) => c.n),
      [1, 2, 3, 4]
    );
    assert.strictEqual(entrada.lerEntrada(dir).exigeAprovacaoInicial, false);
    for (const c of chamadas) {
      assert.ok(
        c.ferramentas.every((f) => f !== 'Bash' && f !== 'Write' && f !== 'Edit'),
        'sem Bash livre, Write nem Edit'
      );
      assert.ok(c.ferramentas.some((f) => f.startsWith('Bash(') && f.includes('mergulho-gravar')));
      assert.strictEqual(c.env.MERGULHO_DIR, dir);
      assert.ok(
        /commit, push, merge, rebase/.test(c.prompt) &&
          c.prompt.includes('Origem das afirmações') &&
          c.prompt.includes('entrada.md')
      );
    }
    assert.ok(fs.readFileSync(path.join(dir, 'entrada.md'), 'utf8').includes('Modo: **Investigar'));
    // aprovar a 4 abre a etapa 5 (aqui só confere que a extensão tentou reproduzir)
    let chamouRepro = false;
    const orig = rep.executar;
    rep.executar = async () => {
      chamouRepro = true;
    };
    await a.mergulhoAbrir({ id: 4 });
    await a.mergulhoAprovar();
    rep.executar = orig;
    assert.ok(chamouRepro && estado(dir).etapa === 5);
  }

  // ═══ F3: arquivo vazio não conta; massa real ausente sem pendência pausa; com pendência registrada segue ═══
  {
    reset();
    const { dir, a } = novo({ key: 'x', descricao: DESC, comentarios: [], anexos: [] });
    roteiro = {
      1: (d) => {
        fs.writeFileSync(path.join(d, ETAPAS[0].arq), '');
      }
    };
    await a.mergulhoIniciar({ texto: '' });
    await esperar(() => estado(dir).fase === 'erro');
    await vivoTem(dir, 'terminou sem gravar');

    reset();
    const b = novo({ key: 'x', descricao: DESC, comentarios: [], anexos: [] });
    roteiro = {
      3: (d) => {
        fs.writeFileSync(path.join(d, ETAPAS[2].arq), '# dados\nnada achado');
      }
    }; // sem massa-real.sql e sem pendência
    await b.a.mergulhoIniciar({ texto: '' });
    await esperar(() => estado(b.dir).fase === 'pausado');
    assert.deepStrictEqual([estado(b.dir).etapa, estado(b.dir).pausa.motivo], [3, 'massa']);
    assert.ok(estado(b.dir).pausa.opcoes.includes('Continuar sem a massa real'));
    roteiro = {};
    await b.a.mergulhoResponder({
      op: String(estado(b.dir).pausa.opcoes.indexOf('Continuar sem a massa real')),
      texto: ''
    });
    await esperar(() => estado(b.dir).fase === 'aguardando');
    assert.strictEqual(estado(b.dir).etapa, 4);

    reset();
    const c = novo({ key: 'x', descricao: DESC, comentarios: [], anexos: [] });
    roteiro = {
      3: (d) => {
        fs.writeFileSync(
          path.join(d, ETAPAS[2].arq),
          '# dados\n## Pendência: massa real\nNão achei no ticket nem no BKP.'
        );
      }
    };
    await c.a.mergulhoIniciar({ texto: '' });
    await esperar(() => estado(c.dir).fase === 'aguardando');
    assert.strictEqual(estado(c.dir).etapa, 4);
  }

  // ═══ F2: falha ao ler o ticket pausa, em vez de seguir com contexto velho ═══
  {
    reset();
    const { dir, a } = novo({ erro: 'timeout no Jira' });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.jira-contexto.md'), 'CONTEXTO VELHO');
    await a.mergulhoIniciar({ texto: '' });
    assert.strictEqual(chamadas.length, 0);
    assert.deepStrictEqual([estado(dir).fase, estado(dir).pausa.motivo], ['pausado', 'ticket']);
  }

  // ═══ F1: bins gravar/fluxo recusam nome fora do contrato e origem fora de /tmp ═══
  {
    const bin = path.join(__dirname, '..', 'bin', 'mergulho-gravar'),
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-bin-'));
    const run = (args, input = 'x') =>
      spawnSync('node', [bin, ...args], { env: { ...process.env, MERGULHO_DIR: dir }, input, encoding: 'utf8' });
    assert.strictEqual(run(['1-triagem.md']).status, 0);
    assert.ok(fs.existsSync(path.join(dir, '1-triagem.md')));
    for (const ruim of ['5-qualquer.md', '../fora.md', 'fluxo.json', 'evidencias/../x.png', '.mergulho.json'])
      assert.notStrictEqual(run([ruim]).status, 0, ruim);
    const png = path.join(os.tmpdir(), `mg-ok-${process.pid}.png`);
    fs.writeFileSync(png, 'png');
    assert.strictEqual(run(['evidencias/01-tela.png', '--de', png]).status, 0);
    assert.ok(fs.existsSync(path.join(dir, 'evidencias', '01-tela.png')));
    const alheio = '/etc/passwd'; // fora de /tmp e da pasta da aba
    assert.ok(fs.existsSync(alheio));
    const r = run(['evidencias/02-x.png', '--de', alheio]);
    assert.notStrictEqual(r.status, 0);
    assert.ok(/origem não permitida/.test(r.stderr) && !fs.existsSync(path.join(dir, 'evidencias', '02-x.png')));
    // fluxo.evidencia: mesma regra
    fluxo.plano(dir, [{ titulo: 'Abrir', texto: 'x' }]);
    fluxo.iniciar(dir, 'P01');
    assert.throws(() => fluxo.evidencia(dir, 'P01', [alheio]), /origem não permitida/);
    assert.strictEqual(fluxo.evidencia(dir, 'P01', [png]).length, 1);
    fs.rmSync(png);
  }

  // ═══ F1: ferramentas da etapa 5 por prefixo; travaDml; ambiente vazio ═══
  {
    const f = rep._teste.FERRAMENTAS('/m', '/sdk/adb');
    assert.ok(!f.includes('Bash') && !f.includes('Write') && !f.includes('Edit'));
    for (const x of ['Bash(adb:*)', 'Bash(maestro:*)', 'Bash(/m/bin/mapa-db:*)', 'Bash(/sdk/adb:*)'])
      assert.ok(f.includes(x), x);
    assert.ok(f.some((x) => x.includes('mergulho-fluxo')) && f.some((x) => x.includes('mergulho-gravar')));
    assert.ok(!f.some((x) => /^Bash\((git|curl|sqlcl|rm|sh|bash|node|dotnet|yarn|npm)\b/.test(x)));
    const { travaDml } = rep._teste;
    assert.ok(!travaDml('delete from tarefa;', 'x').ok && !travaDml('update tarefa set a = 1;', 'x').ok);
    assert.ok(
      travaDml('delete from tarefa where id_tarefa = 12;', 'x').ok &&
        travaDml("insert into t (a) values ('where');", 'x').ok
    );
  }

  // ═══ F4 + F5: etapa 5 com dependências injetadas: portão da massa, 5.4 sem resultado, resumo sem IA ═══
  {
    const novoDir = () => {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rep5-'));
      fs.writeFileSync(path.join(d, 'massa-real.sql'), 'select 1 where id = 987654');
      fs.writeFileSync(path.join(d, '4-diagnostico.md'), '# dx');
      return d;
    };
    const ler = (d, f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
    const base = (dir, log, o = {}) => ({
      semPadrao: true,
      banco: { ambiente: o.ambiente ?? 'copia-producao' },
      esperar: async (teste) => teste(),
      comandos: {
        lista: () => [
          { nome: 'API', comando: 'dotnet run' },
          { nome: 'Metro', comando: 'yarn react-native start' },
          { nome: 'Start', comando: 'yarn android' }
        ],
        rodar: (n) => log.push(`cmd:${n}`)
      },
      emulador: { aparelhos: async () => [{ serial: 'e' }], ligar: () => {}, pronto: async () => true },
      portaAberta: async () => true,
      metroStatus: async () => true,
      appInstalado: async () => true,
      executarSql: async () => {
        log.push('sql');
        return { ok: true, saida: '' };
      },
      gravarTela: () => {},
      pararTela: () => {},
      claude: async ({ titulo }) => {
        log.push(titulo);
        if (/fluxo/.test(titulo)) fluxo.plano(dir, [{ titulo: 'Abrir', texto: 'x' }]);
        if (/massa/.test(titulo))
          fs.writeFileSync(path.join(dir, 'massa-teste.sql'), 'insert into tarefa (id_tarefa) values (111111);');
        if (/emulador/.test(titulo) && o.registra)
          fs.writeFileSync(
            path.join(dir, '.reproducao-claude.json'),
            JSON.stringify({ ok: true, acao: 'repetiu', prints: [] })
          );
        return true;
      }
    });
    const sv = (dir) => ({ pastaAba: () => dir, render() {} }),
      tk = { id: 'x', chave: 'INC-9' };

    // portão: a massa pronta NÃO é executada; aprovada, executa uma vez
    let dir = novoDir(),
      log = [];
    await rep.executar(sv(dir), tk, base(dir, log));
    let m = ler(dir, '.mergulho.json');
    assert.deepStrictEqual([m.fase, m.aprovacao.arq, m.aprovacao.lido], ['aguardando', 'massa-teste.sql', false]);
    assert.ok(!log.includes('sql') && !log.some((x) => /emulador/.test(x)), 'nada no banco antes da aprovação');
    fs.writeFileSync(path.join(dir, 'massa-teste.sql'), 'insert into tarefa (id_tarefa) values (222222);'); // editou depois: precisa aprovar de novo
    rep.aprovarMassa(dir);
    fs.writeFileSync(path.join(dir, 'massa-teste.sql'), 'insert into tarefa (id_tarefa) values (333333);');
    log = [];
    await rep.executar(sv(dir), tk, base(dir, log));
    assert.strictEqual(ler(dir, '.mergulho.json').fase, 'aguardando');
    assert.ok(!log.includes('sql'));
    rep.aprovarMassa(dir);
    log = [];
    await rep.executar(sv(dir), tk, base(dir, log, { registra: false }));
    assert.deepStrictEqual(
      log.filter((x) => x === 'sql'),
      ['sql']
    );

    // 5.4: sem resultado do Claude → 2 tentativas, pausa com opções e SEM reproducao.json inventado
    const emu = log.filter((x) => /Reproduzindo/.test(x));
    assert.strictEqual(emu.length, 2);
    m = ler(dir, '.mergulho.json');
    assert.deepStrictEqual(
      [m.fase, m.pausa.motivo, m.pausa.opcoes],
      ['pausado', 'O Claude não registrou o resultado da reprodução', ['Tentar de novo', rep.ACEITAR]]
    );
    assert.ok(!fs.existsSync(path.join(dir, 'reproducao.json')));
    assert.ok(!fs.existsSync(path.join(dir, 'resumo.md')));

    // aceitar: grava como não reproduzido, deixando claro que foi decisão do dev; a retomada não reproduz de novo e o resumo vem com aviso
    rep.aceitarSemResultado(dir);
    const r = ler(dir, 'reproducao.json');
    assert.ok(r.ok === false && /Aceito pelo dev/.test(r.acao) && r.quando === null);
    log = [];
    await rep.executar(sv(dir), tk, base(dir, log));
    assert.ok(!log.some((x) => /Reproduzindo|cmd:/.test(x)));
    assert.ok(
      fs.readFileSync(path.join(dir, 'resumo.md'), 'utf8').startsWith('> Resumo montado pela extensão, sem IA')
    );
    assert.deepStrictEqual([ler(dir, '.mergulho.json').etapa, ler(dir, '.mergulho.json').fase], [6, 'concluido']);
    await vivoTem(dir, 'resumo básico');

    // com resultado registrado (mesmo "não reproduziu") conclui normalmente, sem segunda tentativa
    dir = novoDir();
    log = [];
    fs.writeFileSync(path.join(dir, 'massa-teste.sql'), 'insert into tarefa (id_tarefa) values (444444);');
    rep.aprovarMassa(dir);
    await rep.executar(sv(dir), tk, base(dir, log, { registra: true }));
    assert.strictEqual(log.filter((x) => /Reproduzindo/.test(x)).length, 1);
    assert.strictEqual(ler(dir, 'reproducao.json').ok, true);

    // ambiente do banco vazio pausa (mapa-db também recusa), antes de qualquer SQL
    dir = novoDir();
    log = [];
    fs.writeFileSync(path.join(dir, 'massa-teste.sql'), 'insert into tarefa (id_tarefa) values (555555);');
    rep.aprovarMassa(dir);
    await rep.executar(sv(dir), tk, base(dir, log, { ambiente: '' }));
    assert.ok(
      /ambiente do banco não está definido/.test(ler(dir, '.mergulho.json').pausa.motivo) && !log.includes('sql')
    );
  }

  // ═══ F4 na tela e nas ações: cartão do portão da massa; abrir marca lido sem perder o arquivo; ajuste refaz a massa ═══
  {
    reset();
    const { t, s, dir, a } = novo({ key: 'x', descricao: DESC, comentarios: [], anexos: [] });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'massa-teste.sql'), 'insert into tarefa (id_tarefa) values (666666);');
    mudar(dir, {
      etapa: 5,
      fase: 'aguardando',
      aprovacao: { etapa: 5, lido: false, arq: 'massa-teste.sql', nome: 'Massa de teste (executa no banco)' }
    });
    let h = mg.corpo(t, {}, dir);
    assert.ok(
      h.includes('Massa de teste (executa no banco)') &&
        h.includes('Abrir massa-teste.sql') &&
        h.includes('class="aprovar travado"')
    );
    await a.mergulhoAprovar(); // sem ler: não aprova
    assert.ok(!fs.existsSync(path.join(dir, '.massa-aprovada')));
    await a.mergulhoAbrir({ id: 5 });
    assert.deepStrictEqual(
      [estado(dir).aprovacao.arq, estado(dir).aprovacao.lido, abertos.at(-1)],
      ['massa-teste.sql', true, 'vscode.open']
    );
    let chamou = 0;
    const orig = rep.executar;
    rep.executar = async () => {
      chamou++;
    };
    await a.mergulhoAjuste(); // pede ajuste: o arquivo some para o Claude refazer e o pedido vai para .respostas.md
    assert.ok(
      !fs.existsSync(path.join(dir, 'massa-teste.sql')) &&
        fs.readFileSync(path.join(dir, '.respostas.md'), 'utf8').includes('use outro registro')
    );
    assert.strictEqual(chamou, 1);
    fs.writeFileSync(path.join(dir, 'massa-teste.sql'), 'insert into tarefa (id_tarefa) values (777777);');
    mudar(dir, { etapa: 5, fase: 'aguardando', aprovacao: { etapa: 5, lido: true, arq: 'massa-teste.sql' } });
    await a.mergulhoAprovar();
    rep.executar = orig;
    assert.ok(rep._teste.massaAprovada(dir, fs.readFileSync(path.join(dir, 'massa-teste.sql'), 'utf8')));
    assert.strictEqual(chamou, 2); // aprovar segue para a execução da etapa 5
  }

  // ═══ git real: etapa 3 puxa a origem (fast-forward) e relata falha de origem ═══
  {
    const gitX = (cwd, ...a) =>
      execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { encoding: 'utf8' }).trim();
    const caminho = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-inc-'));
    gitX(caminho, 'init', '-q', '-b', 'master-md');
    fs.writeFileSync(path.join(caminho, 'a.txt'), 'um\n');
    gitX(caminho, 'add', '.');
    gitX(caminho, 'commit', '-q', '-m', 'init');
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'origin-inc-'));
    execFileSync('git', ['clone', '-q', '--bare', caminho, bare]);
    gitX(caminho, 'remote', 'add', 'origin', bare);
    const outro = fs.mkdtempSync(path.join(os.tmpdir(), 'outro-inc-'));
    execFileSync('git', ['clone', '-q', bare, outro]);
    fs.writeFileSync(path.join(outro, 'b.txt'), 'dois\n');
    gitX(outro, 'add', '.');
    gitX(outro, 'commit', '-q', '-m', 'novo');
    gitX(outro, 'push', '-q', 'origin', 'master-md');
    const notas = [];
    assert.deepStrictEqual(
      sincronizarRepos([{ caminho, camada: 'backend' }], (x) => notas.push(x)),
      []
    );
    assert.ok(fs.existsSync(path.join(caminho, 'b.txt')) && notas.length === 1);
    gitX(caminho, 'remote', 'set-url', 'origin', path.join(os.tmpdir(), 'nao-existe-origem'));
    const falhas = sincronizarRepos([{ caminho, camada: 'backend' }]);
    assert.strictEqual(falhas.length, 1);
  }

  assert.deepStrictEqual(rede, [], 'nada saiu para a rede');
  console.log('OK teste-esteira-incidente');
  process.exit(0); // o Ao vivo ainda esvazia a fila de linhas em segundo plano
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
