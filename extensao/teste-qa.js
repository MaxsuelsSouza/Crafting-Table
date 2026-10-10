// node teste-qa.js
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const qa = require('./qa');
const { ehQA, candidatas, temPlano, adfMd, versionar, procurar } = qa._teste;

assert.ok(['[QA] Planejamento dos Casos de Testes', 'qa - testes', 'Teste Q.A.', 'Plano de QA'].every(ehQA));
assert.ok(!['Ajustar quadro', 'Aqa', 'Backend: endpoint'].some(ehQA));
const subs = [{ resumo: '[QA] Execução' }, { resumo: 'QA planejamento de testes' }, { resumo: 'Backend' }, { resumo: '[QA] Teste de Qualidade' }];
assert.deepStrictEqual(candidatas(subs).map((s) => s.resumo), ['[QA] Teste de Qualidade', 'QA planejamento de testes', '[QA] Execução']);
assert.ok(temPlano('#### CT01 – Validar') && temPlano('**Dado que** o pedido') && temPlano('CT-02'));
assert.ok(!temPlano('Sub-tarefa criada automaticamente para planejamento de testes de QA.'));

const adf = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'CT01 – Validar' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Dado que', marks: [{ type: 'strong' }] }, { type: 'text', text: ' x' }] },
  { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] }] },
  { type: 'table', content: [
    { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cenário' }] }] }, { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Status' }] }] }] },
    { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CT01' }] }] }, { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ok' }] }] }] }] }] };
assert.strictEqual(adfMd(adf).trim(), '#### CT01 – Validar\n\n**Dado que** x\n\n- a\n\n| Cenário | Status |\n| --- | --- |\n| CT01 | ok |');

// Versões: mesma descrição não gera versão nova; descrição diferente gera v2.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
const s = { key: 'WMS-2', resumo: '[QA] Planejamento dos Casos de Testes', updated: '2026-10-10', md: 'CT01' };
assert.deepStrictEqual([versionar(dir, s).v, versionar(dir, s).nova, versionar(dir, { ...s, md: 'CT01 CT02' }).v], [1, false, 2]);
assert.ok(fs.existsSync(path.join(dir, 'planejamento-qa-v2.md')));

// Mapa de cenários: parse dos títulos CT e sincronização entre versões do plano.
const { cenariosDo, sincronizar } = qa._teste;
const plano1 = '## 🧪 Cenários de Teste\n\n#### CT01 – Validar login\n\n**Dado que** o usuário existe\n**Quando** entra\n**Então** vê a home\n\n📌 Validações:\n✔ x\n\n#### CT-2: Senha errada\n\n**Dado que** a senha é errada\n\n## ✅ Critérios';
const c1 = cenariosDo(plano1);
assert.deepStrictEqual(c1.map((c) => [c.id, c.titulo]), [['CT01', 'Validar login'], ['CT02', 'Senha errada']]);
assert.strictEqual(c1[0].resumo, 'Dado que o usuário existe · Quando entra · Então vê a home');
assert.ok(!c1[1].texto.includes('Critérios')); // o corpo para no próximo título de nível maior
// Formato em negrito (plano real do WMS-14751): **Cenário N: …** e **Exploratório N: …**, Gherkin em lista.
const plano3 = '## Cenários principais\n\n**Cenário 1: Avançar desabilitado (CA01)**\n\n- Dado que o operador identificou o pedido\n- Quando a tela abre\n- Então o botão está desabilitado\n\n**Cenário 2: Parcial**\n\n- Dado o pedido\n\n---\n\n## Cenários exploratórios\n\n**Exploratório 1: Um produto**\n\n- Quando bipa\n\n## Riscos\n- texto';
const c3 = cenariosDo(plano3);
assert.deepStrictEqual(c3.map((c) => [c.id, c.titulo]), [['CT01', 'Avançar desabilitado (CA01)'], ['CT02', 'Parcial'], ['EX01', 'Um produto']]);
assert.strictEqual(c3[0].resumo, 'Dado que o operador identificou o pedido · Quando a tela abre · Então o botão está desabilitado');
assert.ok(!c3[1].texto.includes('---') && !c3[2].texto.includes('Riscos'));
assert.deepStrictEqual(cenariosDo('**Dado que** x\n**Cenário**: sem número'), []); // negrito comum não vira cenário
const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
assert.deepStrictEqual(sincronizar(d3, plano1, 1), { total: 2, novos: 2, mudaram: 0, sairam: 0 });
// CT01 rodou e passou; v2 muda o CT01, tira o CT02 e cria o CT03.
const r = qa.cenarios(d3); r.cenarios[0].status = 'passou'; r.cenarios[0].execucoes = [{ status: 'passou', inicio: '2026-10-10T12:00:00Z' }];
fs.writeFileSync(path.join(d3, qa.CENARIOS), JSON.stringify(r));
const plano2 = '#### CT01 – Validar login com SSO\n**Dado que** x\n#### CT03 – Novo\n**Dado que** y';
assert.deepStrictEqual(sincronizar(d3, plano2, 2), { total: 2, novos: 1, mudaram: 1, sairam: 1 });
const st = Object.fromEntries(qa.cenarios(d3).cenarios.map((c) => [c.id, c.arquivado ? 'arquivado' : c.status]));
assert.deepStrictEqual(st, { CT01: 'desatualizado', CT03: 'pendente', CT02: 'arquivado' });
assert.ok(qa.refazer(d3, 'CT01') && qa.cenarios(d3).cenarios[0].status === 'pendente' && qa.cenarios(d3).cenarios[0].execucoes.length === 1);
assert.ok(!qa.refazer(d3, 'CT02')); // arquivado não volta
assert.ok(!qa.html(d3).includes('Cenários · plano')); // sem aprovação, a lista não aparece

// Ao vivo: mais recente em cima, agrupado por etapa (título no topo do bloco).
const { recentesPrimeiro } = require('./maestro')._teste;
const vivoL = [{ tipo: 'etapa', texto: 'E1' }, { tipo: 'acao', texto: 'a1' }, { tipo: 'acao', texto: 'a2' }, { tipo: 'etapa', texto: 'E2' }, { tipo: 'fim', texto: 'b1' }];
assert.strictEqual(recentesPrimeiro(vivoL).map((x) => x.texto).join(','), 'E2,b1,E1,a2,a1');
assert.strictEqual(recentesPrimeiro([{ tipo: 'acao', texto: 'x' }, { tipo: 'acao', texto: 'y' }]).map((x) => x.texto).join(','), 'y,x');

(async () => {
  // procurar: a subtarefa com cenários vence a de nome exato vazia.
  const api = async () => ({ issues: [
    { key: 'WMS-3', fields: { summary: '[QA] Teste de Qualidade', description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sub-tarefa criada automaticamente' }] }] } } },
    { key: 'WMS-4', fields: { summary: 'QA planejamento', description: adf } },
    { key: 'WMS-5', fields: { summary: 'Backend', description: null } }] });
  const r = await procurar(api, 'WMS-1');
  assert.deepStrictEqual([r.plano.key, r.qa.map((x) => x.key)], ['WMS-4', ['WMS-3', 'WMS-4']]);

  // verificarPlano: sem plano → sem_plano; com plano → plano_ok + v1 + Ao vivo.
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  assert.strictEqual((await qa.verificarPlano(d2, 'WMS-1', async () => ({ issues: [] })), qa.estado(d2)).fase, 'sem_plano');
  // Plano achado espera aprovação (cenários só aparecem depois); aprovado, o ▶ seguinte já lista sem pedir de novo.
  await qa.verificarPlano(d2, 'WMS-1', api);
  assert.deepStrictEqual([qa.estado(d2).fase, qa.estado(d2).versao, qa.cenarios(d2).cenarios.length], ['plano_encontrado', 1, 0]);
  assert.ok(qa.html(d2).includes('Planejamento encontrado · WMS-4 · v1') && !qa.html(d2).includes('Dar início'));
  assert.ok(qa.aprovar(d2) && !qa.aprovar(d2));
  assert.deepStrictEqual([qa.estado(d2).fase, qa.cenarios(d2).cenarios.map((c) => c.id)], ['plano_aprovado', ['CT01']]);
  assert.ok(qa.html(d2).includes('Dar início') && qa.html(d2).includes('Cenários · plano v1'));
  const h2 = qa.html(d2); assert.ok(h2.indexOf('Planejamento aprovado') > h2.indexOf('id="aoVivo"')); // cartão do plano abaixo do Ao vivo
  await qa.verificarPlano(d2, 'WMS-1', api);
  assert.strictEqual(qa.estado(d2).fase, 'plano_aprovado');
  await qa.verificarPlano(d2, 'WMS-1', async () => { throw new Error('401'); });
  assert.strictEqual(qa.estado(d2).fase, 'erro');
  console.log('ok qa');

  // ── Fases 3 a 5: massa, execução, qa-state e o ▶ inteiro (Claude e preparar-ambiente.py simulados).
  process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-home-')); // trava do ambiente fica aqui
  const { ultimoRefresh, semMassa, iniciarCenario, fila, papeisDe } = qa._teste;
  // Comandos das Configurações que bastam para o ambiente: API (dotnet/5111) e Metro (react-native start/8081).
  const cmds = [{ nome: 'Backend', comando: 'dotnet run --project FCxLabs.WMS.Api' }, { nome: 'Metro', comando: 'npx react-native start --port 8081' }, { nome: 'Lint', comando: 'yarn lint' }];
  assert.deepStrictEqual(Object.values(papeisDe(cmds)).map((b) => b?.nome), ['Backend', 'Metro']);
  assert.deepStrictEqual(Object.values(papeisDe([cmds[2]])), [null, null]);
  // Caso real: "Start" (yarn start = yarn android) vinha antes de "Metro" e era escolhido como Metro.
  const reais = [{ nome: 'API - Staging', comando: 'dotnet run --project FCxLabs.WMS.Api' }, { nome: 'Start', comando: 'yarn start' }, { nome: 'Metro', comando: 'yarn metro' }];
  assert.deepStrictEqual(Object.values(papeisDe(reais)).map((b) => b?.nome), ['API - Staging', 'Metro']);
  assert.strictEqual(papeisDe([{ nome: 'Start', comando: 'yarn start' }]).metro, null); // sem Metro de verdade: cai no script da skill
  const ag = new Date(2026, 9, 10, 5, 0); // 05:00, refresh às 06:00 → o último foi ontem 06:00
  assert.deepStrictEqual([ultimoRefresh(ag, '06:00').getDate(), ultimoRefresh(new Date(2026, 9, 10, 13, 0), '06:00').getDate()], [9, 10]);
  const d4 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  qa.massaAdd(d4, { papel: 'pedido', cenarios: ['CT01'], dados: { N: 1 } });
  const m = qa.massa(d4); m.itens[0].medidaEm = new Date(2026, 9, 10, 4, 0).toISOString(); fs.writeFileSync(path.join(d4, qa.MASSA), JSON.stringify(m));
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
  assert.deepStrictEqual([qa.cenarios(d4).cenarios[0].status, qa.cenarios(d4).cenarios[0].execucoes[0].status], ['pendente', 'descartado']);

  // qa-state (CLI) pela QA_DIR.
  const { execFileSync } = require('child_process');
  const cli = (...a) => execFileSync(path.join(__dirname, 'bin', 'qa-state'), a, { env: { ...process.env, QA_DIR: d4 }, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  const ex = iniciarCenario(d4, 'CT02', null);
  const print = path.join(d4, 'p.png'); fs.writeFileSync(print, 'x');
  cli('evidencia', 'CT02', print);
  assert.ok(fs.existsSync(path.join(d4, ex.evidencias, 'p.png')));
  cli('cenario', 'CT02', 'concluir', '--status', 'falhou', '--nota', 'erro 500');
  assert.deepStrictEqual([qa.cenarios(d4).cenarios[1].status, qa.cenarios(d4).cenarios[1].execucoes[0].nota], ['falhou', 'erro 500']);
  assert.strictEqual(cli('massa', 'add', '--papel', 'x', '--cenarios', 'CT01,CT02', '--dados', '{"a":1}'), 'M2');
  assert.throws(() => cli('cenario', 'CT02', 'concluir', '--status', 'passou')); // só cenário em execução

  // ▶ inteiro: plano com 2 CTs, ambiente simulado, massa levantada, CT01 passa, pausa durante o CT02 → descartado; retomada termina.
  const maestro = require('./maestro');
  const back = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-back-'));
  fs.mkdirSync(path.join(back, 'testes-funcionais'));
  fs.writeFileSync(path.join(back, 'testes-funcionais', 'preparar-ambiente.py'),
    'import json\nprint("[ OK  ] API respondendo")\nprint(json.dumps({"ref":"v9","backend":"","mobile":"","parou_em":None,"pendentes":0,"itens":[]}))\n');
  const d5 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  const apiPlano = async () => ({ issues: [{ key: 'WMS-9', fields: { summary: '[QA] Planejamento dos Casos de Testes', updated: 'x',
    description: { type: 'doc', content: [{ type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'CT01 – A' }] }, { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'CT02 – B' }] }] } } }] });
  const prompts = [];
  let pausarNo = 'CT02';
  maestro.rodar = (dir, o) => {
    prompts.push(o.titulo);
    setTimeout(() => {
      const env = { ...process.env, QA_DIR: o.env.QA_DIR };
      if (/massa/.test(o.titulo)) execFileSync(path.join(__dirname, 'bin', 'qa-state'), ['massa', 'add', '--papel', 'p', '--cenarios', 'CT01,CT02', '--dados', '{}'], { env });
      const id = o.titulo.match(/CT\d+/)?.[0];
      if (id && id === pausarNo) qa.pausar(dir);
      else if (id) execFileSync(path.join(__dirname, 'bin', 'qa-state'), ['cenario', id, 'concluir', '--status', 'passou'], { env });
      o.aoMudar();
    }, 5);
    return true;
  };
  maestro.rodando = () => false; maestro.parar = () => {};
  const deps = { chave: 'WMS-1', backend: back, api: apiPlano, horaRefresh: '06:00', confirmar: async () => true };
  await qa.executar(d5, deps); // sem plano aprovado não executa
  assert.deepStrictEqual(prompts, []);
  await qa.verificarPlano(d5, 'WMS-1', apiPlano); qa.aprovar(d5);
  await qa.executar(d5, deps);
  const st5 = () => qa.cenarios(d5).cenarios.map((c) => c.status);
  assert.deepStrictEqual(st5(), ['passou', 'pendente']);
  assert.strictEqual(qa.cenarios(d5).cenarios[1].execucoes[0].status, 'descartado');
  assert.deepStrictEqual(prompts, ['QA · Levantando massa de dados', 'QA · CT01 · A', 'QA · CT02 · B']);
  assert.strictEqual(qa.ambiente(d5).ref, 'v9');
  // Retomada no mesmo dia: massa reaproveitada (sem nova busca), segue do CT02.
  prompts.length = 0; pausarNo = null;
  await qa.executar(d5, deps);
  assert.deepStrictEqual([st5(), prompts], [['passou', 'passou'], ['QA · CT02 · B']]);
  assert.ok(qa.html(d5).includes('Execução concluída') && qa.html(d5).includes('Publicar no Jira'));
  // Cenário expandido: pasta/copiar e as evidências de TODAS as execuções (CT02 tem a descartada e a que passou).
  const ct2 = qa.cenarios(d5).cenarios[1];
  ct2.execucoes.forEach((x, i) => fs.writeFileSync(path.join(d5, x.evidencias, `print-${i}.png`), 'x'));
  const h5 = qa.html(d5, (f) => `uri:${f}`);
  assert.ok(h5.includes('print-0.png') && h5.includes('print-1.png') && h5.includes('data-acao="pastaCenario"') && h5.includes('data-cen="CT02"'));

  // Ambiente parou: log completo + análise do Claude (gravada pelo qa-state analise, pela entrada padrão).
  const d6 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  await qa.verificarPlano(d6, 'WMS-1', apiPlano); qa.aprovar(d6);
  fs.writeFileSync(path.join(back, 'testes-funcionais', 'preparar-ambiente.py'),
    'import json,sys\nprint("dotnet: erro ao subir a API")\nprint(json.dumps({"parou_em":"api","pendentes":1,"itens":[{"etapa":"api","item":"API","verdito":"PENDENTE","detalhe":"porta 5111 fechada"}]}))\nsys.exit(1)\n');
  prompts.length = 0;
  maestro.rodar = (dir, o) => { prompts.push(o.titulo); setTimeout(() => {
    execFileSync(path.join(__dirname, 'bin', 'qa-state'), ['analise'], { env: { ...process.env, QA_DIR: o.env.QA_DIR }, input: 'Causa: RabbitMQ fora do ar.' }); o.aoMudar(); }, 5); return true; };
  await qa.executar(d6, deps);
  assert.deepStrictEqual(prompts, ['QA · Analisando por que o ambiente parou']);
  assert.ok(fs.readFileSync(path.join(d6, qa.LOG_AMB), 'utf8').includes('dotnet: erro ao subir a API'));
  const h6 = qa.html(d6);
  assert.ok(h6.includes('parou em api') && h6.includes('porta 5111 fechada') && h6.includes('Causa: RabbitMQ fora do ar.') && h6.includes('Log ao vivo'));
  // Sem Comandos nas Configurações, o log registra a tentativa e cai no script da skill.
  assert.ok(/Nenhum comando cadastrado/.test(fs.readFileSync(path.join(d6, qa.LOG_AMB), 'utf8')));
  assert.deepStrictEqual(qa.cenarios(d6).cenarios.map((c) => c.status), ['pendente', 'pendente']); // nada executou
  // Rodapé: erro com análise nova pisca com bolinha até ser vista.
  assert.deepStrictEqual(qa.statusAmbiente(d6), { tipo: 'erro', analisando: false, nova: true, etapa: 'api' });
  qa.analiseVista(d6);
  assert.strictEqual(qa.statusAmbiente(d6).nova, false);
  assert.ok(!qa.html(d6).includes('Preparando o ambiente'));
  assert.ok(qa.massaHtml(d5).includes('Válida'));
  // Outra janela: estado diz rodando com o pid de um processo vivo (este) que não é a janela atual → rodando; pid morto → parado.
  const d7 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  const filho = require('child_process').spawn('sleep', ['5']);
  qa.mudar(d7, { execucao: 'rodando', host: filho.pid });
  assert.ok(qa.rodando(d7));
  filho.kill(); await new Promise((r) => filho.on('exit', r));
  assert.ok(!qa.rodando(d7));
  // maestro: .ao-vivo.pid só conta se o processo vivo for o claude.
  const mae = require('./maestro'), d8 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-claude-'));
  fs.writeFileSync(path.join(d8, '.ao-vivo.pid'), String(process.pid));
  assert.ok(!mae.vivo(process.pid)); // node, não claude
  fs.writeFileSync(path.join(d8, '.ao-vivo.pid'), '999999');
  assert.ok(!mae.vivo(999999));
  // Ao vivo: rajada de linhas sai uma a cada meio segundo.
  const d9 = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
  ['a', 'b', 'c'].forEach((texto) => mae.anotar(d9, { tipo: 'acao', texto }));
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(mae.aoVivo(d9).length, 1);
  await new Promise((r) => setTimeout(r, 1000));
  assert.deepStrictEqual(mae.aoVivo(d9).map((x) => x.texto), ['a', 'b', 'c']);
  console.log('ok execução');
})();
