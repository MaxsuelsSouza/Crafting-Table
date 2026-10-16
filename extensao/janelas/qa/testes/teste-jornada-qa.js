// @ts-check
// node janelas/qa/testes/teste-jornada-qa.js — Etapa 6.2: validação do roteiro e a jornada com Maestro, adb e banco falsos.
const assert = require('assert');
// Nunca o ~/.wms-testes.env real: sem credencial, a pré-condição cai no caminho do Claude simulado.
process.env.WMS_ENV_FILE = '/nao-existe/.wms-testes.env';
for (const k of Object.keys(process.env)) if (k.startsWith('WMS_') && k !== 'WMS_ENV_FILE') delete process.env[k];
const fs = require('fs'),
  os = require('os'),
  path = require('path');
const { validarRoteiro, substituir, resolverVars } = require('../etapas/06-execucao/regras/roteiro');
const { comBinds, comparar } = require('../etapas/06-execucao/regras/consulta');
const { rodarJornada } = require('../etapas/06-execucao/subetapas/6.2-jornada');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-jornada-'));
const flow = (nome, tx) => fs.writeFileSync(path.join(base, nome), tx);
flow('ok.yaml', 'appId: ${APP_ID}\nname: CT01 bipar\n---\n- runFlow: sub/login.yaml\n');
fs.mkdirSync(path.join(base, 'sub'));
flow('sub/login.yaml', 'appId: ${APP_ID}\n---\n- tapOn: x\n');
flow('nome-ruim.yaml', 'appId: x\nname: "CT01: bipar"\n---\n');
flow('env-cabecalho.yaml', 'appId: x\nenv:\n  APP_ID: br.qas\n---\n');
flow('sub-ruim.yaml', 'appId: x\n---\n- runFlow: sub/nao-existe.yaml\n');

// ── substituição: massa vence o default do roteiro; variável desconhecida fica literal
assert.deepStrictEqual(resolverVars({ variaveis: { CODIGO: '${NUMPEDIDO}', X: '1' } }, { NUMPEDIDO: '77' }), {
  CODIGO: '77',
  X: '1',
  NUMPEDIDO: '77'
});
assert.strictEqual(substituir('${A}-${B}', { A: 1 }), '1-${B}');

// ── validação
const erros = (etapas, envBase = {}) => validarRoteiro({ etapas }, { base, envBase });
assert.deepStrictEqual(erros([{ tipo: 'flow', arquivo: 'ok.yaml' }]), []);
assert.deepStrictEqual(validarRoteiro({ etapas: [] }, { base }), ['roteiro sem etapas']);
assert.match(erros([{ tipo: 'tocar' }])[0], /tipo desconhecido/);
assert.match(erros([{ tipo: 'flow', arquivo: 'nome-ruim.yaml' }])[0], /quebra no Windows/);
assert.match(erros([{ tipo: 'flow', arquivo: 'env-cabecalho.yaml' }], { APP_ID: 'br.stg' })[0], /repete APP_ID/);
assert.deepStrictEqual(erros([{ tipo: 'flow', arquivo: 'env-cabecalho.yaml' }]), []); // sem -e de APP_ID: sem choque
assert.match(erros([{ tipo: 'flow', arquivo: 'sub-ruim.yaml' }])[0], /flow não encontrado.*nao-existe/);
assert.match(erros([{ tipo: 'bipe', codigo: '${CODIGO}' }])[0], /variável sem valor: \$\{CODIGO\}/);
assert.match(erros([{ tipo: 'consulta', nome: 'a', sql: 'DELETE FROM t' }])[0], /só SELECT/);
assert.match(
  erros([{ tipo: 'consulta', nome: 'b', sql: 'SELECT 1 FROM dual', comparar_com: 'a', esperado: 'igual' }])[0],
  /não é uma consulta anterior/
);
assert.match(
  erros([
    { tipo: 'consulta', nome: 'a', sql: 'SELECT 1 FROM dual' },
    { tipo: 'consulta', nome: 'a', sql: 'SELECT 1 FROM dual', comparar_com: 'a', esperado: 'talvez' }
  ]).join('\n'),
  /repetido[\s\S]*igual ou diferente/
);

// ── consulta: binds e comparação de colunas + linhas
assert.strictEqual(
  comBinds('SELECT * FROM t WHERE a = :a AND b = :b AND c = :c', { a: '10', b: "O'Neil" }),
  "SELECT * FROM t WHERE a = 10 AND b = 'O''Neil' AND c = :c"
);
const r1 = { nome: 'antes', colunas: ['st'], itens: [{ st: 'A' }] };
assert.ok(comparar(r1, { nome: 'd', colunas: ['st'], itens: [{ st: 'A' }] }, 'igual').ok);
assert.ok(comparar(r1, { nome: 'd', colunas: ['st'], itens: [{ st: 'B' }] }, 'diferente').ok);
assert.ok(!comparar(r1, { nome: 'd', colunas: ['status'], itens: [{ status: 'A' }] }, 'igual').ok); // projeção mudou

// ── jornada com dependências falsas
const chamadas = [];
const deps = (o = {}) => ({
  maestro: async (arq, env, { junit }) => (
    chamadas.push(['maestro', path.basename(arq), env, path.basename(junit)]),
    o.maestro || { rc: 0, saida: 'ok' }
  ),
  bipe: async (c) => (chamadas.push(['bipe', c]), o.bipe || { ok: true, saida: 'Broadcast completed' }),
  esperar: async () => {},
  consultar: async (sql) => (
    chamadas.push(['sql', sql]),
    o.linhas ? { ok: true, colunas: ['st'], itens: o.linhas.shift() } : { ok: false, erro: 'ORA-1' }
  ),
  prints: () => []
});
const roteiro = {
  variaveis: { CODIGO: '${NUMPEDIDO}' },
  etapas: [
    { tipo: 'consulta', nome: 'antes', sql: 'SELECT st FROM p WHERE n = :n', binds: { n: '${CODIGO}' } },
    { tipo: 'flow', arquivo: 'ok.yaml', env: { PREFIXO: 'CT01' } },
    { tipo: 'bipe', codigo: '${CODIGO}' },
    {
      tipo: 'consulta',
      nome: 'depois',
      sql: 'SELECT st FROM p WHERE n = :n',
      binds: { n: '${CODIGO}' },
      comparar_com: 'antes',
      esperado: 'diferente'
    }
  ]
};
const rodarCom = async (o, extra = {}) => {
  const saida = fs.mkdtempSync(path.join(base, 'saida-'));
  return {
    saida,
    ...(await rodarJornada({
      roteiro,
      base,
      saida,
      vars: { NUMPEDIDO: '77' },
      envBase: { APP_ID: 'br.stg' },
      deps: deps(o),
      ...extra
    }))
  };
};

(async () => {
  let r = await rodarCom({ linhas: [[{ st: 'A' }], [{ st: 'B' }]] });
  assert.strictEqual(r.status, 'passou', r.detalhes.join('\n'));
  assert.deepStrictEqual(chamadas[1], ['maestro', 'ok.yaml', { APP_ID: 'br.stg', PREFIXO: 'CT01' }, '02-ok-junit.xml']);
  assert.deepStrictEqual(chamadas[2], ['bipe', '77']);
  assert.strictEqual(chamadas[0][1], 'SELECT st FROM p WHERE n = 77');
  assert.ok(fs.readFileSync(path.join(r.saida, 'consulta-depois.txt'), 'utf8').includes('-- 1 linha(s)'));
  assert.match(fs.readFileSync(path.join(r.saida, 'jornada.txt'), 'utf8'), /^# Jornada · passou/);

  r = await rodarCom({ linhas: [[{ st: 'A' }], [{ st: 'A' }]] }); // bipou e não gravou: falha, mas a jornada vai até o fim
  assert.strictEqual(r.status, 'falhou');
  assert.match(r.detalhes.at(-1), /igual de "antes" \(esperado: diferente\) ✗/);

  r = await rodarCom({ linhas: [[{ st: 'A' }]], maestro: { rc: 1, saida: 'Element not found: Confirmar' } });
  assert.strictEqual(r.status, 'falhou');
  assert.match(r.detalhes.at(-1), /02 flow ok.yaml: falhou \(rc 1\). Element not found/);

  r = await rodarCom({ linhas: [[{ st: 'A' }]], bipe: { ok: false, saida: 'error: no devices' } });
  assert.match(r.detalhes.at(-1), /broadcast não entregue/);

  r = await rodarCom({}, { vars: {} });
  assert.strictEqual(r.status, 'invalido');
  assert.match(r.detalhes[0], /variável sem valor: \$\{NUMPEDIDO\}/);

  await encadeamento();
  fs.rmSync(base, { recursive: true, force: true });
  console.log('ok jornada qa');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// ── 6.1 → 6.2 → 6.3 de um cenário, com o Claude simulado (maestro.rodar trocado) e o qa-state real.
// Cobre: roteiro registrado e passou sem 2º Claude; ↻ reaproveita o roteiro (zero Claude); falha → diagnóstico → outro roteiro → passou;
// roteiro recusado de novo pausa no cenário (zero skip); diagnóstico "código" conclui como falhou.
async function encadeamento() {
  const { execFileSync } = require('child_process');
  const maestro = require('../../../infra/agentes/maestro');
  const { sincronizar } = require('../etapas/02-cenarios/mapa');
  const { cenarios } = require('../etapas/02-cenarios/mapa');
  const { iniciarCenario } = require('../etapas/06-execucao/cenario');
  const { refazer } = require('../etapas/02-cenarios');
  const { executarCenario } = require('../etapas/06-execucao/executar-cenario');
  const { estado } = require('../estado');
  const descartar = (d0, id) => require('../etapas/06-execucao/roteiros').descartarRoteiro(d0, id);
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-enc-')),
    dir = path.join(raiz, 'qa'),
    area = path.join(raiz, 'area');
  fs.mkdirSync(dir);
  fs.mkdirSync(area);
  sincronizar(dir, '#### CT01 – Bipar pedido\n\nDado um pedido\nQuando bipar\nEntão grava', 1);
  const qs = (...a) =>
    execFileSync(path.join(__dirname, '..', 'bin', 'qa-state'), a, {
      env: { ...process.env, QA_DIR: dir, WMS_ENV_FILE: path.join(raiz, 'nao-existe.env') },
      stdio: ['ignore', 'pipe', 'pipe']
    }).toString();
  fs.writeFileSync(path.join(area, 'CT01.yaml'), 'appId: ${APP_ID}\n---\n- tapOn: x\n');
  const rot = (etapas) => {
    const f = path.join(area, 'CT01.json');
    fs.writeFileSync(f, JSON.stringify({ etapas }));
    return f;
  };
  const BOM = [{ tipo: 'flow', arquivo: 'CT01.yaml' }],
    titulos = [];
  let claudeFaz = () => {};
  maestro.rodar = (d, o) => {
    titulos.push(o.titulo);
    setTimeout(() => {
      claudeFaz(o);
      o.aoMudar();
    }, 1);
    return true;
  };
  maestro.rodando = () => false;
  let rcs = [];
  const d = {
    chave: 'K-1',
    horaRefresh: '06:00',
    timeoutMin: 0,
    jornada: {
      envBase: {},
      maestro: async () => ({ rc: rcs.shift() ?? 0, saida: 'Element not found: Confirmar' }),
      bipe: async () => ({ ok: true }),
      esperar: async () => {},
      consultar: async () => ({ ok: false, erro: 'sem banco' }),
      prints: () => []
    }
  };
  const status = () => cenarios(dir).cenarios[0];
  const rodarCT = () => executarCenario(dir, d, {}, status(), iniciarCenario(dir, 'CT01', null), []);

  // roteiro recusado pelo qa-state na hora (tipo desconhecido); o válido é aceito.
  iniciarCenario(dir, 'CT01', null);
  assert.throws(() => qs('roteiro', 'CT01', rot([{ tipo: 'tocar' }])), /tipo desconhecido/);
  require('../etapas/06-execucao/cenario').concluirCenario(dir, 'CT01', 'descartado');

  claudeFaz = () => qs('roteiro', 'CT01', rot(BOM));
  assert.strictEqual(await rodarCT(), 'fim');
  assert.deepStrictEqual([status().status, titulos], ['passou', ['QA · CT01 · Bipar pedido']]);
  const ex1 = status().execucoes.at(-1);
  assert.ok(ex1.anexos.includes('jornada.txt') && ex1.anexos.includes('roteiro.json'), ex1.anexos.join());

  // ↻ Refazer sem mudar o cenário: roteiro reaproveitado, nenhum Claude.
  titulos.length = 0;
  refazer(dir, 'CT01');
  assert.strictEqual(await rodarCT(), 'fim');
  assert.deepStrictEqual([status().status, titulos], ['passou', []]);

  // Falha → diagnóstico diz "roteiro" → outro roteiro → passou.
  refazer(dir, 'CT01');
  rcs = [1, 0];
  claudeFaz = (o) =>
    /diagnóstico/.test(o.titulo)
      ? qs('roteiro', 'CT01', 'refazer', '--nota', 'seletor errado')
      : qs('roteiro', 'CT01', rot(BOM));
  assert.strictEqual(await rodarCT(), 'fim');
  assert.deepStrictEqual(titulos, ['QA · CT01 · diagnóstico', 'QA · CT01 · novo roteiro']);
  assert.strictEqual(status().status, 'passou');

  // Diagnóstico "código": conclui como falhou, sem pedir outro roteiro.
  titulos.length = 0;
  refazer(dir, 'CT01');
  rcs = [1];
  claudeFaz = (o) => qs('cenario', 'CT01', 'concluir', '--status', 'falhou', '--nota', 'app não grava');
  assert.strictEqual(await rodarCT(), 'fim');
  assert.deepStrictEqual([status().status, titulos], ['falhou', ['QA · CT01 · diagnóstico']]);

  // Pergunta no roteiro (6.1): a resposta continua a MESMA sessão (--resume), não abre outra do zero.
  titulos.length = 0;
  refazer(dir, 'CT01');
  descartar(dir, 'CT01');
  const sessoes = [];
  const rodarOrig = maestro.rodar;
  maestro.rodar = (d0, o) => (sessoes.push(o.sessao || null), rodarOrig(d0, o));
  fs.writeFileSync(path.join(dir, '.ao-vivo.sid'), 'sessao-que-perguntou');
  claudeFaz = () => qs('pausa', '--motivo', 'm', '--pergunta', 'Qual filial?');
  assert.strictEqual(await rodarCT(), 'parou');
  assert.deepStrictEqual(estado(dir).retomarSessao, { cenario: 'CT01', sid: 'sessao-que-perguntou' });
  require('../orquestrador/responder').responder(dir, 'Filial 2');
  require('../estado').mudar(dir, { execucao: 'rodando' }); // o ▶ faz isto na retomada
  claudeFaz = () => qs('roteiro', 'CT01', rot(BOM));
  assert.strictEqual(await rodarCT(), 'fim');
  assert.deepStrictEqual(sessoes, [null, 'sessao-que-perguntou']);
  assert.strictEqual(titulos.at(-1), 'QA · CT01 · continuando após a resposta');
  assert.strictEqual(estado(dir).retomarSessao, null);
  maestro.rodar = rodarOrig;

  // Roteiro ruim duas vezes: pausa no cenário (zero skip), não conclui.
  titulos.length = 0;
  refazer(dir, 'CT01');
  rcs = [1, 1];
  claudeFaz = (o) =>
    /diagnóstico/.test(o.titulo)
      ? qs('roteiro', 'CT01', 'refazer', '--nota', 'espera curta')
      : qs('roteiro', 'CT01', rot(BOM));
  assert.strictEqual(await rodarCT(), 'parou');
  assert.match(estado(dir).pausa?.pergunta || JSON.stringify(estado(dir)), /não serviu de novo: espera curta/);

  // Lote (craftingTable.qaLoteRoteiro): 3 cenários, UMA sessão do Claude escreve os 3 roteiros; a jornada roda os 3 sem Claude.
  const dl = path.join(raiz, 'lote');
  fs.mkdirSync(dl);
  sincronizar(dl, '#### CT01 – A\n\nx\n\n#### CT02 – B\n\ny\n\n#### CT03 – C\n\nz', 1);
  const qsl = (...a) =>
    execFileSync(path.join(__dirname, '..', 'bin', 'qa-state'), a, {
      env: { ...process.env, QA_DIR: dl },
      stdio: ['ignore', 'pipe', 'pipe']
    }).toString();
  titulos.length = 0;
  rcs = [];
  claudeFaz = (o) => {
    for (const id of [...new Set(o.prompt.match(/CT0\d/g))]) qsl('roteiro', id, rot(BOM));
  };
  require('../estado').mudar(dl, { execucao: 'rodando' });
  assert.strictEqual(await require('../etapas/06-execucao').rodar(dl, { ...d, loteRoteiro: 3 }, {}), false);
  assert.deepStrictEqual(
    [cenarios(dl).cenarios.map((c) => c.status), titulos],
    [['passou', 'passou', 'passou'], ['QA · CT01 · roteiros de CT01, CT02, CT03']]
  );
  assert.strictEqual(estado(dl).loteRoteiro, null);
  // fora do lote, o qa-state não aceita roteiro de cenário que não está em execução
  assert.throws(() => qsl('roteiro', 'CT02', rot(BOM)), /não está em execução/);
  fs.rmSync(raiz, { recursive: true, force: true });
}
