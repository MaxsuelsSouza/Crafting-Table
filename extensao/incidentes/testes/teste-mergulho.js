// @ts-check
// node incidentes/testes/teste-mergulho.js
const assert = require('assert');
const fs = require('fs'),
  os = require('os'),
  path = require('path');
const Module = require('module'),
  carregar = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : carregar(r, ...a)); // aba-docs/locais carregam o vscode
const mg = require('../abas/mergulho'),
  { anexosFaltando, aposEtapa, responder } = require('../orquestrador');
const { estado, mudar, situacao, PAUSA, RESPOSTAS } = require('../estado'),
  { ETAPAS } = require('../etapas');
const { prompt, FERRAMENTAS } = require('../prompt'),
  { branchesErradas } = require('../etapas/03-dados-logs');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mergulho-')),
  dir = path.join(raiz, 'aba'),
  pasta = path.join(raiz, 'ticket');
fs.mkdirSync(dir);
fs.mkdirSync(pasta);
const t = { id: 'WMS-1', chave: 'WMS-1', link: 'x' };
let renders = 0;
const s = {
  pastaAba: () => dir,
  pasta: () => pasta,
  render: () => renders++,
  ticketAberto: () => t,
  reposDe: () => [],
  cacheJira: {
    'WMS-1': {
      anexos: [
        { id: '1', nome: 'a.png' },
        { id: '2', nome: 'b.log' }
      ]
    }
  }
};

// estado: padrão, gravação e mescla
assert.deepStrictEqual([estado(dir).etapa, estado(dir).fase, estado(dir).pausa], [1, 'parado', null]);
mudar(dir, { obsPO: 'ligar pro PO' });
mudar(dir, { fase: 'rodando' });
assert.deepStrictEqual([estado(dir).obsPO, estado(dir).fase], ['ligar pro PO', 'rodando']);

// gatekeeper: só um anexo baixado (.origem.json) → falta o outro
fs.writeFileSync(path.join(pasta, '.origem.json'), JSON.stringify({ 'a.png': { origem: 'jira', id: '1' } }));
assert.deepStrictEqual(
  anexosFaltando(s, t).map((a) => a.id),
  ['2']
);
fs.writeFileSync(path.join(pasta, '.origem.json'), JSON.stringify({ 'a.png': { id: '1' }, 'b.log': { id: '2' } }));
assert.deepStrictEqual(anexosFaltando(s, t), []);

(async () => {
  // etapa terminou com .pausa.json → pausado com a pergunta; sem arquivo nem pausa → erro
  fs.writeFileSync(
    path.join(dir, PAUSA),
    JSON.stringify({ motivo: 'log', pergunta: 'Qual tabela?', opcoes: ['LOG_A', 'LOG_B'] })
  );
  mudar(dir, { etapa: 3, fase: 'rodando' });
  await aposEtapa(s, t, 3);
  assert.deepStrictEqual(
    [estado(dir).fase, estado(dir).pausa.pergunta, estado(dir).pausa.opcoes],
    ['pausado', 'Qual tabela?', ['LOG_A', 'LOG_B']]
  );
  assert.ok(!fs.existsSync(path.join(dir, PAUSA)));
  assert.ok(
    mg.corpo(t, {}, dir).includes('Qual tabela?') && mg.corpo(t, {}, dir).includes('data-acao="mergulhoResponder"')
  );
  mudar(dir, { fase: 'rodando', pausa: null });
  await aposEtapa(s, t, 3);
  assert.strictEqual(estado(dir).fase, 'erro');

  // HTML da aba: campo do PO, botão e ações registradas
  fs.rmSync(path.join(dir, '.mergulho.json'));
  const h = mg.corpo(t, {}, dir);
  assert.ok(h.includes('Há alguma observação adicional deixada pelo PO?') && h.includes('data-acao="mergulhoIniciar"'));
  assert.ok(ETAPAS.every((e) => h.includes(e.nome)));
  assert.deepStrictEqual(Object.keys(require('../../componentes/fluxo-passos').acoes(s)).sort(), [
    'fluxoAbrir',
    'fluxoCopiar',
    'fluxoPasta',
    'fluxoRefazer'
  ]); // card do fluxo: componente comum
  assert.deepStrictEqual(Object.keys(mg.acoes(s)).sort(), [
    'mergulhoAbrir',
    'mergulhoAjuste',
    'mergulhoAprovar',
    'mergulhoContinuar',
    'mergulhoIniciar',
    'mergulhoObs',
    'mergulhoPausar',
    'mergulhoResponder',
    'mergulhoRetomar'
  ]);

  // prompts: cada etapa cita o arquivo que o Claude deve gravar
  for (const e of ETAPAS.slice(0, 4)) assert.ok(prompt(t, dir, e.n, [], 'x').includes(e.arq));

  // retomada: a resposta vai para .respostas.md (anexos faltando de novo → segue pausado sem chamar o claude)
  fs.writeFileSync(path.join(pasta, '.origem.json'), '{}');
  mudar(dir, { etapa: 2, fase: 'pausado', pausa: { motivo: 'anexos', pergunta: 'p', opcoes: [] } });
  await responder(s, t, 'LOG_A');
  assert.ok(fs.readFileSync(path.join(dir, RESPOSTAS), 'utf8').includes('LOG_A'));
  assert.deepStrictEqual([estado(dir).fase, estado(dir).pausa.motivo], ['pausado', 'anexos']);

  // ⏸/▶ do cabeçalho: rodando mostra pausar; pausar guarda a pausa manual e a rodada antiga deixa de valer; ▶ aparece para retomar
  const b = (a) => `data-acao="${a}"`,
    controle = require('../../infra/controle');
  mudar(dir, { etapa: 3, fase: 'rodando', pausa: null });
  assert.ok(mg.botaoPlay(dir, b).includes('mergulhoPausar'));
  const rodada = controle.nova(dir);
  mg.acoes(s).mergulhoPausar();
  assert.deepStrictEqual(
    [estado(dir).fase, estado(dir).pausa.motivo, controle.valida(dir, rodada)],
    ['pausado', 'manual', false]
  );
  assert.ok(mg.botaoPlay(dir, b).includes('mergulhoRetomar'));
  assert.ok(mg.corpo(t, {}, dir).includes('▶ Retomar'));
  await aposEtapa(s, t, 3, rodada); // Claude morto pela pausa: não vira erro
  assert.strictEqual(estado(dir).fase, 'pausado');
  mudar(dir, { fase: 'pausado', pausa: { motivo: 'log', pergunta: 'p', opcoes: [] } });
  assert.strictEqual(mg.botaoPlay(dir, b), ''); // pausa com pergunta: sem ▶ (a resposta é o caminho)

  // escrita: ~/.claude é bloqueada para Write; o prompt manda gravar pelo mergulho-gravar e a ferramenta liberada é só ele
  assert.ok(prompt(t, dir, 1, [], 'x').includes('mergulho-gravar') && !FERRAMENTAS('/m').includes('Write'));
  assert.ok(FERRAMENTAS('/m').some((x) => x.startsWith('Bash(') && x.includes('mergulho-gravar')));
  // etapa 3: repositório fora da branch (backend master-md, mobile main) pausa antes do Claude; texto livre não resolve; trocar resolve
  const { execFileSync } = require('child_process'),
    g = (c, ...a) => execFileSync('git', ['-C', c, ...a], { stdio: 'ignore' });
  const mkrepo = (branch, outra) => {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
    g(r, 'init', '-q', '-b', branch);
    g(r, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x');
    if (outra) g(r, 'checkout', '-q', '-b', outra);
    return r;
  };
  const back = mkrepo('master-md', 'feature/x'),
    mob = mkrepo('main');
  const repos = [
    { camada: 'backend', caminho: back },
    { camada: 'mobile', caminho: mob },
    { camada: 'outro', caminho: raiz }
  ];
  assert.deepStrictEqual(
    branchesErradas(repos).map((r) => [r.camada, r.atual, r.esperada]),
    [['backend', 'feature/x', 'master-md']]
  );
  const s3 = { ...s, reposDe: () => repos, cacheJira: { 'WMS-1': { anexos: [] } } };
  mudar(dir, { etapa: 3, fase: 'parado', pausa: null, branchOk: false });
  await mg.acoes(s3).mergulhoContinuar();
  assert.deepStrictEqual([estado(dir).fase, estado(dir).pausa.motivo], ['pausado', 'branch']);
  assert.ok(estado(dir).pausa.pergunta.includes('feature/x') && estado(dir).pausa.opcoes.length === 2);
  await responder(s3, t, 'qualquer texto');
  assert.strictEqual(estado(dir).pausa.motivo, 'branch');
  g(back, 'checkout', '-q', 'master-md');
  assert.deepStrictEqual(branchesErradas(repos), []);
  // situação única: "rodando" no arquivo sem Claude vivo e sem janela dona viva = interrompido (parado), e o ▶ aparece no cabeçalho e no Ao vivo
  const aoVivoC = require('../../componentes/ao-vivo'),
    sit = situacao;
  const fantasma = (etapa) =>
    fs.writeFileSync(
      path.join(dir, '.mergulho.json'),
      JSON.stringify({ etapa, fase: 'rodando', host: 999999, pausa: null, obsPO: '' })
    ); // janela que não existe mais
  fantasma(2);
  assert.deepStrictEqual([sit(dir).rodando, sit(dir).fase], [false, 'parado']);
  assert.ok(mg.botaoPlay(dir, b).includes('mergulhoRetomar') && !mg.botaoPlay(dir, b).includes('mergulhoPausar'));
  assert.ok(mg.corpo(t, {}, dir).includes('pronta para iniciar'));
  mudar(dir, { fase: 'rodando' }); // mudar grava o host desta janela: viva
  assert.deepStrictEqual([sit(dir).rodando, sit(dir).fase], [true, 'rodando']);
  assert.ok(mg.botaoPlay(dir, b).includes('mergulhoPausar') && !mg.botaoPlay(dir, b).includes('mergulhoRetomar'));
  // o componente Ao vivo: ⏸ trabalhando, ▶ parado, nada sem comando (aguardando/concluído)
  assert.ok(
    aoVivoC.controle(true, { pausar: 'p', retomar: 'r' }).includes('data-acao="p"') &&
      aoVivoC.controle(false, { pausar: 'p', retomar: 'r' }).includes('data-acao="r"')
  );
  assert.strictEqual(aoVivoC.controle(false, { pausar: 'p', retomar: null }), '');
  assert.strictEqual(aoVivoC.controle(false, undefined), '');

  // etapa interrompida depois de gravar o documento: ▶ leva à aprovação, sem rodar o Claude de novo
  fs.writeFileSync(path.join(dir, ETAPAS[1].arq), '# artefatos');
  fantasma(2);
  await mg.acoes(s).mergulhoRetomar();
  assert.deepStrictEqual([estado(dir).fase, estado(dir).aprovacao], ['aguardando', { etapa: 2, lido: false }]);
  // etapa terminada com documento: aguarda aprovação (não segue sozinha); card com Abrir, Aprovar travado até ler e Pedir ajuste; sem ⏸/▶
  mudar(dir, { etapa: 3, fase: 'rodando' });
  fs.writeFileSync(path.join(dir, ETAPAS[2].arq), '# dados');
  fs.writeFileSync(path.join(dir, 'massa-real.sql'), 'select 1 from dual'); // sem massa real e sem pendência a etapa 3 pausa (teste-esteira-incidente)
  await aposEtapa(s, t, 3, undefined, 0);
  assert.deepStrictEqual([estado(dir).fase, estado(dir).etapa], ['aguardando', 3]);
  const ha = mg.corpo(t, {}, dir);
  assert.ok(
    ha.includes('aguardando sua aprovação') &&
      ha.includes('data-acao="mergulhoAbrir"') &&
      ha.includes('class="aprovar travado" data-acao="mergulhoAprovar" disabled') &&
      ha.includes('data-acao="mergulhoAjuste"')
  );
  assert.strictEqual(mg.botaoPlay(dir, b), '');
  mudar(dir, { aprovacao: { etapa: 3, lido: true } });
  assert.ok(!mg.corpo(t, {}, dir).includes('travado'));
  // ajuste que não atualiza o documento é erro; atualizando, volta a aguardar
  const arq3 = path.join(dir, ETAPAS[2].arq),
    m0 = fs.statSync(arq3).mtimeMs;
  mudar(dir, { fase: 'rodando' });
  await aposEtapa(s, t, 3, undefined, m0 + 1000);
  assert.strictEqual(estado(dir).fase, 'erro');
  mudar(dir, { fase: 'rodando' });
  await aposEtapa(s, t, 3, undefined, m0 - 1000);
  assert.strictEqual(estado(dir).fase, 'aguardando');
  // etapa 5: a caixa expande sozinha com 5.1 a 5.4 (pendentes) antes de qualquer processo; fora da etapa 5 fica recolhida
  mudar(dir, { etapa: 5, fase: 'parado', aprovacao: null, sub: {} });
  const h5 = mg.corpo(t, {}, dir);
  assert.ok(
    ['5.1', '5.2', '5.3', '5.4'].every(
      (n, i, a) => h5.includes(`<b>${n}</b>`) && (!i || h5.indexOf(`<b>${a[i - 1]}</b>`) < h5.indexOf(`<b>${n}</b>`))
    )
  );
  assert.ok(
    h5.indexOf('Planejar o fluxo') < h5.indexOf('Massa de teste') &&
      h5.indexOf('Massa de teste') < h5.indexOf('Subir o ambiente') &&
      h5.indexOf('Subir o ambiente') < h5.indexOf('Reproduzir')
  );
  mudar(dir, { etapa: 4 });
  assert.ok(!mg.corpo(t, {}, dir).includes('class="ce-subs"'));
  // Aprovar/Ajuste fora de "aguardando" não fazem nada
  mudar(dir, { fase: 'parado' });
  await mg.acoes(s).mergulhoAprovar();
  await mg.acoes(s).mergulhoAjuste();
  assert.strictEqual(estado(dir).fase, 'parado');
  console.log('ok');
})();
