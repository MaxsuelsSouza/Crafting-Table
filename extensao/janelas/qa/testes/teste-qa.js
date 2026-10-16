// @ts-check
// node extensao/janelas/qa/testes/teste-qa.js
const assert = require('assert');
// Nunca o ~/.wms-testes.env real: sem credencial, a pré-condição cai no caminho do Claude simulado.
process.env.WMS_ENV_FILE = '/nao-existe/.wms-testes.env';
for (const k of Object.keys(process.env)) if (k.startsWith('WMS_') && k !== 'WMS_ENV_FILE') delete process.env[k];
const fs = require('fs'),
  os = require('os'),
  path = require('path');
// Conhecimentos de teste com os flows de início já validados (a etapa que os escreve tem teste em teste-jornada-qa.js).
process.env.QA_CONHECIMENTOS = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-conhec-'));
{
  const f = path.join(process.env.QA_CONHECIMENTOS, 'inicio.yaml');
  fs.writeFileSync(f, 'appId: x\n---\n- launchApp\n');
  for (const chave of ['inicio', 'voltar-inicio'])
    require('../conhecimentos').adicionar({ tipo: 'flow', chave, arquivo: f });
}
const qa = require('../motor');
const { ehQA, candidatas, temPlano, versionar, procurar } = qa._teste;

assert.ok(['[QA] Planejamento dos Casos de Testes', 'qa - testes', 'Teste Q.A.', 'Plano de QA'].every(ehQA));
assert.ok(!['Ajustar quadro', 'Aqa', 'Backend: endpoint'].some(ehQA));
const subs = [
  { resumo: '[QA] Execução' },
  { resumo: 'QA planejamento de testes' },
  { resumo: 'Backend' },
  { resumo: '[QA] Teste de Qualidade' }
];
assert.deepStrictEqual(
  candidatas(subs).map((s) => s.resumo),
  ['[QA] Teste de Qualidade', 'QA planejamento de testes', '[QA] Execução']
);
assert.ok(temPlano('#### CT01 – Validar') && temPlano('**Dado que** o pedido') && temPlano('CT-02'));
{
  const { cenariosDo } = qa._teste;
  assert.strictEqual(
    cenariosDo('**CT01 — 50 ups** · RF01 · t14\n**Dado que** x\n**CT02 — Outro** · RF02\n**Dado que** y').length,
    2
  );
}
assert.ok(!temPlano('Sub-tarefa criada automaticamente para planejamento de testes de QA.'));

// ADF → Markdown da descrição: no adaptador do Jira (testes/teste-provedor.js); aqui as subtarefas já chegam em Markdown.
const PLANO_MD = '#### CT01 – Validar\n\n**Dado que** x\n\n- a\n\n| Cenário | Status |\n| --- | --- |\n| CT01 | ok |';

// Versões: mesma descrição não gera versão nova; descrição diferente gera v2.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
const s = { key: 'WMS-2', resumo: '[QA] Planejamento dos Casos de Testes', updated: '2026-10-10', md: 'CT01' };
assert.deepStrictEqual(
  [versionar(dir, s).v, versionar(dir, s).nova, versionar(dir, { ...s, md: 'CT01 CT02' }).v],
  [1, false, 2]
);
assert.ok(fs.existsSync(path.join(dir, 'planejamento-qa-v2.md')));

// Mapa de cenários: parse dos títulos CT e sincronização entre versões do plano.
const { cenariosDo, sincronizar } = qa._teste;
const plano1 =
  '## 🧪 Cenários de Teste\n\n#### CT01 – Validar login\n\n**Dado que** o usuário existe\n**Quando** entra\n**Então** vê a home\n\n📌 Validações:\n✔ x\n\n#### CT-2: Senha errada\n\n**Dado que** a senha é errada\n\n## ✅ Critérios';
const c1 = cenariosDo(plano1);
assert.deepStrictEqual(
  c1.map((c) => [c.id, c.titulo]),
  [
    ['CT01', 'Validar login'],
    ['CT02', 'Senha errada']
  ]
);
assert.strictEqual(c1[0].resumo, 'Dado que o usuário existe · Quando entra · Então vê a home');
assert.ok(!c1[1].texto.includes('Critérios')); // o corpo para no próximo título de nível maior
// Formato em negrito (plano real do WMS-14751): **Cenário N: …** e **Exploratório N: …**, Gherkin em lista.
const plano3 =
  '## Cenários principais\n\n**Cenário 1: Avançar desabilitado (CA01)**\n\n- Dado que o operador identificou o pedido\n- Quando a tela abre\n- Então o botão está desabilitado\n\n**Cenário 2: Parcial**\n\n- Dado o pedido\n\n---\n\n## Cenários exploratórios\n\n**Exploratório 1: Um produto**\n\n- Quando bipa\n\n## Riscos\n- texto';
const c3 = cenariosDo(plano3);
assert.deepStrictEqual(
  c3.map((c) => [c.id, c.titulo]),
  [
    ['CT01', 'Avançar desabilitado (CA01)'],
    ['CT02', 'Parcial'],
    ['EX01', 'Um produto']
  ]
);
assert.strictEqual(
  c3[0].resumo,
  'Dado que o operador identificou o pedido · Quando a tela abre · Então o botão está desabilitado'
);
assert.ok(!c3[1].texto.includes('---') && !c3[2].texto.includes('Riscos'));
assert.deepStrictEqual(cenariosDo('**Dado que** x\n**Cenário**: sem número'), []); // negrito comum não vira cenário
const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
assert.deepStrictEqual(sincronizar(d3, plano1, 1), { total: 2, novos: 2, mudaram: 0, sairam: 0 });
// CT01 rodou e passou; v2 muda o CT01, tira o CT02 e cria o CT03.
const r = qa.cenarios(d3);
r.cenarios[0].status = 'passou';
r.cenarios[0].execucoes = [{ status: 'passou', inicio: '2026-10-10T12:00:00Z' }];
fs.writeFileSync(path.join(d3, qa.CENARIOS), JSON.stringify(r));
const plano2 = '#### CT01 – Validar login com SSO\n**Dado que** x\n#### CT03 – Novo\n**Dado que** y';
assert.deepStrictEqual(sincronizar(d3, plano2, 2), { total: 2, novos: 1, mudaram: 1, sairam: 1 });
const st = Object.fromEntries(qa.cenarios(d3).cenarios.map((c) => [c.id, c.arquivado ? 'arquivado' : c.status]));
assert.deepStrictEqual(st, { CT01: 'desatualizado', CT03: 'pendente', CT02: 'arquivado' });
assert.ok(
  qa.refazer(d3, 'CT01') &&
    qa.cenarios(d3).cenarios[0].status === 'pendente' &&
    qa.cenarios(d3).cenarios[0].execucoes.length === 1
);
assert.ok(!qa.refazer(d3, 'CT02')); // arquivado não volta
// não executado por decisão do usuário: exige motivo, sai da fila, não bloqueia a publicação, refazer devolve
assert.ok(!qa.dispensar(d3, 'CT01', '  ') && !qa.dispensar(d3, 'CT02', 'x'));
assert.ok(qa.dispensar(d3, 'CT03', 'fora do escopo', 'excluir'));
{
  const c = qa.cenarios(d3).cenarios.find((x) => x.id === 'CT03');
  assert.ok(
    c.status === 'dispensado' &&
      c.dispensa.motivo === 'fora do escopo' &&
      c.dispensa.em &&
      c.dispensa.tipo === 'excluir'
  );
  assert.ok(!qa.RESULTADOS.includes(c.status));
}
assert.ok(!qa.cenarios(d3).cenarios.some((c) => c.id === 'CT03' && ['pendente', 'desatualizado'].includes(c.status)));
assert.ok(
  qa.podePublicar([{ status: 'passou' }, { status: 'dispensado' }]) && !qa.podePublicar([{ status: 'dispensado' }])
);
assert.ok(
  qa.dispensar(d3, 'CT01', 'sem como testar', 'nao-testavel') &&
    qa.cenarios(d3).cenarios.find((x) => x.id === 'CT01').dispensa.tipo === 'nao-testavel' &&
    qa.refazer(d3, 'CT01')
);
assert.ok(
  qa.refazer(d3, 'CT03') &&
    qa.cenarios(d3).cenarios.find((x) => x.id === 'CT03').status === 'pendente' &&
    !qa.cenarios(d3).cenarios.find((x) => x.id === 'CT03').dispensa
);
assert.ok(!qa.html(d3).includes('Cenários · plano')); // sem aprovação, a lista não aparece

// Ao vivo: mais recente em cima, agrupado por etapa (título no topo do bloco).
const { recentesPrimeiro } = require('../../../componentes/ao-vivo')._teste;
const vivoL = [
  { tipo: 'etapa', texto: 'E1' },
  { tipo: 'acao', texto: 'a1' },
  { tipo: 'acao', texto: 'a2' },
  { tipo: 'etapa', texto: 'E2' },
  { tipo: 'fim', texto: 'b1' }
];
assert.strictEqual(
  recentesPrimeiro(vivoL)
    .map((x) => x.texto)
    .join(','),
  'E2,b1,E1,a2,a1'
);
assert.strictEqual(
  recentesPrimeiro([
    { tipo: 'acao', texto: 'x' },
    { tipo: 'acao', texto: 'y' }
  ])
    .map((x) => x.texto)
    .join(','),
  'y,x'
);

(async () => {
  // procurar: a subtarefa com cenários vence a de nome exato vazia.
  const api = async () => [
    { key: 'WMS-3', resumo: '[QA] Teste de Qualidade', md: 'Sub-tarefa criada automaticamente' },
    { key: 'WMS-4', resumo: 'QA planejamento', md: PLANO_MD },
    { key: 'WMS-5', resumo: 'Backend', md: '' }
  ];
  const r = await procurar(api, 'WMS-1');
  assert.deepStrictEqual([r.plano.key, r.qa.map((x) => x.key)], ['WMS-4', ['WMS-3', 'WMS-4']]);

  // Novo fluxo: a IA escreve qa-plano.md local; a extensão publica no provedor. Prompts sem MCP/ferramentas do provedor.
  for (const pr of [qa.promptCriar('/tmp/qa'), qa.promptMudanca('/tmp/qa', 'trocar CT02')]) {
    assert.ok(!/mcp__|Atlassian|editJiraIssue|createJiraIssue|jira-qa-planner/i.test(pr), 'prompt sem MCP');
    assert.ok(pr.includes('/tmp/qa/qa-plano.md') && pr.includes('.ticket-contexto.md') && pr.includes('#### CT01'));
  }
  assert.ok(qa.promptMudanca('/tmp/qa', 'trocar CT02').includes('trocar CT02'));
  assert.ok(!qa.FERRAMENTAS_PLANO.some((f) => /mcp__|Skill/.test(f)));
  const ctx = qa.contextoTicket({
    key: 'WMS-1',
    resumo: 'X',
    status: 'Novo',
    tipo: 'Story',
    descricao: '<p>Regra &amp; A</p>',
    subtarefas: [{ key: 'WMS-2', resumo: 'Dev', status: 'Novo' }],
    comentarios: [{ autor: 'Ana', data: 'hoje', corpo: '<p>ok</p>' }]
  });
  assert.ok(
    ctx.includes('# WMS-1 · X') && ctx.includes('Regra & A') && ctx.includes('WMS-2 · Dev') && ctx.includes('Ana')
  );
  const dp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pub-'));
  const chamadas = [];
  const falso = (filhos, subtarefas = true) => ({
    chave: 'WMS-1',
    subtarefas,
    filhos: async () => filhos,
    criarSubtarefa: async (o) => {
      chamadas.push(['criar', o]);
      return { key: 'WMS-9' };
    },
    atualizarDescricao: async (k, md) => {
      chamadas.push(['atualizar', k, md]);
      return {};
    },
    comentar: async (md) => {
      chamadas.push(['comentar', md]);
    }
  });
  await assert.rejects(qa.publicarPlano(dp, falso([])), /qa-plano\.md/); // IA não gravou
  fs.writeFileSync(path.join(dp, 'qa-plano.md'), PLANO_MD);
  assert.deepStrictEqual(await qa.publicarPlano(dp, falso([{ key: 'WMS-5', resumo: 'Backend', md: '' }])), {
    modo: 'criada',
    key: 'WMS-9'
  });
  assert.deepStrictEqual(
    [chamadas[0][0], chamadas[0][1].resumo, chamadas[0][1].descricao],
    ['criar', '[QA] Planejamento dos Casos de Testes', PLANO_MD]
  );
  chamadas.length = 0;
  assert.deepStrictEqual(
    await qa.publicarPlano(
      dp,
      falso([{ key: 'WMS-3', resumo: '[QA] Teste de Qualidade', md: 'Sub-tarefa criada automaticamente' }])
    ),
    { modo: 'atualizada', key: 'WMS-3' }
  );
  assert.deepStrictEqual(chamadas, [['atualizar', 'WMS-3', PLANO_MD]]);
  chamadas.length = 0;
  assert.deepStrictEqual(await qa.publicarPlano(dp, falso([], false)), { modo: 'comentario', key: 'WMS-1' }); // sem subtarefas
  assert.deepStrictEqual(
    [chamadas.length, chamadas[0][0], chamadas[0][1].includes('CT01 – Validar')],
    [1, 'comentar', true]
  );
  // Sem subtarefas no provedor, o arquivo local é a fonte: verificarPlano acha o plano nele.
  await qa.verificarPlano(dp, 'WMS-1', async () => []);
  assert.deepStrictEqual(
    [qa.estado(dp).fase, qa.estado(dp).subtarefa, qa.estado(dp).versao],
    ['plano_encontrado', 'WMS-1', 1]
  );

  // verificarPlano: sem plano → sem_plano; com plano → plano_ok + v1 + Ao vivo.
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  assert.strictEqual((await qa.verificarPlano(d2, 'WMS-1', async () => []), qa.estado(d2)).fase, 'sem_plano');
  // Plano achado espera aprovação (cenários só aparecem depois); aprovado, o ▶ seguinte já lista sem pedir de novo.
  await qa.verificarPlano(d2, 'WMS-1', api);
  assert.deepStrictEqual(
    [qa.estado(d2).fase, qa.estado(d2).versao, qa.cenarios(d2).cenarios.length],
    ['plano_encontrado', 1, 0]
  );
  assert.ok(qa.html(d2).includes('Planejamento encontrado · WMS-4 · v1') && !qa.html(d2).includes('Dar início'));
  assert.ok(qa.aprovar(d2) && !qa.aprovar(d2));
  assert.deepStrictEqual([qa.estado(d2).fase, qa.cenarios(d2).cenarios.map((c) => c.id)], ['plano_aprovado', ['CT01']]);
  assert.ok(qa.html(d2).includes('Dar início') && qa.html(d2).includes('Cenários · plano v1'));
  const h2 = qa.html(d2);
  assert.ok(h2.indexOf('Planejamento aprovado') > h2.indexOf('id="aoVivo"')); // cartão do plano abaixo do Ao vivo
  await qa.verificarPlano(d2, 'WMS-1', api);
  assert.strictEqual(qa.estado(d2).fase, 'plano_aprovado');
  await qa.verificarPlano(d2, 'WMS-1', async () => {
    throw new Error('401');
  });
  assert.strictEqual(qa.estado(d2).fase, 'erro');
  console.log('ok qa');

  // ── Fases 3 a 5: massa, execução, qa-state e o ▶ inteiro (Claude e preparar-ambiente.py simulados).
  process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-home-')); // trava do ambiente fica aqui
  const { ultimoRefresh, semMassa, iniciarCenario, fila, papeisDe } = qa._teste;
  // Comandos das Configurações que bastam para o ambiente: API (dotnet/5111) e Metro (react-native start/8081).
  const cmds = [
    { nome: 'Backend', comando: 'dotnet run --project FCxLabs.WMS.Api' },
    { nome: 'Metro', comando: 'npx react-native start --port 8081' },
    { nome: 'Lint', comando: 'yarn lint' }
  ];
  assert.deepStrictEqual(
    Object.values(papeisDe(cmds)).map((b) => b?.nome),
    ['Backend', 'Metro']
  );
  assert.deepStrictEqual(Object.values(papeisDe([cmds[2]])), [null, null]);
  // Caso real: "Start" (yarn start = yarn android) vinha antes de "Metro" e era escolhido como Metro.
  const reais = [
    { nome: 'API - Staging', comando: 'dotnet run --project FCxLabs.WMS.Api' },
    { nome: 'Start', comando: 'yarn start' },
    { nome: 'Metro', comando: 'yarn metro' }
  ];
  assert.deepStrictEqual(
    Object.values(papeisDe(reais)).map((b) => b?.nome),
    ['API - Staging', 'Metro']
  );
  assert.strictEqual(papeisDe([{ nome: 'Start', comando: 'yarn start' }]).metro, null); // sem Metro de verdade: cai no script da skill
  const ag = new Date(2026, 9, 10, 5, 0); // 05:00, refresh às 06:00 → o último foi ontem 06:00
  assert.deepStrictEqual(
    [ultimoRefresh(ag, '06:00').getDate(), ultimoRefresh(new Date(2026, 9, 10, 13, 0), '06:00').getDate()],
    [9, 10]
  );
  const d4 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  qa.massaAdd(d4, { papel: 'pedido', cenarios: ['CT01'], dados: { N: 1 } });
  const m = qa.massa(d4);
  m.itens[0].medidaEm = new Date(2026, 9, 10, 4, 0).toISOString();
  fs.writeFileSync(path.join(d4, qa.MASSA), JSON.stringify(m));
  assert.deepStrictEqual(semMassa(d4, ['CT01', 'CT02'], ag, '06:00'), ['CT02']); // mesma janela de refresh: reaproveita
  assert.deepStrictEqual(semMassa(d4, ['CT01'], new Date(2026, 9, 10, 7, 0), '06:00'), ['CT01']); // banco renovado às 06:00: venceu
  qa.massaEstado(d4, 'M1', 'consumida');
  assert.deepStrictEqual(semMassa(d4, ['CT01'], ag, '06:00'), ['CT01']);
  assert.throws(() => qa.massaEstado(d4, 'M1', 'xx'));

  // Execução: descartado volta ao status de antes; concluir só em execução.
  sincronizar(d4, plano1, 1);
  iniciarCenario(d4, 'CT01', { backend: 'a' });
  assert.throws(() => qa.concluirCenario(d4, 'CT02', 'passou'));
  qa.concluirCenario(d4, 'CT01', 'descartado', 'pausa');
  assert.deepStrictEqual(
    [qa.cenarios(d4).cenarios[0].status, qa.cenarios(d4).cenarios[0].execucoes[0].status],
    ['pendente', 'descartado']
  );

  // Refazer em lote: só falhou/bloqueado entram; cada resposta devolve o cenário à fila com a instrução e avança.
  const dRef = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-ref-'));
  sincronizar(dRef, plano1, 1);
  iniciarCenario(dRef, 'CT01', null);
  qa.concluirCenario(dRef, 'CT01', 'falhou', 'x');
  iniciarCenario(dRef, 'CT02', null);
  qa.concluirCenario(dRef, 'CT02', 'bloqueado', 'y');
  assert.strictEqual(qa.iniciarRefazerLote(dRef), 2);
  assert.strictEqual(qa.loteRefazer(dRef).opcoes.length, 3);
  assert.deepStrictEqual(qa.responderRefazer(dRef, 'usar outra massa'), { fim: false, id: 'CT01' });
  assert.strictEqual(qa.loteRefazer(dRef).cenario.id, 'CT02');
  assert.deepStrictEqual(qa.responderRefazer(dRef, 'tentar de novo'), { fim: true, id: 'CT02' });
  assert.strictEqual(qa.loteRefazer(dRef), null);
  assert.deepStrictEqual(
    qa.cenarios(dRef).cenarios.map((c) => [c.status, c.instrucao]),
    [
      ['pendente', 'usar outra massa'],
      ['pendente', 'tentar de novo']
    ]
  );

  // qa-state (CLI) pela QA_DIR.
  const { execFileSync } = require('child_process');
  const cli = (...a) =>
    execFileSync(path.join(__dirname, '..', 'bin', 'qa-state'), a, {
      env: { ...process.env, QA_DIR: d4 },
      stdio: ['ignore', 'pipe', 'pipe']
    })
      .toString()
      .trim();
  const ex = iniciarCenario(d4, 'CT02', null);
  const print = path.join(d4, 'p.png');
  fs.writeFileSync(print, 'x');
  cli('evidencia', 'CT02', print);
  assert.ok(fs.existsSync(path.join(d4, ex.evidencias, 'p.png')));
  cli('cenario', 'CT02', 'concluir', '--status', 'falhou', '--nota', 'erro 500');
  assert.deepStrictEqual(
    [qa.cenarios(d4).cenarios[1].status, qa.cenarios(d4).cenarios[1].execucoes[0].nota],
    ['falhou', 'erro 500']
  );
  // massa add só na Etapa 4 (estado.etapa = massa); fora dela o qa-state recusa, mesmo que o modelo desobedeça.
  assert.throws(() => cli('massa', 'add', '--papel', 'x', '--cenarios', 'CT01'), /só vale na Etapa 4/);
  qa.mudar(d4, { etapa: 'massa' });
  assert.strictEqual(cli('massa', 'add', '--papel', 'x', '--cenarios', 'CT01,CT02', '--dados', '{"a":1}'), 'M2');
  qa.mudar(d4, { etapa: null });
  const pc = qa._teste.promptCenario('WMS-1', { id: 'CT01', titulo: 'A', texto: '' }, {}, []);
  assert.ok(
    !/levante e registre|registre com massa add/.test(pc) &&
      pc.includes('sem-massa') &&
      pc.includes('nunca procure nem registre massa')
  );
  assert.throws(() => cli('cenario', 'CT02', 'concluir', '--status', 'passou')); // só cenário em execução

  // ▶ inteiro: plano com 2 CTs, ambiente simulado, massa levantada, CT01 passa, pausa durante o CT02 → descartado; retomada termina.
  const maestro = require('../../../infra/agentes/maestro');
  const back = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-back-'));
  fs.mkdirSync(path.join(back, 'testes-funcionais'));
  fs.writeFileSync(
    path.join(back, 'testes-funcionais', 'preparar-ambiente.py'),
    'import json\nprint("[ OK  ] API respondendo")\nprint(json.dumps({"ref":"v9","backend":"","mobile":"","parou_em":None,"pendentes":0,"itens":[]}))\n'
  );
  const d5 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  const apiPlano = async () => [
    {
      key: 'WMS-9',
      resumo: '[QA] Planejamento dos Casos de Testes',
      updated: 'x',
      md: '#### CT01 – A\n\n#### CT02 – B'
    }
  ];
  const prompts = [];
  let pausarNo = 'CT02';
  maestro.rodar = (dir, o) => {
    prompts.push(o.titulo);
    setTimeout(() => {
      const env = { ...process.env, QA_DIR: o.env.QA_DIR };
      if (/Pré-condição/.test(o.titulo))
        execFileSync(
          path.join(__dirname, '..', 'bin', 'qa-state'),
          ['precondicao', '--status', 'ok', '--nota', 'login confirmado'],
          { env }
        );
      if (/massa/.test(o.titulo))
        execFileSync(
          path.join(__dirname, '..', 'bin', 'qa-state'),
          ['massa', 'add', '--papel', 'p', '--cenarios', 'CT01,CT02', '--dados', '{}'],
          { env }
        );
      const id = o.titulo.match(/CT\d+/)?.[0];
      if (id && id === pausarNo) qa.pausar(dir);
      else if (id) {
        const ev = path.join(os.tmpdir(), `ev-${process.pid}-${id}.txt`);
        fs.writeFileSync(ev, 'ok'); // passou exige evidência anexada
        execFileSync(path.join(__dirname, '..', 'bin', 'qa-state'), ['evidencia', id, ev], { env });
        execFileSync(path.join(__dirname, '..', 'bin', 'qa-state'), ['cenario', id, 'concluir', '--status', 'passou'], {
          env
        });
      }
      o.aoMudar();
    }, 5);
    return true;
  };
  maestro.rodando = () => false;
  maestro.parar = () => {};
  const deps = {
    chave: 'WMS-1',
    backend: back,
    filhos: apiPlano,
    horaRefresh: '06:00',
    confirmar: async () => true,
    healthCheck: async () => ({ ok: true }),
    gerar: false, // caminho cenário a cenário (o 6.0 Gerar tem teste próprio em teste-gerar-qa.js)
    alertar: (t) => alertas.push(t)
  };
  const alertas = [];
  await qa.executar(d5, deps); // sem plano aprovado não executa
  assert.deepStrictEqual(prompts, []);
  await qa.verificarPlano(d5, 'WMS-1', apiPlano);
  qa.aprovar(d5);
  await qa.executar(d5, deps);
  const st5 = () => qa.cenarios(d5).cenarios.map((c) => c.status);
  assert.deepStrictEqual(st5(), ['passou', 'pendente']);
  assert.strictEqual(qa.cenarios(d5).cenarios[1].execucoes[0].status, 'descartado');
  assert.deepStrictEqual(prompts, [
    'QA · Pré-condição · login',
    'QA · Levantando massa de dados',
    'QA · CT01 · A',
    'QA · CT02 · B'
  ]);
  assert.strictEqual(qa.ambiente(d5).ref, 'v9');
  // Retomada no mesmo dia: massa reaproveitada (sem nova busca), segue do CT02.
  prompts.length = 0;
  pausarNo = null;
  await qa.executar(d5, deps);
  assert.deepStrictEqual([st5(), prompts], [['passou', 'passou'], ['QA · CT02 · B']]); // retomada no mesmo dia e com o mesmo código: o login do Claude é reaproveitado (sem nova sessão)
  assert.ok(qa.html(d5).includes('Execução concluída') && qa.html(d5).includes('Relatório e publicar no Jira'));
  // Execução invalida a massa: volta à Etapa 4 só para esse cenário, retoma e, na 2ª vez, bloqueia (sem laço infinito).
  const d10 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  await qa.verificarPlano(d10, 'WMS-1', apiPlano);
  qa.aprovar(d10);
  let dirQs = d10;
  const qs = (env, ...a) =>
    execFileSync(path.join(__dirname, '..', 'bin', 'qa-state'), a, { env: { ...process.env, QA_DIR: dirQs, ...env } })
      .toString()
      .trim();
  let invalidar = 2,
    massaAdds = 0;
  prompts.length = 0;
  pausarNo = null; // invalidar = quantas execuções do CT01 acham a massa ruim
  maestro.rodar = (dir, o) => {
    prompts.push(o.titulo);
    setTimeout(() => {
      const id = o.titulo.match(/CT\d+/)?.[0];
      if (/Pré-condição/.test(o.titulo)) qs({}, 'precondicao', '--status', 'ok', '--nota', 'login confirmado');
      else if (/massa/.test(o.titulo)) {
        qs({}, 'massa', 'add', '--papel', 'p', '--cenarios', 'CT01,CT02', '--dados', '{}');
        massaAdds++;
      } else if (id === 'CT01' && invalidar-- > 0) {
        for (const i of qa.massa(dir).itens)
          if (qa.massaValida(i, new Date(), '06:00')) qs({}, 'massa', i.id, 'invalida');
        qs({}, 'cenario', id, 'concluir', '--status', 'sem-massa', '--nota', 'registro mudou');
      } else {
        const ev = path.join(os.tmpdir(), `ev-${process.pid}-${id}.txt`);
        fs.writeFileSync(ev, 'ok');
        qs({}, 'evidencia', id, ev);
        qs({}, 'cenario', id, 'concluir', '--status', 'passou');
      }
      o.aoMudar();
    }, 5);
    return true;
  };
  const notas = [],
    anotarOrig = require('../../../componentes/ao-vivo').anotar; // as linhas do Ao vivo saem em fila; aqui capturo na hora
  require('../../../componentes/ao-vivo').anotar = (dir, l) => {
    notas.push(l.texto);
    anotarOrig(dir, l);
  };
  await qa.executar(d10, deps);
  // massa → CT01 (o Claude acha a massa imprestável) → renova só a do CT01 → CT01 (imprestável de novo) → CT01 NÃO EXECUTÁVEL e a fila segue (sem pausa);
  // CT02 é o 2º cenário seguido com massa inválida → Etapa 5 para os pendentes → CT02 passa.
  assert.deepStrictEqual(prompts, [
    'QA · Pré-condição · login',
    'QA · Levantando massa de dados',
    'QA · CT01 · A',
    'QA · Levantando massa de dados',
    'QA · CT01 · A',
    'QA · Levantando massa de dados',
    'QA · CT02 · B'
  ]);
  assert.deepStrictEqual(
    [qa.cenarios(d10).cenarios.map((c) => c.status), qa.estado(d10).pausa || null, massaAdds],
    [['nao-executavel', 'passou'], null, 3]
  );
  assert.ok(qa.cenarios(d10).cenarios[0].execucoes.at(-1).nota.includes('massa renovada também não serviu'));
  assert.ok(notas.some((t) => t.includes('CT01: massa inválida: renovando só a deste cenário')));
  assert.ok(notas.some((t) => t.includes('CT02: 2º cenário seguido com massa inválida')));
  assert.ok(qa.podePublicar(qa.cenarios(d10).cenarios)); // não executável fica fora do portão (vai no relatório)
  // ↻ Refazer o não executável: volta à fila, acha a massa nova válida e passa; o passou não é tocado.
  assert.ok(qa.refazer(d10, 'CT01'));
  prompts.length = 0;
  await qa.executar(d10, deps);
  assert.deepStrictEqual(
    [qa.cenarios(d10).cenarios.map((c) => c.status), prompts.filter((t) => /CT\d/.test(t))],
    [['passou', 'passou'], ['QA · CT01 · A']]
  );
  assert.strictEqual(qa.estado(d10).etapa, null);
  // Uma só invalidação: a 2ª passada na Etapa 4 resolve e o CT01 passa.
  const d11 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  dirQs = d11;
  await qa.verificarPlano(d11, 'WMS-1', apiPlano);
  qa.aprovar(d11);
  invalidar = 1;
  prompts.length = 0;
  await qa.executar(d11, deps);
  assert.deepStrictEqual(
    qa.cenarios(d11).cenarios.map((c) => c.status),
    ['passou', 'passou']
  );
  assert.strictEqual(prompts.filter((t) => /massa/.test(t)).length, 2);
  // Retomada: massa vencida (antes do refresh) → a Etapa 4 roda antes da Execução.
  const m11 = qa.massa(d11);
  m11.itens.forEach((i) => {
    i.medidaEm = new Date(2000, 0, 1).toISOString();
  });
  fs.writeFileSync(path.join(d11, qa.MASSA), JSON.stringify(m11));
  qa.refazer(d11, 'CT02');
  prompts.length = 0;
  await qa.executar(d11, deps);
  assert.deepStrictEqual(prompts, ['QA · Levantando massa de dados', 'QA · CT02 · B']); // login de hoje reaproveitado

  // Cenário expandido: pasta/copiar e as evidências de TODAS as execuções (CT02 tem a descartada e a que passou).
  const ct2 = qa.cenarios(d5).cenarios[1];
  ct2.execucoes.forEach((x, i) => fs.writeFileSync(path.join(d5, x.evidencias, `print-${i}.png`), 'x'));
  const h5 = qa.html(d5, (f) => `uri:${f}`);
  assert.ok(
    h5.includes('print-0.png') &&
      h5.includes('print-1.png') &&
      h5.includes('data-acao="pastaCenario"') &&
      h5.includes('data-cen="CT02"')
  );

  // Card de cenário: execução sem evidência, ↻ Refazer só nos concluídos e cenário fora do plano apagado e sem Refazer.
  const cardCen = require('../../../componentes/card-cenario').card,
    ctxC = { dir: d5, uri: () => '', arquivos: () => [] };
  const semExec = cardCen({ id: 'CT09', titulo: 'T', status: 'pendente', texto: 'x' }, ctxC);
  assert.ok(semExec.includes('Ainda não executado') && !semExec.includes('qaRefazer'));
  const arqC = cardCen(
    { id: 'CT08', status: 'passou', arquivado: true, execucoes: [{ status: 'passou', evidencias: 'e' }] },
    ctxC
  );
  assert.ok(
    arqC.includes('Fora do plano') &&
      arqC.includes('class="cen arq"') &&
      arqC.includes('Sem evidências nesta execução') &&
      !arqC.includes('qaRefazer')
  );
  assert.ok(h5.includes('data-painel="qaRefazer" data-id="CT02"'));

  // Ambiente parou: log completo + análise do Claude (gravada pelo qa-state analise, pela entrada padrão).
  const d6 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  await qa.verificarPlano(d6, 'WMS-1', apiPlano);
  qa.aprovar(d6);
  fs.writeFileSync(
    path.join(back, 'testes-funcionais', 'preparar-ambiente.py'),
    'import json,sys\nprint("dotnet: erro ao subir a API")\nprint(json.dumps({"parou_em":"api","pendentes":1,"itens":[{"etapa":"api","item":"API","verdito":"PENDENTE","detalhe":"porta 5111 fechada"}]}))\nsys.exit(1)\n'
  );
  prompts.length = 0;
  maestro.rodar = (dir, o) => {
    prompts.push(o.titulo);
    setTimeout(() => {
      execFileSync(path.join(__dirname, '..', 'bin', 'qa-state'), ['analise'], {
        env: { ...process.env, QA_DIR: o.env.QA_DIR },
        input: 'Causa: RabbitMQ fora do ar.'
      });
      o.aoMudar();
    }, 5);
    return true;
  };
  await qa.executar(d6, deps);
  assert.deepStrictEqual(prompts, ['QA · Analisando por que o ambiente parou']);
  assert.ok(fs.readFileSync(path.join(d6, qa.LOG_AMB), 'utf8').includes('dotnet: erro ao subir a API'));
  const r6 = qa.resumoErroAmbiente(d6);
  assert.ok(
    r6.titulo.includes('api') &&
      r6.detalhe.includes('porta 5111 fechada') &&
      r6.analise === 'Causa: RabbitMQ fora do ar.'
  );
  assert.ok(!qa.html(d6).includes('<b>Ambiente')); // ambiente só no rodapé (a caixa de etapas lista o nome, sem cartão)
  assert.ok(qa.html(d6).includes('Etapas do QA'));
  // Sem Comandos nas Configurações, o log registra a tentativa e cai no script da skill.
  assert.ok(/Nenhum comando cadastrado/.test(fs.readFileSync(path.join(d6, qa.LOG_AMB), 'utf8')));
  assert.deepStrictEqual(
    qa.cenarios(d6).cenarios.map((c) => c.status),
    ['pendente', 'pendente']
  ); // nada executou
  // Rodapé: erro com análise nova pisca com bolinha até ser vista.
  assert.deepStrictEqual(qa.statusAmbiente(d6), { tipo: 'erro', analisando: false, nova: true, etapa: 'api' });
  qa.analiseVista(d6);
  assert.strictEqual(qa.statusAmbiente(d6).nova, false);
  assert.ok(/R01<\/span>.*Sem roteiro/.test(qa.roteiroHtml(d5)) && qa.roteiroHtml(d5).includes('Massa já levantada'));
  // Outra janela: estado diz rodando com o pid de um processo vivo (este) que não é a janela atual → rodando; pid morto → parado.
  const d7 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  const filho = require('child_process').spawn('sleep', ['5']);
  qa.mudar(d7, { execucao: 'rodando', host: filho.pid });
  assert.ok(qa.rodando(d7));
  filho.kill();
  await new Promise((r) => filho.on('exit', r));
  assert.ok(!qa.rodando(d7));
  // maestro: .ao-vivo.pid só conta se o processo vivo for o claude.
  const mae = require('../../../infra/agentes/maestro'),
    d8 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-claude-'));
  fs.writeFileSync(path.join(d8, '.ao-vivo.pid'), String(process.pid));
  assert.ok(!mae.vivo(process.pid)); // node, não claude
  fs.writeFileSync(path.join(d8, '.ao-vivo.pid'), '999999');
  assert.ok(!mae.vivo(999999));
  // Ao vivo: rajada de linhas sai uma a cada meio segundo.
  const viv = require('../../../componentes/ao-vivo'),
    d9 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  ['a', 'b', 'c'].forEach((texto) => viv.anotar(d9, { tipo: 'acao', texto }));
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(viv.linhas(d9).length, 1);
  await new Promise((r) => setTimeout(r, 1000));
  assert.deepStrictEqual(
    viv.linhas(d9).map((x) => x.texto),
    ['a', 'b', 'c']
  );
  // Ao vivo: Ver tudo mostra o log inteiro (do primeiro ao mais recente); Recolher volta às últimas 40.
  for (let i = 0; i < 45; i++)
    fs.appendFileSync(
      path.join(d9, '.ao-vivo.jsonl'),
      JSON.stringify({ em: new Date().toISOString(), tipo: 'acao', texto: `linha ${i}` }) + '\n'
    );
  assert.ok(viv.caixa(d9, false, 'qa').includes('Ver tudo (48)') && !viv.caixa(d9, false, 'qa').includes('>a<'));
  viv.alternarExpandido(d9);
  const tudo = viv.caixa(d9, false, 'qa');
  assert.ok(
    tudo.includes('Recolher') && tudo.includes('>a<') && tudo.includes('linha 44') && tudo.includes('expandido')
  );
  viv.alternarExpandido(d9);
  assert.ok(!viv.expandido(d9));
  // Publica com qualquer nível depois que nada está pendente nem bloqueado; o nível sai por regra (o QA pode mudar com motivo).
  assert.ok(
    qa.podePublicar([{ status: 'passou' }, { status: 'falhou', arquivado: true }]) &&
      qa.podePublicar([{ status: 'passou' }, { status: 'falhou' }]) &&
      !qa.podePublicar([{ status: 'passou' }, { status: 'pendente' }]) &&
      !qa.podePublicar([{ status: 'passou' }, { status: 'bloqueado' }]) &&
      !qa.podePublicar([])
  );
  const nivel = (l, o) => qa.veredito(l, o).nivel;
  const comAviso = { status: 'passou', execucoes: [{ avisos: ['tela mostra 2 casas decimais, plano fala em 3'] }] };
  assert.deepStrictEqual(
    [
      nivel([{ status: 'passou' }, { status: 'passou' }]),
      nivel([{ status: 'passou' }, comAviso]),
      nivel([{ status: 'passou' }, { status: 'nao-executavel' }]),
      nivel([{ status: 'passou' }], { divergencias: 1 }),
      nivel([comAviso, { status: 'falhou' }]),
      nivel([{ status: 'passou' }, { status: 'pendente' }])
    ],
    [
      'aprovado',
      'aprovado-com-ressalvas',
      'aprovado-com-ressalvas',
      'aprovado-com-ressalvas',
      'reprovado',
      'nao-concluido'
    ]
  );
  console.log('ok execução');
})();
// Decisões do usuário no QA -> .decisoes.json (aba Decisões)
{
  const dd = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-dec-'));
  qa.registrarDecisao(dd, 'Usuário aprovou o planejamento', { ticket: 'WMS-1' });
  qa.registrarDecisao(dd, 'Usuário pausou os testes', { ticket: 'WMS-1', motivo: 'x' });
  const l = JSON.parse(fs.readFileSync(path.join(dd, '.decisoes.json'), 'utf8'));
  assert.strictEqual(l.length, 2);
  assert.ok(
    l[0].titulo === 'Usuário aprovou o planejamento' &&
      l[0].origem === 'usuario' &&
      l[0].resumo.startsWith('WMS-1') &&
      l[0].data &&
      l[1].detalhes.motivo === 'x'
  );
  assert.ok(
    require('../../../componentes/aba-decisoes')
      .corpoAba({ decisoes: l.slice().reverse() })
      .includes('Usuário pausou os testes')
  );
  console.log('ok decisões');
}
