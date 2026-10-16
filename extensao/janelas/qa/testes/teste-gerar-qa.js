// @ts-check
// node janelas/qa/testes/teste-gerar-qa.js — o caminho "IA escreve uma vez, a extensão roda": receita de massa, 6.0 Gerar (uma sessão
// por card), camadas, etapa http, diagnóstico por regra e as correções na mesma conversa. Claude simulado, banco falso, qa-state real.
const assert = require('assert');
process.env.WMS_ENV_FILE = '/nao-existe/.wms-testes.env';
for (const k of Object.keys(process.env)) if (k.startsWith('WMS_') && k !== 'WMS_ENV_FILE') delete process.env[k];
delete process.env.QA_BANCO;
const fs = require('fs'),
  os = require('os'),
  path = require('path');
const { execFileSync } = require('child_process');
process.env.QA_CONHECIMENTOS = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-conhec-'));

const { validarReceita } = require('../etapas/05-massa/receita/formato');
const { distribuir, conferencia } = require('../etapas/05-massa/receita/buscar');
const { montarProducao, preencher } = require('../etapas/05-massa/receita/produzir');
const { testarReceita } = require('../etapas/05-massa/receita/testar');
const { rodarReceita, registrarReceita } = require('../etapas/05-massa/receita');
const { levantarPorReceita } = require('../etapas/05-massa/receita/levantar');
const { massa } = require('../etapas/05-massa/estado');
const { propostaMassa, aplicarProposta } = require('../etapas/05-massa/proposta');
const { errosHttp, conferirHttp } = require('../etapas/06-execucao/regras/http');
const { errosDaCamada, validarCard, camadaDe } = require('../etapas/06-execucao/regras/camadas');
const { classificar } = require('../etapas/06-execucao/regras/diagnostico');
const { validarRoteiro } = require('../etapas/06-execucao/regras/roteiro');
const { rodarJornada } = require('../etapas/06-execucao/subetapas/6.2-jornada');
const { sincronizar, cenarios } = require('../etapas/02-cenarios/mapa');
const { estado, mudar } = require('../estado');
const maestro = require('../../../infra/agentes/maestro');

const novoDir = (md) => {
  const d = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-g-')), 'qa');
  fs.mkdirSync(d);
  sincronizar(d, md, 1);
  return d;
};
const qs = (dir, ...a) =>
  execFileSync(path.join(__dirname, '..', 'bin', 'qa-state'), a, {
    env: { ...process.env, QA_DIR: dir },
    stdio: ['ignore', 'pipe', 'pipe']
  }).toString();

const BUSCA = 'SELECT NUMPEDIDO, SITUACAO FROM SFC.PEDIDO WHERE SITUACAO = 2';
const RECEITA = {
  papeis: [
    { papel: 'pedido faturado', cenarios: ['CT01', 'CT02'], por_cenario: true, busca: BUSCA },
    { papel: 'filial', cenarios: ['CT01', 'CT02'], por_cenario: false, busca: 'SELECT CODFILIAL FROM SFC.FILIAL' }
  ],
  dispensa: ['CT03']
};

(async () => {
  // ── formato da receita
  assert.deepStrictEqual(validarReceita(RECEITA, ['CT01', 'CT02', 'CT03']), []);
  assert.match(validarReceita(RECEITA, ['CT01', 'CT02', 'CT03', 'CT04']).join(), /sem papel nem dispensa: CT04/);
  assert.match(
    validarReceita({ papeis: [{ papel: 'x', cenarios: ['CT01'], busca: 'DELETE FROM t' }] }).join(),
    /busca: só SELECT/
  );
  const comProduzir = (pr) => ({ papeis: [{ papel: 'x', cenarios: ['CT01'], busca: BUSCA, produzir: pr }] });
  assert.match(
    validarReceita(
      comProduzir({
        base: BUSCA,
        chave: ['NUMPEDIDO'],
        sql: 'DELETE FROM t WHERE a = ${A}',
        desfazer: 'UPDATE t SET a=1 WHERE b=${B}'
      })
    ).join(),
    /produzir.sql: só UPDATE/
  );

  // ── distribuir: um registro por cenário, um só para todos, sem repetir o que já está em uso
  const res = [
    {
      ok: true,
      itens: [
        { numpedido: 10, situacao: 2 },
        { numpedido: 11, situacao: 2 },
        { numpedido: 12, situacao: 2 }
      ]
    },
    { ok: true, itens: [{ codfilial: 'CAB' }] }
  ];
  let dist = distribuir(RECEITA, res, ['CT01', 'CT02'], [{ NUMPEDIDO: 10, SITUACAO: 2 }]);
  assert.deepStrictEqual(
    dist.registros.map((r) => [r.papel, r.cenarios.join(), r.dados.NUMPEDIDO ?? r.dados.CODFILIAL]),
    [
      ['pedido faturado', 'CT01', 11],
      ['pedido faturado', 'CT02', 12],
      ['filial', 'CT01,CT02', 'CAB']
    ]
  );
  assert.strictEqual(dist.registros[0].consulta, `SELECT * FROM (${BUSCA}) WHERE NUMPEDIDO = 11 AND SITUACAO = 2`);
  assert.strictEqual(
    conferencia('SELECT X FROM T', { X: "O'Neil" }),
    "SELECT * FROM (SELECT X FROM T) WHERE X = 'O''Neil'"
  );
  dist = distribuir(
    RECEITA,
    [
      { ok: true, itens: [{ numpedido: 11 }] },
      { ok: false, erro: 'ORA-00942' }
    ],
    ['CT01', 'CT02']
  );
  assert.deepStrictEqual(dist.faltam, [
    { papel: 0, cenarios: ['CT02'] },
    { papel: 1, cenarios: ['CT01', 'CT02'] }
  ]);
  assert.match(dist.erros[0], /filial: ORA-00942/);

  // ── produzir: UPDATEs de todos num lote só; ${COL} vira literal SQL
  assert.strictEqual(
    preencher("UPDATE t SET a = 1 WHERE n = ${N} AND c = '${C}'", { N: 5, C: "x'y" }),
    "UPDATE t SET a = 1 WHERE n = 5 AND c = 'x''y'"
  );
  const recP = {
    papeis: [
      {
        papel: 'pedido sem dono',
        cenarios: ['CT01', 'CT02'],
        busca: BUSCA,
        produzir: {
          base: 'SELECT NUMPEDIDO, DONO FROM SFC.PEDIDO',
          chave: ['NUMPEDIDO'],
          sql: 'UPDATE SFC.PEDIDO SET DONO = NULL WHERE NUMPEDIDO = ${NUMPEDIDO}',
          desfazer: 'UPDATE SFC.PEDIDO SET DONO = ${DONO} WHERE NUMPEDIDO = ${NUMPEDIDO}'
        }
      }
    ]
  };
  const prod = await montarProducao(
    recP,
    [
      { papel: 0, cenarios: ['CT01'] },
      { papel: 0, cenarios: ['CT02'] }
    ],
    async () => ({
      resultados: [
        {
          ok: true,
          itens: [
            { numpedido: 7, dono: 'ANA' },
            { numpedido: 8, dono: 'BIA' }
          ]
        }
      ]
    })
  );
  assert.deepStrictEqual(prod.proposta.sql.split(';\n'), [
    'UPDATE SFC.PEDIDO SET DONO = NULL WHERE NUMPEDIDO = 7',
    'UPDATE SFC.PEDIDO SET DONO = NULL WHERE NUMPEDIDO = 8'
  ]);
  assert.strictEqual(prod.proposta.receita[1].desfazer, "UPDATE SFC.PEDIDO SET DONO = 'BIA' WHERE NUMPEDIDO = 8");

  // ── rodarReceita na pasta: massa registrada sem IA; a busca vazia vira UMA proposta; aprovada, cada registro é confirmado e vira massa
  {
    const dir = novoDir('#### CT01 – A\n\n#### CT02 – B');
    registrarReceita(dir, recP, ['CT01', 'CT02']);
    const chamadas = [];
    let resp = [{ ok: true, itens: [{ numpedido: 1, situacao: 2 }] }]; // só um: o CT02 fica sem
    const d = {
      chave: 'K-1',
      horaRefresh: '06:00',
      timeoutMin: 0,
      banco: { conexao: 'c', ambiente: 'qas', sensiveis: [] },
      consultarBanco: async (b, sqls) => (
        chamadas.push(sqls),
        {
          resultados: sqls.map((s, i) =>
            /DONO FROM/.test(s)
              ? { ok: true, itens: [{ numpedido: 9, dono: 'ANA' }] }
              : resp[i] || { ok: true, itens: [] }
          )
        }
      ),
      executarSql: async () => ({ ok: true, saida: '1 row updated' })
    };
    const r = await rodarReceita(dir, d, ['CT01', 'CT02']);
    assert.ok(r.proposta && chamadas[0].length === 1, JSON.stringify(r));
    assert.deepStrictEqual(
      massa(dir).itens.map((i) => [i.cenarios.join(), i.dados.NUMPEDIDO]),
      [['CT01', 1]]
    );
    assert.deepStrictEqual(propostaMassa(dir).sql, ['UPDATE SFC.PEDIDO SET DONO = NULL WHERE NUMPEDIDO = 9']);
    resp = [{ ok: true, itens: [{ numpedido: 9, situacao: 2 }] }]; // depois do UPDATE a busca filtrada pela chave acha
    const ap = await aplicarProposta(dir, d);
    assert.ok(ap.ok);
    const m2 = massa(dir).itens.find((i) => i.cenarios.includes('CT02'));
    assert.deepStrictEqual(
      [m2.dados.NUMPEDIDO, m2.origem, m2.desfazer],
      [9, 'sql', ["UPDATE SFC.PEDIDO SET DONO = 'ANA' WHERE NUMPEDIDO = 9"]]
    );
  }

  // ── qa-state card/receita: só no Gerar; recusa o que não serve; testarReceita devolve contagem, colunas e a amostra dos roteiros
  {
    const dir = novoDir('#### CT01 – A\n\n#### CT02 – B\n\n#### CT03 – C');
    const arq = (o) => {
      const f = path.join(path.dirname(dir), `${Math.random()}.json`);
      fs.writeFileSync(f, JSON.stringify(o));
      return f;
    };
    assert.throws(() => qs(dir, 'receita', arq(RECEITA)), /só vale no 6.0 Gerar/);
    mudar(dir, { etapa: 'gerar', loteRoteiro: ['CT01', 'CT02', 'CT03'] });
    assert.throws(
      () => qs(dir, 'card', arq({ cenarios: { CT01: { camada: 'tela', porque: 'x' } } })),
      /camada precisa ser[\s\S]*sem camada: CT02, CT03/
    );
    qs(
      dir,
      'card',
      arq({
        cenarios: {
          CT01: { camada: 'app', porque: 'tela' },
          CT02: { camada: 'api', porque: 'regra na API' },
          CT03: { camada: 'nao-verificavel', porque: 'sem impressora' }
        }
      })
    );
    assert.strictEqual(camadaDe(dir, 'CT02').camada, 'api');
    assert.match(qs(dir, 'receita', arq(RECEITA)), /receita gravada \(banco não configurado/);
    const t = await testarReceita(dir, RECEITA, async () => ({
      resultados: [
        { ok: true, itens: [{ numpedido: 5, situacao: 2 }] },
        { ok: true, itens: [{ codfilial: 'CAB' }] }
      ]
    }));
    assert.match(t.texto, /pedido faturado: 1 registro\(s\) \(precisa 2; FALTA\) · colunas: NUMPEDIDO, SITUACAO/);
    assert.deepStrictEqual(t.vazias, ['pedido faturado']);
    assert.strictEqual(estado(dir).receitaAmostra.CT02.NUMPEDIDO, '5');
  }

  // ── camadas e etapa http
  assert.deepStrictEqual(errosDaCamada('api', { etapas: [{ tipo: 'http' }, { tipo: 'flow' }] }), [
    'camada api não abre o app (tire flow/bipe ou mude a camada)'
  ]);
  assert.deepStrictEqual(errosDaCamada('banco', { etapas: [{ tipo: 'consulta' }] }), []);
  assert.match(
    validarCard({ cenarios: { CT09: { camada: 'app', porque: 'x' } } }, ['CT01']).join(),
    /CT09: não está no plano/
  );
  assert.match(
    errosHttp({ nome: 'a', metodo: 'GET', rota: 'api/x' }, 'e1').join(),
    /rota precisa começar com \/[\s\S]*sem status nem esperado/
  );
  let c = conferirHttp(
    { status: 200, esperado: { 'data.situacao': 'FATURADO', 'data.id': '*' }, salvar: { ID: 'data.id' } },
    { status: 200, corpo: { data: { situacao: 'FATURADO', id: 42 } } }
  );
  assert.deepStrictEqual([c.ok, c.salvos], [true, { ID: '42' }]);
  c = conferirHttp(
    { status: 200, esperado: { 'data.situacao': 'FATURADO' } },
    { status: 400, corpo: { data: { situacao: 'ABERTO' } } }
  );
  assert.match(c.texto, /status 400 \(esperado 200\); data.situacao = "ABERTO"/);
  // ${VAR} salvo por um http não conta como faltando; a jornada troca na hora e não abre o app (sem flows de início)
  const rotHttp = {
    etapas: [
      {
        tipo: 'http',
        nome: 'criar',
        metodo: 'POST',
        rota: '/api/x',
        corpo: { p: '${PED}' },
        status: 201,
        salvar: { NOVO: 'data.id' }
      },
      { tipo: 'http', nome: 'ler', metodo: 'GET', rota: '/api/x/${NOVO}', esperado: { 'data.id': 77 } }
    ]
  };
  assert.deepStrictEqual(
    validarRoteiro(
      { ...rotHttp, etapas: rotHttp.etapas.map((e) => JSON.parse(JSON.stringify(e).replace('${PED}', '1'))) },
      { base: os.tmpdir() }
    ),
    []
  );
  const pedidos = [],
    saida = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-http-'));
  const j = await rodarJornada({
    roteiro: rotHttp,
    base: saida,
    saida,
    vars: { PED: '9' },
    inicio: { inicio: '/nao/existe.yaml', voltar: '/nao/existe.yaml' },
    deps: /** @type {any} */ ({
      http: async (e) => (
        pedidos.push(`${e.metodo} ${e.rota} ${JSON.stringify(e.corpo || '')}`),
        e.metodo === 'POST'
          ? { ok: true, status: 201, corpo: { data: { id: 77 } } }
          : { ok: true, status: 200, corpo: { data: { id: 77 } } }
      ),
      maestro: async () => assert.fail('cenário de API não abre o app'),
      prints: () => []
    })
  });
  assert.strictEqual(j.status, 'passou', j.detalhes.join('\n'));
  assert.deepStrictEqual(pedidos, ['POST /api/x {"p":"9"}', 'GET /api/x/77 ""']);
  assert.ok(fs.readFileSync(path.join(saida, 'http-criar.txt'), 'utf8').includes('-- HTTP 201'));

  // ── diagnóstico por regra
  assert.strictEqual(
    classificar(['01 flow a: ok', '02 consulta depois: igual de "antes" (esperado: diferente) ✗'])?.lado,
    'codigo'
  );
  assert.strictEqual(
    classificar(['01 consulta antes: erro no banco (ORA-00904: "X": invalid identifier)'])?.lado,
    'roteiro'
  );
  assert.strictEqual(
    classificar(['00 início do teste: o app não chegou à tela de início (rc 1). x'])?.lado,
    'ambiente'
  );
  assert.strictEqual(classificar(['01 flow a: falhou (rc 1). Element not found']), null); // só a IA decide

  // ── relatório: dados sem IA, arquivos citados conferidos, nível no topo (o seu, com motivo, vence o da IA, que vence o da regra)
  {
    const rel = require('../etapas/07-publicar/relatorio');
    const { montarDados, mdBase } = require('../etapas/07-publicar/relatorio/dados');
    const { iniciarCenario, concluirCenario, registrarAviso } = require('../etapas/06-execucao/cenario');
    const dir = novoDir('#### CT01 – A\n\n#### CT02 – B');
    for (const id of ['CT01', 'CT02']) {
      const ex = iniciarCenario(dir, id, 'abc');
      fs.writeFileSync(path.join(dir, ex.evidencias, `${id}-tela.png`), 'x');
      fs.writeFileSync(path.join(dir, ex.evidencias, 'jornada.txt'), '# Jornada · passou\n01 flow: ok');
      require('../etapas/06-execucao/evidencias').anexarPasta(dir, id);
      concluirCenario(dir, id, 'passou', 'ok');
    }
    registrarAviso(dir, 'CT02', 'o plano fala em 3 casas decimais, a tela mostra 2');
    const dados = montarDados(dir, { chave: 'K-1' });
    assert.deepStrictEqual(
      [dados.veredito.nivel, dados.cenarios.map((c) => c.resultado), dados.cenarios[0].arquivos.sort()],
      ['aprovado-com-ressalvas', ['✅ Passou', '⚠️ Passou com aviso'], ['CT01-tela.png', 'jornada.txt']]
    );
    assert.match(mdBase(dados), /CT02 · B \| — \| ⚠️ Passou com aviso \| ok · o plano fala em 3/);
    const md = path.join(path.dirname(dir), 'rel.md');
    fs.writeFileSync(md, 'Ver `CT01-tela.png` e `CT09-nada.png`.');
    assert.deepStrictEqual(
      rel.registrarRelatorio(dir, md, { nivel: 'aprovado-com-ressalvas', porque: 'CT02 com aviso' }),
      ['CT09-nada.png']
    );
    assert.throws(() => rel.registrarRelatorio(dir, md, { nivel: 'nao-concluido' }), /--nivel/);
    assert.ok(rel.atual(dir));
    assert.ok(rel.compor(dir).startsWith('**Nível: ⚠️ Aprovado com ressalvas** · CT02 com aviso\n\nVer'));
    mudar(dir, {
      relatorio: { ...estado(dir).relatorio, nivelHumano: 'aprovado', motivoHumano: 'casas decimais: o PO aceitou' }
    });
    assert.match(
      rel.compor(dir),
      /^\*\*Nível: ✅ Aprovado\*\* · casas decimais: o PO aceitou\n\n_Pela regra seria ⚠️ Aprovado com ressalvas; nível definido pelo QA._/
    );
  }

  await gerarUmaSessao();
  console.log('ok gerar qa');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// ── 6.0 Gerar: UMA sessão registra card, receita e roteiros; o que faltou é pedido na MESMA conversa (--resume); tudo pronto = zero IA.
// A receita sem jeito volta na conversa do Gerar uma vez; depois o cenário desiste (não executável) e a fila segue.
async function gerarUmaSessao() {
  const { gerar } = require('../etapas/06-execucao/subetapas/6.0-gerar');
  const dir = novoDir('#### CT01 – Tela\n\n#### CT02 – API\n\n#### CT03 – Impressora');
  const area = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-area-'));
  const arq = (nome, o) => {
    const f = path.join(area, nome);
    fs.writeFileSync(f, typeof o === 'string' ? o : JSON.stringify(o));
    return f;
  };
  arq('ct01.yaml', 'appId: ${APP_ID}\n---\n- tapOn: ${NUMPEDIDO}\n');
  const sessoes = [];
  let faz = async () => {};
  maestro.rodar = (d0, o) => {
    sessoes.push({ titulo: o.titulo, sessao: o.sessao || null });
    fs.writeFileSync(path.join(dir, '.ao-vivo.sid'), 'sessao-gerar');
    setTimeout(async () => {
      await faz(o);
      o.aoMudar();
    }, 1);
    return true;
  };
  maestro.rodando = () => false;
  const d = { chave: 'K-1', horaRefresh: '06:00', timeoutMin: 0, banco: null };
  faz = async () => {
    qs(
      dir,
      'card',
      arq('card.json', {
        cenarios: {
          CT01: { camada: 'app', porque: 'tela' },
          CT02: { camada: 'api', porque: 'API' },
          CT03: { camada: 'nao-verificavel', porque: 'sem impressora' }
        }
      })
    );
    qs(
      dir,
      'receita',
      arq('receita.json', {
        papeis: [{ papel: 'pedido', cenarios: ['CT01'], busca: BUSCA }],
        dispensa: ['CT02', 'CT03']
      })
    );
    await testarReceita(dir, { papeis: [{ papel: 'pedido', cenarios: ['CT01'], busca: BUSCA }] }, async () => ({
      resultados: [{ ok: true, itens: [{ numpedido: 3, situacao: 2 }] }]
    }));
    qs(dir, 'roteiro', 'CT01', arq('ct01.json', { etapas: [{ tipo: 'flow', arquivo: 'ct01.yaml' }] })); // ${NUMPEDIDO} validado pela amostra
    // CT02 esquecido: a extensão pede na mesma conversa
  };
  assert.deepStrictEqual(await gerar(dir, d, {}), { ok: true });
  // faltou o CT02: pedido na MESMA conversa (--resume), não numa sessão nova
  assert.deepStrictEqual(
    sessoes.map((s) => [s.titulo, s.sessao]),
    [
      ['QA · Gerando a execução de 3 cenário(s)', null],
      ['QA · Gerar: completando', 'sessao-gerar']
    ]
  );
  assert.strictEqual(estado(dir).gerarSid, 'sessao-gerar');
  faz = async () =>
    qs(
      dir,
      'roteiro',
      'CT02',
      arq('ct02.json', { etapas: [{ tipo: 'http', nome: 'x', metodo: 'GET', rota: '/api/x', status: 200 }] })
    );
  sessoes.length = 0;
  assert.deepStrictEqual(await gerar(dir, d, {}), { ok: true });
  assert.deepStrictEqual(
    sessoes.map((s) => s.sessao),
    ['sessao-gerar']
  ); // o próximo ▶ continua a conversa só para o que falta
  sessoes.length = 0;
  assert.deepStrictEqual(await gerar(dir, d, {}), { ok: true });
  assert.deepStrictEqual(sessoes, []); // tudo pronto: zero IA
  // roteiro de API recusado se abrir o app
  mudar(dir, { etapa: 'gerar', loteRoteiro: ['CT02'] });
  assert.throws(
    () => qs(dir, 'roteiro', 'CT02', arq('ruim.json', { etapas: [{ tipo: 'flow', arquivo: 'ct01.yaml' }] })),
    /camada api/
  );
  mudar(dir, { etapa: null, loteRoteiro: null });

  // Receita sem jeito → correção na conversa do Gerar (--resume) → ainda sem jeito → desiste (não executável).
  const dm = {
    ...d,
    banco: { conexao: 'c', ambiente: 'qas', sensiveis: [] },
    consultarBanco: async (b, sqls) => ({ resultados: sqls.map(() => ({ ok: true, itens: [] })) })
  };
  sessoes.length = 0;
  faz = async () => {};
  const r = await levantarPorReceita(dir, dm, {}, [cenarios(dir).cenarios[0]]);
  assert.deepStrictEqual(r, { ok: true });
  assert.deepStrictEqual(sessoes, [{ titulo: 'QA · Corrigindo a receita de massa', sessao: 'sessao-gerar' }]);
  assert.strictEqual(cenarios(dir).cenarios[0].status, 'nao-executavel');
}
