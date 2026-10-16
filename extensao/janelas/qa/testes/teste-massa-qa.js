// @ts-check
// node janelas/qa/testes/teste-massa-qa.js — regras de massa da execução: "Validar massa" (banco falso), garantia de massa antes do cenário,
// retomada depois do ⏸ (mesmo dia × depois do refresh) e o botão na aba Massa.
const assert = require('assert');
const fs = require('fs'),
  os = require('os'),
  path = require('path');
const { confere } = require('../etapas/05-massa/regras/conferir');
const { validarMassa } = require('../etapas/05-massa/validar');
const { massa, massaAdd } = require('../etapas/05-massa/estado');
const { sincronizar, cenarios } = require('../etapas/02-cenarios/mapa');
const { garantirMassa } = require('../etapas/06-execucao/garantir-massa');
const { retomada } = require('../orquestrador/retomada');
const { estado, mudar } = require('../estado');
const { massaHtml } = require('../abas/massa');

// ── confere: o registro de "dados" ainda volta na consulta (colunas mascaradas não contam)
const it = { dados: { NUMPEDIDO: 77, CPF: '1' } };
assert.strictEqual(confere(it, { colunas: ['numpedido'], itens: [] }), false);
assert.strictEqual(confere(it, { colunas: ['numpedido'], itens: [{ numpedido: 76 }, { numpedido: 77 }] }), true);
assert.strictEqual(confere(it, { colunas: ['numpedido'], itens: [{ numpedido: 76 }] }), false);
assert.strictEqual(
  confere(it, { colunas: ['numpedido', 'cpf'], mascaradas: ['cpf'], itens: [{ numpedido: 77, cpf: '***' }] }),
  true
);
assert.strictEqual(confere(it, { colunas: ['outra'], itens: [{ outra: 1 }] }), true); // sem coluna de dados: basta voltar linha

(async () => {
  const novo = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-massa-'));
    sincronizar(d, '#### CT01 – A\n\nx\n\n#### CT02 – B\n\ny', 1);
    return d;
  };
  const banco = { conexao: 'x', ambiente: 'qas', sqlcl: '', sensiveis: [] };
  let respostas = [],
    consultas = 0;
  const consultarBanco = async (b, sqls) => {
    consultas++;
    return { resultados: sqls.map(() => ({ ok: true, colunas: ['n'], itens: respostas.shift() || [] })) };
  };

  // ── validarMassa: true → válida (medida agora), false → inválida, sem consulta ou sem banco → null (não muda)
  let dir = novo();
  const m1 = massaAdd(dir, { papel: 'p', cenarios: ['CT01'], dados: { n: 1 }, consulta: 'SELECT n FROM t' }),
    m2 = massaAdd(dir, { papel: 'p', cenarios: ['CT01'], dados: { n: 2 }, consulta: 'SELECT n FROM t' }),
    m3 = massaAdd(dir, { papel: 'p', cenarios: ['CT01'], dados: { n: 3 } });
  respostas = [[{ n: 1 }], [{ n: 9 }]];
  assert.deepStrictEqual(await validarMassa(dir, { banco, consultarBanco }, [m1, m2, m3]), {
    [m1]: true,
    [m2]: false,
    [m3]: null
  });
  assert.deepStrictEqual(
    massa(dir).itens.map((i) => i.estado),
    ['valida', 'invalida', 'valida']
  );
  assert.strictEqual(consultas, 1); // uma sessão só para todos os itens
  assert.deepStrictEqual(await validarMassa(dir, { banco: { ...banco, ambiente: 'producao' }, consultarBanco }, [m1]), {
    [m1]: null
  });

  // ── garantirMassa: válida segue; inválida → renova só a do cenário; 2ª seguida → Etapa 5 para os pendentes; sem jeito → não executável
  const maestro = require('../../../infra/agentes/maestro');
  const etapa5 = [];
  let adicionar = true;
  maestro.rodar = (d, o) => {
    etapa5.push(o.prompt.match(/- CT\d+/g).join(','));
    setTimeout(() => {
      if (adicionar)
        for (const c of o.prompt.match(/CT\d+/g).filter((x, i, l) => l.indexOf(x) === i))
          massaAdd(d, { papel: 'novo', cenarios: [c], dados: { n: 5 }, consulta: 'SELECT n FROM t' });
      o.aoMudar();
    }, 1);
    return true;
  };
  maestro.rodando = () => false;
  dir = novo();
  massaAdd(dir, { papel: 'p', cenarios: ['CT01', 'CT02'], dados: { n: 1 }, consulta: 'SELECT n FROM t' });
  const d = { chave: 'K', horaRefresh: '06:00', timeoutMin: 0, banco, consultarBanco },
    seguidas = { invalidas: 0 },
    [c1, c2] = cenarios(dir).cenarios;
  respostas = [[{ n: 1 }]];
  assert.strictEqual((await garantirMassa(dir, d, {}, c1, seguidas)).itens.length, 1);
  assert.deepStrictEqual(etapa5, []);
  respostas = [[]]; // o registro sumiu
  let g = await garantirMassa(dir, d, {}, c1, seguidas);
  assert.deepStrictEqual([g.itens.map((i) => i.papel), etapa5, seguidas.invalidas], [['novo'], ['- CT01'], 1]);
  respostas = [[]];
  etapa5.length = 0;
  g = await garantirMassa(dir, d, {}, c2, seguidas); // 2º seguido: Etapa 5 para os pendentes (CT01 e CT02)
  assert.deepStrictEqual([etapa5, seguidas.invalidas, g.itens.length], [['- CT01,- CT02'], 0, 1]);
  respostas = [[]];
  adicionar = false; // a Etapa 5 não acha nem gera
  g = await garantirMassa(dir, d, {}, c2, seguidas);
  assert.ok(g.naoExecutavel);
  assert.strictEqual(cenarios(dir).cenarios[1].status, 'nao-executavel');
  const semNada = novo();
  assert.deepStrictEqual(await garantirMassa(semNada, d, {}, cenarios(semNada).cenarios[0], seguidas), { itens: [] }); // não precisa de massa

  // ── retomada: só depois de ⏸; mesmo dia × atravessou o refresh
  assert.strictEqual(retomada(dir, d), null);
  const hoje = (h, m = 0) => {
    const x = new Date();
    x.setHours(h, m, 0, 0);
    return x;
  };
  mudar(dir, { pausadoEm: hoje(9).toISOString() });
  assert.strictEqual(retomada(dir, d, hoje(9, 40)), 'mesmo-dia');
  assert.strictEqual(estado(dir).pausadoEm, null);
  mudar(dir, { pausadoEm: new Date(hoje(17).getTime() - 86400000).toISOString() }); // ontem 17h, refresh 06h
  assert.strictEqual(retomada(dir, d, hoje(9)), 'outro-dia');

  // ── botão na aba Massa: habilitado com consulta, desabilitado sem
  const html = massaHtml(dir);
  assert.ok(/data-acao="qaMassaValidar"[^>]*>Validar massa/.test(html));
  const h3 = massaHtml(
    (() => {
      const x = novo();
      massaAdd(x, { papel: 'p', cenarios: ['CT01'], dados: {} });
      return x;
    })()
  );
  assert.ok(/qaMassaValidar[^>]* disabled>Validar massa/.test(h3));
  console.log('ok massa qa');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
