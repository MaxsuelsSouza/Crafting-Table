// @ts-check
// node refinamento/testes/teste-esteira-refinamento.js — a esteira do Refinamento por fatia, com o Claude simulado (maestro.rodar/parar trocados),
// disco real em HOME temporário e rede bloqueada:
//   1 controle (⏸ cancela a rodada e para o Claude, filas esperam, "rodando sem processo" vira parado)
//   2 verificação pela extensão (correção limitada, pausa ao esgotar)
//   3 ticket só com título vira pergunta ao dev
//   4 ferramentas mínimas por etapa e o gravador refinamento-gravar com whitelist
const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  assert = require('assert');
const { spawnSync } = require('child_process');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'esr-home-'));
const https = require('https');
/** @type {any} */ (https).request = () => {
  throw new Error('REDE: bloqueada no teste');
};
globalThis.fetch = /** @type {any} */ (
  () => {
    throw new Error('REDE: bloqueada no teste');
  }
);
const Module = /** @type {any} */ (require('module'));
const load = Module._load;
const avisos = [];
Module._load = (r, ...a) =>
  r === 'vscode'
    ? new Proxy(
        {},
        {
          get: (_, k) =>
            k === 'workspace'
              ? { getConfiguration: () => ({ get: () => undefined }) }
              : k === 'window'
                ? new Proxy(
                    {},
                    {
                      get: () => (m) => {
                        avisos.push(String(m));
                        return Promise.resolve();
                      }
                    }
                  )
                : new Proxy(function () {}, { get: () => () => {}, apply: () => Promise.resolve() })
        }
      )
    : load(r, ...a);

const tickets = require('../../infra/tickets');
const maestro = require('../../painel/maestro');
const orq = require('../orquestrador');
const spec = require('../abas/spec');
const locais = require('../locais');
const controle = require('../../infra/controle');

// ── Claude simulado ──
const rodadas = []; // cada maestro.rodar: { opts, dir }
let vivo = false;
const paradas = [];
maestro.rodar = (dir, o) => {
  if (vivo) return false;
  rodadas.push({ dir, o });
  vivo = true;
  return true;
};
maestro.parar = (dir) => {
  paradas.push(dir);
  vivo = false;
};
const rodandoReal = maestro.rodando;
maestro.rodando = () => vivo;
const termina = () => {
  vivo = false;
  const u = rodadas[rodadas.length - 1];
  u.o.aoMudar();
}; // fim da execução (aoMudar roda `depois` e as filas)

const DEZ = (n) => 'x'.repeat(n);
const montar = (chave, { passo = 1, status = 'em_andamento', perguntas = [], estado = 'rodando' } = {}) => {
  const dir = tickets.pasta(chave),
    repo = path.join(dir, 'repo'),
    sd = path.join(repo, 'spec-x');
  fs.mkdirSync(sd, { recursive: true });
  const passos = [0, 1, 2, 3, 4, 5, 6].map((n) => ({
    n,
    titulo: `P${n}`,
    status: n < passo ? 'aprovado' : n === passo ? status : 'pendente'
  }));
  fs.writeFileSync(
    path.join(sd, ['sdd', 'state.json'].join('-')),
    JSON.stringify({ proximoPasso: passo, perguntas, achados: [], passos })
  );
  const t = { chave, id: chave, spec: { repo, dir: 'spec-x' } };
  tickets.gravar({ ...t, conversas: [], refinamento: { estado } });
  return { t, dir, sd, repo };
};
/** @param {any} [extra] */
const servicos = (extra = {}) => ({
  render() {},
  gravar: (id, nome, dado) => fs.writeFileSync(path.join(tickets.pasta(id), nome), JSON.stringify(dado)),
  abrirAba() {},
  secrets: {},
  ...extra
});
orq.iniciar(servicos(), { subscriptions: [] });

// ═══ Fatia 4: ferramentas por etapa ═══
{
  const base = orq.FERRAMENTAS(false),
    esc = orq.FERRAMENTAS(true);
  for (const f of [...base, ...esc])
    assert.ok(!['Write', 'Edit', 'MultiEdit'].includes(f), `${f} não pode existir no refinamento`);
  assert.ok(!base.some((f) => /refinamento-gravar/.test(f)), 'etapa de leitura não tem o gravador');
  assert.ok(
    esc.some((f) => /refinamento-gravar:\*/.test(f)),
    'etapa de escrita só grava pelo gravador'
  );
  assert.ok(!esc.some((f) => /git (commit|push)|curl|rm|mv/.test(f)), 'sem commit/push/rede');
}

// ═══ Fatia 2: verificação com laço de correção limitado ═══
{
  const { t, dir, sd } = montar('ESR-2', { passo: 1, status: 'aguardando_revisao' });
  fs.writeFileSync(path.join(sd, 'spec.md'), '# spec\n\nvazia de requisitos');
  rodadas.length = 0;
  assert.strictEqual(orq.seguir({ ...t }), false, 'passo aguardando revisão: nada a seguir');
  // Execução do passo 1 terminou: conclui mas o artefato não presta (curto, sem RF)
  assert.strictEqual(orq.conferir(t, 1), true);
  assert.strictEqual(locais.refinoDe(dir).correcao.tentativas, 1);
  // o `sdd ajuste` é assíncrono (sem sdd-state no teste resolve com false); espera a correção entrar
  setTimeout(() => {
    assert.strictEqual(rodadas.length, 1);
    assert.match(rodadas[0].o.prompt, /A conferência da extensão encontrou um problema no passo 1/);
    assert.match(rodadas[0].o.prompt, /Correção 1 de 2/);
    assert.ok(rodadas[0].o.ferramentas.some((f) => /refinamento-gravar/.test(f)));
    termina(); // volta a falhar → correção 2
    setTimeout(() => {
      assert.strictEqual(locais.refinoDe(dir).correcao.tentativas, 2);
      assert.match(rodadas[1].o.prompt, /Correção 2 de 2/);
      termina(); // esgotou: pausa com o motivo, sem terceira execução
      assert.strictEqual(rodadas.length, 2);
      assert.strictEqual(tickets.ler('ESR-2').refinamento.estado, 'pausado');
      const p = locais.refinoDe(dir).pausa;
      assert.strictEqual(p.motivo, 'verificacao');
      assert.match(p.detalhe, /spec\.md/);
      assert.ok(
        /Continuar/.test(
          spec.corpoAba(
            { ...tickets.ler('ESR-2'), id: 'ESR-2' },
            { dir, estado: null, impactos: [], tarefas: [], decisoes: [], abertos: new Set() }
          )
        ),
        'a aba Spec mostra o motivo e o ▶'
      );
      // Retomar zera a pausa e as correções gastas (ação ▶ da aba)
      spec
        .acoes(
          servicos({ ticketAberto: () => ({ ...tickets.ler('ESR-2'), id: 'ESR-2' }), mudarAba() {}, aberto: 'ESR-2' })
        )
        .retomar();
      assert.strictEqual(locais.refinoDe(dir).pausa, null);
      assert.strictEqual(locais.refinoDe(dir).correcao, null);
      // Artefato bom e passo concluído: conferir passa e limpa
      fs.writeFileSync(path.join(sd, 'spec.md'), `# spec\n\n${'RF01 o sistema deve registrar o pedido. '.repeat(10)}`);
      assert.strictEqual(orq.problemaDoPasso({ ...t }, 1), null);
      parte2();
    }, 80);
  }, 80);
}

// passo que não concluiu ⇒ correção sem reabrir; esperando pergunta ⇒ não é falha; pausado ⇒ não mexe
function parte2() {
  vivo = false;
  rodadas.length = 0;
  const a = montar('ESR-2B', { passo: 4, status: 'em_andamento' });
  assert.strictEqual(orq.conferir(a.t, 4), true);
  assert.match(rodadas[0].o.prompt, /terminou sem concluir/);
  assert.strictEqual(locais.refinoDe(a.dir).correcao.tentativas, 1);
  vivo = false;
  rodadas.length = 0;
  const b = montar('ESR-2C', {
    passo: 4,
    status: 'em_andamento',
    perguntas: [{ id: 'Q01', status: 'aberta', pergunta: 'x?' }]
  });
  assert.strictEqual(orq.conferir(b.t, 4), false, 'terminou para perguntar: legítimo');
  assert.strictEqual(rodadas.length, 0);
  const c = montar('ESR-2D', { passo: 4, status: 'em_andamento', estado: 'pausado' });
  assert.strictEqual(orq.conferir(c.t, 4), false, 'pausado: a conferência não dispara execução');
  // passo 3 exige as seções do plano
  const d = montar('ESR-2E', { passo: 3, status: 'aguardando_revisao' });
  fs.writeFileSync(path.join(d.sd, 'plan.md'), `# plano\n${DEZ(300)}\n`);
  assert.match(orq.problemaDoPasso(d.t, 3).texto, /Mapeamento do código/);
  fs.writeFileSync(
    path.join(d.sd, 'plan.md'),
    `# plano\n## Mapeamento do código\n${DEZ(300)}\n## Conformidade com a Constituição\n`
  );
  assert.strictEqual(orq.problemaDoPasso(d.t, 3), null);
  fatia1();
}

// ═══ Fatia 1: controle ═══
function fatia1() {
  vivo = false;
  rodadas.length = 0;
  paradas.length = 0;
  const { t, dir } = montar('ESR-1', { passo: 5, status: 'em_andamento' });
  fs.writeFileSync(
    path.join(dir, '.impactos.json'),
    JSON.stringify([
      { id: 'c1', autor: 'A', data: '2026-10-08T10:00:00Z', link: 'l', texto: 'x', status: 'triando' },
      { id: 'c2', autor: 'B', data: '2026-10-08T10:00:00Z', link: 'l', texto: 'y', status: 'na_fila' }
    ])
  );
  // execução do passo 5 em andamento (processo vivo)
  assert.strictEqual(orq.seguir(t), true);
  assert.strictEqual(vivo, true);
  let depoisChamado = false;
  const ultima = rodadas[rodadas.length - 1];
  assert.strictEqual(orq.situacao(t).parado, false, 'Claude vivo: rodando');
  // Pausar pela ação da aba
  const s = servicos({ ticketAberto: () => ({ ...tickets.ler('ESR-1'), id: 'ESR-1' }), aberto: 'ESR-1' });
  const idRodadaAntes = ultima;
  spec.acoes(s).pausar();
  assert.strictEqual(tickets.ler('ESR-1').refinamento.estado, 'pausado');
  assert.deepStrictEqual(paradas, [dir], 'maestro.parar chamado');
  assert.strictEqual(vivo, false);
  // O processo morre: aoMudar dispara, mas a rodada foi cancelada (conferir/depois não vale) e as filas esperam
  const antes = rodadas.length;
  idRodadaAntes.o.aoMudar();
  assert.strictEqual(rodadas.length, antes, 'pausado: nenhuma triagem/impacto/correção começa');
  const l = JSON.parse(fs.readFileSync(path.join(dir, '.impactos.json'), 'utf8'));
  assert.deepStrictEqual(
    l.map((i) => i.status),
    ['triagem', 'na_fila'],
    'o que foi interrompido volta à fila, não vira erro'
  );
  assert.strictEqual(controle.valida(dir, 1), false, 'rodada antiga inválida');
  // ▶: o refinamento volta e as filas voltam a andar
  s.ticketAberto = () => ({ ...tickets.ler('ESR-1'), id: 'ESR-1' });
  spec.acoes(s).retomar();
  assert.strictEqual(tickets.ler('ESR-1').refinamento.estado, 'rodando');
  assert.ok(rodadas.length > antes, 'retomou: o passo recomeça');
  assert.match(rodadas[rodadas.length - 1].o.prompt, /trabalhe só o passo 5/);
  // Execução interrompida: rodando sem processo e sem ninguém esperando = parado (o ▶ continua)
  vivo = false;
  assert.strictEqual(orq.situacao(t).parado, true);
  assert.match(
    spec.botaoRefino({ ...tickets.ler('ESR-1'), id: 'ESR-1' }, (a) => `data-acao="${a}"`),
    /data-acao="retomar"/
  );
  assert.match(spec.pillRefino({ ...tickets.ler('ESR-1'), id: 'ESR-1' }), /Parado/);
  // Esperando você (pergunta aberta): não é parado
  const q = montar('ESR-1B', {
    passo: 2,
    status: 'em_andamento',
    perguntas: [{ id: 'Q01', status: 'aberta', pergunta: 'qual?' }]
  });
  assert.strictEqual(orq.situacao(q.t).parado, false);
  assert.match(
    spec.botaoRefino({ ...tickets.ler('ESR-1B'), id: 'ESR-1B' }, (a) => `data-acao="${a}"`),
    /data-acao="pausar"/
  );
  void depoisChamado;
  fatia3();
}

// ═══ Fatia 3: ticket só com título vira pergunta ═══
function fatia3() {
  vivo = false;
  rodadas.length = 0;
  const chave = 'ESR-3',
    dir = tickets.pasta(chave),
    repo = path.join(dir, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  const t = {
    chave,
    id: chave,
    titulo: 'Melhorar o fluxo',
    spec: { repo },
    conversas: [],
    refinamento: { estado: 'desligado' }
  };
  tickets.gravar(t);
  const abas = [];
  const s = servicos({
    ticketAberto: () => ({ ...tickets.ler(chave), id: chave }),
    mudarAba: (a) => abas.push(a),
    atualizarJira() {},
    cacheJira: { [chave]: { key: chave, descricao: '', comentarios: [] } }
  });
  const a = spec.acoes(s);
  a.refinar();
  assert.strictEqual(rodadas.length, 0, 'ticket só com título: nenhuma execução gasta');
  const p = locais.refinoDe(dir).pausa;
  assert.strictEqual(p.motivo, 'briefing');
  assert.ok(p.perguntas.length >= 3);
  assert.strictEqual(tickets.ler(chave).refinamento.estado, 'desligado', 'não entrou em modo refinamento');
  const html = spec.corpoAba(
    { ...tickets.ler(chave), id: chave },
    { dir, estado: null, impactos: [], tarefas: [], decisoes: [], abertos: new Set() }
  );
  assert.match(html, /data-acao="refinoBriefing"/);
  assert.match(html, /só tem o título/);
  // Resposta curta demais: pede mais
  a.refinoBriefing({ texto: 'oi' });
  assert.strictEqual(rodadas.length, 0);
  assert.ok(avisos.some((m) => /Explique um pouco mais/.test(m)));
  // Respondeu: vira briefing, a pausa some e o refinamento começa (spec.init em leitura, com o briefing no prompt)
  a.refinoBriefing({
    texto: 'Quero que o pedido de compra mostre o saldo do cliente antes de confirmar; pronto quando o saldo aparecer.'
  });
  assert.match(locais.briefingDe(dir), /saldo do cliente/);
  assert.strictEqual(locais.refinoDe(dir).pausa, null);
  assert.strictEqual(rodadas.length, 1);
  assert.match(rodadas[0].o.prompt, /Explicação do dev \(fonte verbal/);
  assert.ok(!rodadas[0].o.ferramentas.some((f) => /refinamento-gravar/.test(f)), 'a criação da spec só lê');
  assert.strictEqual(tickets.ler(chave).refinamento.estado, 'aguardando_inicio');
  // Ticket com descrição suficiente: não bloqueia
  vivo = false;
  rodadas.length = 0;
  const c2 = 'ESR-3B',
    d2 = tickets.pasta(c2);
  fs.mkdirSync(path.join(d2, 'repo'), { recursive: true });
  tickets.gravar({
    chave: c2,
    id: c2,
    spec: { repo: path.join(d2, 'repo') },
    conversas: [],
    refinamento: { estado: 'desligado' }
  });
  const s2 = servicos({
    ticketAberto: () => ({ ...tickets.ler(c2), id: c2 }),
    mudarAba() {},
    atualizarJira() {},
    cacheJira: {
      [c2]: {
        key: c2,
        descricao: '<p>Ao confirmar o pedido, mostrar o saldo atual do cliente e bloquear quando for negativo.</p>',
        comentarios: []
      }
    }
  });
  spec.acoes(s2).refinar();
  assert.strictEqual(rodadas.length, 1, 'descrição suficiente: o refinamento começa direto');
  assert.strictEqual(locais.refinoDe(d2).pausa, undefined);
  gravador();
}

// ═══ Fatia 4: o gravador ═══
function gravador() {
  const bin = path.join(__dirname, '..', 'bin', 'refinamento-gravar');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'esr-grav-'));
  /** @type {any} */
  const env = {
    ...process.env,
    REFINAMENTO_DIR: path.join(base, 'spec'),
    REFINAMENTO_RAIZ: path.join(base, 'raiz'),
    REFINAMENTO_MEMORIA: path.join(base, 'mem')
  };
  delete env.REFINAMENTO_FOCO;
  delete env.REFINAMENTO_SDD;
  const grava = (nome, texto = '# ok', /** @type {any} */ e = env) =>
    spawnSync(process.execPath, [bin, nome], { input: texto, env: e, encoding: 'utf8' });
  assert.strictEqual(grava('spec.md').status, 0);
  assert.strictEqual(fs.readFileSync(path.join(base, 'spec', 'spec.md'), 'utf8'), '# ok');
  assert.strictEqual(grava('constitution.md').status, 0);
  assert.ok(fs.existsSync(path.join(base, 'raiz', 'constitution.md')));
  assert.strictEqual(grava('.memoria-passo-3.md').status, 0);
  assert.ok(fs.existsSync(path.join(base, 'mem', '.memoria-passo-3.md')));
  const estado = ['sdd', 'state.json'].join('-');
  for (const ruim of [
    '../fora.md',
    '/etc/passwd',
    estado,
    '.tarefas.json',
    '.impactos.json',
    '.duvidas.json',
    'sub/spec.md',
    '.oculto.md',
    'x.sh',
    '',
    '.memoria-passo-9.md'
  ]) {
    const r = grava(ruim);
    assert.notStrictEqual(r.status, 0, `deveria recusar: "${ruim}"`);
  }
  assert.ok(!fs.existsSync(path.join(base, 'fora.md')) && !fs.existsSync(path.join(base, 'spec', estado)));
  assert.notStrictEqual(grava('spec.md', '', { ...env, REFINAMENTO_DIR: '' }).status, 0, 'sem destino: recusa');
  // Foco: gravou grande demais ⇒ exit 2 com o aviso devolvido ao Claude
  const foco = path.join(__dirname, '..', '..', 'plugins', 'foco', 'hooks', 'medir.js');
  if (fs.existsSync(foco)) {
    const longo = `${'Vale ressaltar que, basicamente, em suma, de forma geral isto é assim. '.repeat(400)}\n`;
    const r = grava('spec.md', longo, { ...env, REFINAMENTO_FOCO: foco });
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /foco:/);
  }
  void rodandoReal;
  setTimeout(() => {
    console.log('esteira do refinamento ok');
    process.exit(0);
  }, 50);
}
