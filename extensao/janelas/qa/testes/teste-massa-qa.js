// @ts-check
// node janelas/qa/testes/teste-massa-qa.js — regras de massa da execução: "Validar massa" (banco falso), garantia de massa antes do cenário,
// retomada depois do ⏸ (mesmo dia × depois do refresh), o botão na aba Roteiro e a pré-condição sem Claude (login HTTP).
const assert = require('assert');
// Nunca o ~/.wms-testes.env real: sem credencial, a pré-condição cai no caminho do Claude simulado.
process.env.WMS_ENV_FILE = '/nao-existe/.wms-testes.env';
for (const k of Object.keys(process.env)) if (k.startsWith('WMS_') && k !== 'WMS_ENV_FILE') delete process.env[k];
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
const { roteiroHtml } = require('../abas/roteiro');

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

  // ── pré-condição sem Claude: login HTTP com a requisição da skill; recusa com o corpo do erro; sem credencial → null (vai para o Claude)
  const { loginApi } = require('../etapas/04-precondicao/dependencias');
  const chamadas = [];
  const fetchOrig = global.fetch;
  let resposta = { status: 200, corpo: { matricula: 700229 } };
  global.fetch = /** @type {any} */ (
    async (url, o) => {
      chamadas.push({ url, headers: o.headers, body: JSON.parse(o.body) });
      return { ok: resposta.status === 200, status: resposta.status, text: async () => JSON.stringify(resposta.corpo) };
    }
  );
  const env = { WMS_API_LOGIN: 'U1', WMS_API_SENHA: 's3', WMS_FILIAL: 'Cab' };
  assert.deepStrictEqual(await loginApi({}), null);
  assert.deepStrictEqual(await loginApi(env), { ok: true, motivo: 'login na API ok (matrícula 700229, usuário U1)' });
  assert.deepStrictEqual(
    [chamadas[0].url, chamadas[0].headers['X-Api-Version'], chamadas[0].headers.filial, chamadas[0].body],
    ['http://localhost:5111/api/LoginUsuario', '1.0', 'Cab', { login: 'U1', senha: 's3', production: false }]
  );
  resposta = { status: 400, corpo: { message: 'Senha bloqueada por tentativas' } };
  const rec = await loginApi(env);
  assert.ok(!rec.ok && rec.motivo.includes('HTTP 400: Senha bloqueada') && !rec.motivo.includes('s3'), rec.motivo);
  global.fetch = fetchOrig;
  const { preCondicao } = require('../etapas/04-precondicao');
  const titulos = [];
  maestro.rodar = (dd, o) => (titulos.push(o.titulo), setTimeout(o.aoMudar, 1), true);
  const dp = novo(),
    alertas = [];
  const base = {
    chave: 'K',
    horaRefresh: '06:00',
    healthCheck: async () => ({ ok: true }),
    alertar: (t) => alertas.push(t)
  };
  assert.strictEqual(
    await preCondicao(dp, { ...base, loginApi: async () => ({ ok: false, motivo: 'senha bloqueada' }) }, {}),
    false
  );
  assert.ok(alertas[0].includes('senha bloqueada') && !titulos.length); // falha em 1 s, sem Claude
  assert.strictEqual(
    await preCondicao(dp, { ...base, loginApi: async () => ({ ok: true, motivo: 'login ok' }) }, {}),
    true
  );
  assert.deepStrictEqual([estado(dp).precondicao.via, titulos], ['api', []]);
  // ── aba Roteiro (componentes/roteiros.js): R01 por cenário com roteiro ou massa; aberto mostra o roteiro já com a massa anexada (sem bloco de massa)
  const dr = novo();
  massaAdd(dr, { papel: 'pedido', cenarios: ['CT01'], dados: { NUMPEDIDO: 77 }, consulta: 'SELECT n FROM t' });
  massaAdd(dr, { papel: 'pedido', cenarios: ['CT02'], dados: { NUMPEDIDO: 88 }, consulta: 'SELECT n FROM t' });
  const c1r = cenarios(dr).cenarios[0];
  fs.mkdirSync(path.join(dr, 'roteiros'));
  fs.writeFileSync(
    path.join(dr, 'roteiros', 'CT01.json'),
    JSON.stringify({
      descricao: 'Bipa a UMA e confere o vínculo',
      hash: c1r.hash,
      variaveis: { CODIGO: '${NUMPEDIDO}' },
      etapas: [
        { tipo: 'flow', arquivo: 'CT01.yaml' },
        { tipo: 'bipe', codigo: '${CODIGO}' },
        { tipo: 'consulta', nome: 'antes', sql: 'SELECT 1 FROM t WHERE n = :n', binds: { n: '${CODIGO}' } }
      ]
    })
  );
  const hr = roteiroHtml(dr);
  assert.ok(
    /<span class="cid">R01<\/span><span class="ctit">Bipa a UMA e confere o vínculo <span class="rt-tag">CT01/.test(hr),
    hr
  );
  assert.ok(hr.includes('Pronto') && hr.includes('CT01.yaml') && hr.includes('SELECT 1 FROM t WHERE n = :n'));
  assert.ok(hr.includes('bipe <b>77</b>') && hr.includes('<b>CODIGO</b> = 77') && !hr.includes('${CODIGO}')); // massa anexada ao roteiro
  assert.ok(
    /R02<\/span><span class="ctit">B <span class="rt-tag">CT02<\/span><\/span><span class="cst pendente">Sem roteiro/.test(
      hr
    )
  ); // só massa
  assert.ok(hr.includes('Massa já levantada: M2'));
  assert.ok(!hr.includes('Validar massa') && !hr.includes('>Massa (') && !hr.includes('class="papel-massa"')); // sem o bloco de massa

  // ── limite de sessão do Claude: horário em que volta (hora local, o próximo)
  const { voltaDoLimite } = require('../orquestrador/zero-skip');
  const base9 = hoje(9),
    v = voltaDoLimite("You've hit your session limit · resets 11:30am (America/Recife)", base9);
  assert.deepStrictEqual([v.getHours(), v.getMinutes(), v.getDate()], [11, 30, base9.getDate()]);
  assert.strictEqual(voltaDoLimite('resets 2pm', base9).getHours(), 14);
  assert.strictEqual(voltaDoLimite('resets 8am', base9).getDate(), new Date(base9.getTime() + 86400000).getDate()); // já passou: amanhã
  assert.strictEqual(voltaDoLimite('API Error 500', base9), null);

  // ── aprovação de UPDATE idempotente: duas aprovações ao mesmo tempo rodam o lote uma vez só
  const { proporMassa, aplicarProposta } = require('../etapas/05-massa/proposta');
  const dq = novo();
  proporMassa(dq, {
    papel: 'p',
    cenarios: ['CT01'],
    sql: 'UPDATE t SET a = 1 WHERE id = 1',
    desfazer: 'UPDATE t SET a = 2 WHERE id = 1'
  });
  let lotes = 0;
  const exec = {
    banco,
    executarSql: async () => (lotes++, await new Promise((r) => setTimeout(r, 20)), { ok: true, saida: '' })
  };
  const [a1, a2] = await Promise.all([aplicarProposta(dq, exec), aplicarProposta(dq, exec)]);
  assert.deepStrictEqual([lotes, [a1.ok, a2.ok].sort()], [1, [false, true]]);
  console.log('ok massa qa');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
