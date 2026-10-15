// @ts-check
// node qa/teste-esteira-qa.js — a esteira do QA no mesmo padrão da de Implementação: Claude simulado (maestro.rodar trocado; os argumentos reais
// do claude -p conferidos com um claude falso no PATH da casa), qa-state real, rede bloqueada, tudo em pastas temporárias.
// Cobre: portão antes de publicar, segurança (ferramentas, proibidas, banco), evidência obrigatória, controle (interrompida, timeout), pausa que pergunta e dossiê.
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-esteira-'));
process.env.HOME = home;
const Module = /** @type {any} */ (require('module')), carregar = Module._load;
let resposta = '';
const vscodeMock = { window: { showWarningMessage: async () => 'Aprovar e publicar', showInputBox: async () => resposta, showErrorMessage: async () => {}, createOutputChannel: () => ({}) },
  workspace: { getConfiguration: () => ({ get: () => undefined }) }, commands: { executeCommand: () => {} }, Uri: { file: (f) => ({ fsPath: f }) }, env: {}, EventEmitter: class {} };
Module._load = (r, ...a) => (r === 'vscode' ? vscodeMock : carregar(r, ...a));
const rede = [];
for (const m of ['http', 'https']) require(m).request = (...a) => { rede.push(a[0]); throw new Error('REDE bloqueada neste teste'); };
global.fetch = /** @type {any} */ (async () => { throw new Error('REDE bloqueada neste teste'); });

const qa = require('./qa'), entrada = require('./entrada'), { acoes, botaoPlay } = require('./acoes');
const maestro = require('../painel/maestro'), vagas = require('../agentes/etapas'), tickets = require('../infra/tickets');
const prov = require('../provedores/documento'), { areaIA } = require('../infra/area-ia');
const { sincronizar, iniciarCenario } = qa._teste;
require('../infra/sessao').focoLista = () => 'qa';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const novoDir = () => { const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e-')), d = path.join(raiz, 'qa'); fs.mkdirSync(d); return d; };
const cli = (dir, ...a) => execFileSync(path.join(__dirname, 'qa-state'), a, { env: { ...process.env, QA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const PLANO = '## Cenários de Teste\n\n#### CT01 – Cancelar nota\n\n**Dado que** a nota existe\n**Quando** cancela\n**Então** grava na tabela LOG_NOTA\n\n#### CT02 – Reabrir\n\n**Dado que** x\n';
const sobras = (dir) => fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'));

(async () => {
  // ── Segurança: os argumentos REAIS do claude -p (claude falso na casa temporária) levam as proibidas.
  {
    const bin = path.join(home, '.local', 'bin'); fs.mkdirSync(bin, { recursive: true });
    const sa = path.join(home, 'args.txt');
    fs.writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$ARGS_FILE"\n'); fs.chmodSync(path.join(bin, 'claude'), 0o755);
    const d = novoDir();
    assert.ok(maestro.rodar(d, { prompt: 'x', ferramentas: ['Read'], proibidas: qa.PROIBIDAS, env: { ARGS_FILE: sa } }));
    for (let i = 0; i < 100 && (maestro.rodando(d) || !fs.existsSync(sa)); i++) await dormir(20);
    const args = fs.readFileSync(sa, 'utf8').split('\n');
    const i = args.indexOf('--disallowedTools');
    assert.ok(i > 0 && args.slice(i + 1, i + 1 + qa.PROIBIDAS.length).join() === qa.PROIBIDAS.join(), `args: ${args.join(' ')}`);
    assert.ok(['git commit', 'git push', 'git merge', 'git rebase'].every((c) => qa.PROIBIDAS.includes(`Bash(${c}:*)`)));
  }
  // Ferramentas: a massa não tem Bash livre; mapa-db só quando há mapa.
  assert.ok(!qa.FERRAMENTAS_MASSA('/m').includes('Bash') && qa.FERRAMENTAS_MASSA('/m').includes('Bash(/m/bin/mapa-db:*)') && !qa.FERRAMENTAS_MASSA('').some((f) => /mapa-db/.test(f)));
  assert.ok(qa.FERRAMENTAS_MASSA('/m').includes(`Bash(${path.join(__dirname, 'qa-state')}:*)`));
  const pc = qa._teste.promptCenario('K-1', { id: 'CT01', titulo: 'A', texto: 't' }, {}, [], '', ['log_nota']);
  assert.ok(/Proibido: escrever no banco[^.]*commit, push, merge e rebase/.test(pc) && pc.includes('OBRIGATÓRIAS') && pc.includes('log_nota') && pc.includes('qa-state pausa'));

  // ── Evidência obrigatória e, quando a implementação grava em tabela, a consulta SQL com o resultado.
  {
    const d = novoDir(); fs.mkdirSync(path.join(path.dirname(d), 'impl'));
    fs.writeFileSync(path.join(path.dirname(d), 'impl', 'plano-mudanca.md'), '# Plano\n- Grava um registro de auditoria na tabela LOG_NOTA a cada cancelamento.\n- Renomeia a tabela PEDIDO_X.\n');
    sincronizar(d, PLANO, 1);
    iniciarCenario(d, 'CT02', null);
    assert.throws(() => qa.concluirCenario(d, 'CT02', 'passou'), /não pode passar sem evidência/);
    const arq = path.join(d, 'print.png'); fs.writeFileSync(arq, 'x'); cli(d, 'evidencia', 'CT02', arq);
    qa.concluirCenario(d, 'CT02', 'passou', 'ok'); // CT02 não cita a tabela: basta a evidência
    iniciarCenario(d, 'CT01', null);
    assert.deepStrictEqual(qa.exigenciasDe(d, qa.cenarios(d).cenarios[0]), ['log_nota']);
    cli(d, 'evidencia', 'CT01', arq);
    assert.throws(() => cli(d, 'cenario', 'CT01', 'concluir', '--status', 'passou'), /grava na tabela log_nota/);
    const sql = path.join(d, 'consulta.sql'); fs.writeFileSync(sql, 'SELECT * FROM LOG_NOTA WHERE NOTA = 1;');
    const res = path.join(d, 'resultado-log_nota.txt'); fs.writeFileSync(res, '1 linha');
    cli(d, 'evidencia', 'CT01', sql); // só a consulta: ainda falta o resultado
    assert.throws(() => cli(d, 'cenario', 'CT01', 'concluir', '--status', 'passou'), /resultado/);
    cli(d, 'evidencia', 'CT01', res);
    cli(d, 'cenario', 'CT01', 'concluir', '--status', 'passou', '--nota', 'log gravado');
    assert.strictEqual(qa.cenarios(d).cenarios[0].status, 'passou');
    // falhou e bloqueado não exigem evidência (a falha tem que poder ser registrada)
    qa.refazer(d, 'CT02'); iniciarCenario(d, 'CT02', null); qa.concluirCenario(d, 'CT02', 'falhou', 'erro');
    assert.deepStrictEqual(sobras(d), []); // gravação atômica: nenhum .tmp sobrando
  }

  // ── Portão: o plano local só vai ao provedor no Aprovar; o texto normalizado pelo provedor não pede aprovação de novo.
  {
    const d = novoDir(), chamadas = [];
    fs.writeFileSync(path.join(d, 'qa-plano.md'), PLANO);
    qa.proporPlano(d, 'K-1');
    assert.deepStrictEqual([qa.estado(d).fase, qa.estado(d).publicarPendente, chamadas.length], ['plano_encontrado', true, 0]);
    await qa.verificarPlano(d, 'K-1', async () => { throw new Error('não deve ler o provedor com plano local pendente'); });
    assert.strictEqual(qa.estado(d).fase, 'plano_encontrado');
    let guardado = '';
    const deps = { chave: 'K-1', subtarefas: true, filhos: async () => (guardado ? [{ key: 'K-2', resumo: '[QA] Planejamento dos Casos de Testes', updated: 'x', md: `${guardado}\n\n_normalizado pelo provedor_` }] : []),
      criarSubtarefa: async (o) => { chamadas.push(['criar', o.descricao]); guardado = o.descricao; return { key: 'K-2' }; }, atualizarDescricao: async () => ({}), comentar: async () => {} };
    assert.ok(await qa.aprovarPublicando(d, deps));
    assert.deepStrictEqual([chamadas.length, qa.estado(d).fase, qa.estado(d).publicarPendente, qa.estado(d).subtarefa], [1, 'plano_aprovado', false, 'K-2']);
    const v = qa.versaoAtual(d);
    assert.strictEqual(qa.estado(d).aprovado.versao, v.v);
    await qa.verificarPlano(d, 'K-1', deps.filhos); // próximo ▶: o provedor devolve o mesmo texto aprovado
    assert.deepStrictEqual([qa.estado(d).fase, qa.versaoAtual(d).v], ['plano_aprovado', v.v]);
    // falha ao publicar: continua aguardando, com o erro, e nada fica aprovado
    const d2 = novoDir(); fs.writeFileSync(path.join(d2, 'qa-plano.md'), PLANO); qa.proporPlano(d2, 'K-1');
    await assert.rejects(qa.aprovarPublicando(d2, { ...deps, filhos: async () => [], criarSubtarefa: async () => { throw new Error('503'); } }), /503/);
    assert.deepStrictEqual([qa.estado(d2).fase, qa.estado(d2).publicarPendente], ['plano_encontrado', true]);
    // plano sem cenários não vira versão
    const d3 = novoDir(); fs.writeFileSync(path.join(d3, 'qa-plano.md'), 'só texto');
    assert.throws(() => qa.proporPlano(d3, 'K-1'), /não gravou/);
  }

  // ── Dossiê: o QA lê o que a Implementação entregou; só título vira pergunta; plano sem rastreio vira aviso.
  {
    const t = { chave: 'K-77', titulo: 'Cancelar nota' };
    const d = tickets.pasta(t.chave, 'qa'); fs.mkdirSync(d, { recursive: true });
    let r = entrada.preparar(t, d, { descricao: '', comentarios: [] });
    assert.ok(/só o título/.test(r.pergunta) && r.d.modo === 'perguntar' && fs.existsSync(path.join(d, 'dossie.md')));
    fs.writeFileSync(path.join(d, entrada.BRIEFING), 'Testar o cancelamento com nota já faturada.\n');
    r = entrada.preparar(t, d, { descricao: '', comentarios: [] });
    assert.strictEqual(r.pergunta, '');
    assert.ok(r.d.eixos.alvo.some((i) => i.fonte === 'briefing-qa' && i.confianca === 'verbal'));
    const impl = tickets.pasta(t.chave, 'impl'); fs.mkdirSync(impl, { recursive: true });
    fs.writeFileSync(path.join(impl, 'implementacao.md'), '# Resumo\nComo validar: cancelar nota.');
    r = entrada.preparar(t, d, { descricao: 'Descrição longa o bastante para virar a fonte bruta do ticket inteiro.', comentarios: [] });
    assert.ok(r.d.eixos.alvo.some((i) => i.fonte === 'implementacao') && fs.readFileSync(path.join(d, 'dossie.md'), 'utf8').includes('Resumo da implementação'));
    assert.ok(qa.promptCriar(d).includes(path.join(d, 'dossie.md')) && qa.promptCriar(d).includes('Confiança (aprovado, gerado, bruto, verbal ou inferido)'));
    assert.ok(qa.promptCriar(d).includes('qa-plano.md') && qa.promptCriar(d).includes('.pausa.json'));
    assert.strictEqual(qa.conferirPlano('# plano sem nada').length, 2);
    assert.strictEqual(qa.conferirPlano('## Critérios de aceite cobertos\n| CA | CT | Fonte | Confiança |\n| 1 | CT01 | ticket | bruto |').length, 0);
  }

  // ── Execução: interrompida, tempo e pausa que pergunta (Claude simulado, qa-state real).
  {
    const back = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-back-')); fs.mkdirSync(path.join(back, 'testes-funcionais'));
    fs.writeFileSync(path.join(back, 'testes-funcionais', 'preparar-ambiente.py'), 'import json\nprint(json.dumps({"ref":"v1","backend":"","mobile":"","parou_em":None,"pendentes":0,"itens":[]}))\n');
    const apiPlano = async () => [{ key: 'K-9', resumo: '[QA] Planejamento dos Casos de Testes', updated: 'x', md: '#### CT01 – A\n\n#### CT02 – B' }];
    const novo = async () => { const d = novoDir(); await qa.verificarPlano(d, 'K-1', apiPlano); qa.aprovar(d); return d; };
    const deps = { chave: 'K-1', backend: back, filhos: apiPlano, horaRefresh: '06:00', confirmar: async () => true };
    const veio = []; let acaoNoClaude = async () => {}, rodandoFlag = false, fim = () => {};
    maestro.rodar = (dir, o) => { veio.push({ titulo: o.titulo, prompt: o.prompt, ferramentas: o.ferramentas, env: o.env, proibidas: o.proibidas }); rodandoFlag = true; fim = o.aoMudar;
      Promise.resolve(acaoNoClaude(dir, o)).then((encerra = true) => { if (encerra) { rodandoFlag = false; o.aoMudar(); } }); return true; };
    maestro.rodando = () => rodandoFlag; maestro.parar = () => { rodandoFlag = false; fim(); };
    const evidenciaEPassa = (dir, id) => { const ev = path.join(os.tmpdir(), `e-${process.pid}-${id}.txt`); fs.writeFileSync(ev, 'ok'); cli(dir, 'evidencia', id, ev); cli(dir, 'cenario', id, 'concluir', '--status', 'passou'); };

    // Interrompida: janela fechada no meio (estado rodando com pid morto, cenário preso em executando) volta à fila e a retomada segue.
    const di = await novo(); iniciarCenario(di, 'CT01', null);
    qa.mudar(di, { execucao: 'rodando', host: 999999 });
    assert.ok(!qa.rodando(di) && qa.reconciliar(di));
    assert.deepStrictEqual([qa.estado(di).execucao, qa.cenarios(di).cenarios[0].status, qa.cenarios(di).cenarios[0].execucoes[0].status], ['parado', 'pendente', 'descartado']);
    assert.strictEqual(qa.reconciliar(di), false);
    // Botão do cabeçalho: ▶ parado, ⏸ rodando (mesmo componente da Implementação).
    const b = (a) => `data-acao="${a}"`;
    assert.ok(botaoPlay(di, b).includes('ct-play') && botaoPlay(di, b).includes('qaPlay'));
    qa.mudar(di, { execucao: 'rodando', host: process.ppid });
    assert.ok(botaoPlay(di, b).includes('ct-pausa') && botaoPlay(di, b).includes('qaParar'));
    qa.mudar(di, { execucao: 'parado' });

    // Tempo: o Claude não termina; passou do limite, a extensão para e bloqueia o cenário com a nota.
    const dt = await novo(); qa.mudar(dt, {}); // massa já válida
    qa.massaAdd(dt, { papel: 'p', cenarios: ['CT01', 'CT02'], dados: {} });
    acaoNoClaude = async () => false; // nunca encerra sozinho
    await qa.executar(dt, { ...deps, timeoutMin: 0.0005 });
    assert.strictEqual(qa.cenarios(dt).cenarios[0].status, 'bloqueado');
    assert.ok(/Passou de/.test(qa.cenarios(dt).cenarios[0].execucoes.at(-1).nota));
    assert.strictEqual(qa.estado(dt).execucao, 'parado');

    // Pausa que pergunta na massa: o Claude pergunta, a extensão para, a resposta vai para .respostas.md e a retomada a cita.
    const dp = await novo(); veio.length = 0;
    acaoNoClaude = async (dir) => { cli(dir, 'pausa', '--motivo', 'perfil', '--pergunta', 'Qual perfil usar?', '--opcoes', 'Operador|Supervisor'); };
    await qa.executar(dp, deps);
    assert.deepStrictEqual(veio.map((v) => v.titulo), ['QA · Levantando massa de dados']);
    assert.deepStrictEqual([qa.estado(dp).pausa?.pergunta, qa.estado(dp).pausa?.opcoes, qa.estado(dp).execucao], ['Qual perfil usar?', ['Operador', 'Supervisor'], 'pausado']);
    assert.ok(!fs.existsSync(path.join(dp, qa.PAUSA)) && qa.html(dp).includes('Qual perfil usar?') && qa.html(dp).includes('data-painel="qaResponder" data-op="1"'));
    await qa.executar(dp, deps); // com pergunta aberta não retoma
    assert.strictEqual(veio.length, 1);
    assert.throws(() => cli(dp, 'pausa', '--pergunta', 'x'), /só vale/); // pausa fora da massa ou de um cenário em execução é recusada
    assert.ok(qa.responder(dp, 'Supervisor') && !qa.estado(dp).pausa && !qa.responder(dp, 'x'));
    assert.ok(fs.readFileSync(path.join(dp, qa.RESPOSTAS), 'utf8').includes('Qual perfil usar?\nSupervisor'));
    // retomada: massa de novo, agora citando as respostas; no CT01 pergunta de novo (cenário volta à fila), responde, e conclui
    let passo = 0; veio.length = 0;
    acaoNoClaude = async (dir, o) => {
      if (/massa/.test(o.titulo)) return cli(dir, 'massa', 'add', '--papel', 'p', '--cenarios', 'CT01,CT02', '--dados', '{}');
      const id = o.titulo.match(/CT\d+/)[0];
      if (id === 'CT01' && passo++ === 0) return cli(dir, 'pausa', '--motivo', 'regra', '--pergunta', 'Nota faturada cancela?');
      evidenciaEPassa(dir, id);
    };
    await qa.executar(dp, deps);
    assert.ok(veio[0].prompt.includes(path.join(dp, qa.RESPOSTAS)));
    assert.deepStrictEqual(qa.cenarios(dp).cenarios.map((c) => c.status), ['pendente', 'pendente']);
    assert.deepStrictEqual([qa.cenarios(dp).cenarios[0].execucoes[0].status, qa.estado(dp).pausa?.pergunta], ['descartado', 'Nota faturada cancela?']);
    qa.responder(dp, 'Não');
    await qa.executar(dp, deps);
    assert.deepStrictEqual(qa.cenarios(dp).cenarios.map((c) => c.status), ['passou', 'passou']);
    // permissões da execução: cada claude -p leva as proibidas e a massa não tem Bash livre
    assert.ok(veio.every((v) => v.proibidas.includes('Bash(git push:*)')));
    assert.ok(veio.some((v) => /massa/.test(v.titulo)) && veio.filter((v) => /massa/.test(v.titulo)).every((v) => !v.ferramentas.includes('Bash')));
    // Banco: liberado só fora de produção, com mapa-db e log; produção/vazio = pendência no prompt, sem env
    const orig = vagas.raiz; vagas.raiz = () => '/mapa';
    const caso = async (banco) => {
      const dd = await novo(); veio.length = 0; acaoNoClaude = async () => {};
      await qa.executar(dd, { ...deps, banco }); return { dd, v: veio.find((x) => /massa/.test(x.titulo)) };
    };
    const ok = await caso({ conexao: 'c1', ambiente: 'copia-producao', sqlcl: '', sensiveis: ['cpf'] });
    assert.ok(ok.v.ferramentas.includes('Bash(/mapa/bin/mapa-db:*)') && ok.v.env.MAPA_DB_CONEXAO === 'c1' && ok.v.env.MAPA_DB_SENSIVEIS === 'cpf'
      && ok.v.env.MAPA_DB_LOG === path.join(ok.dd, '.mapa-db.jsonl') && ok.v.prompt.includes('configurado (cópia de produção)'));
    const prod = await caso({ conexao: 'c1', ambiente: 'producao', sqlcl: '', sensiveis: [] });
    assert.ok(!prod.v.ferramentas.some((f) => /mapa-db/.test(f)) && !prod.v.env.MAPA_DB_CONEXAO && prod.v.prompt.includes('NÃO configurado'));
    vagas.raiz = orig;
  }

  // ── Pelo painel (ticket por documento): plano com pergunta da IA, briefing e resposta que refaz o plano.
  {
    const fonte = path.join(home, 'regras.md'); fs.writeFileSync(fonte, '# Regras\nCancelar nota fiscal');
    const t = prov.criarPorDocumento(fonte, { listas: ['qa'] });
    const dir = tickets.pasta(t.chave, 'qa'), raiz = tickets.pasta(t.chave); fs.mkdirSync(dir, { recursive: true });
    const s = { secrets: {}, cacheJira: {}, render: () => {}, ticketAberto: () => t, pastaAba: () => dir, pedirSecao: () => {}, reposDe: () => [] };
    let gravaPlano = false;
    maestro.rodando = () => false;
    maestro.rodar = (d, o) => { setTimeout(() => {
      fs.mkdirSync(areaIA(d), { recursive: true });
      if (gravaPlano) fs.writeFileSync(path.join(areaIA(d), 'qa-plano.md'), PLANO);
      else fs.writeFileSync(path.join(areaIA(d), qa.PAUSA), JSON.stringify({ motivo: 'regra', pergunta: 'Qual a regra de cancelamento?', opcoes: ['24h', '48h'] }));
      o.aoMudar(); }, 5); return true; };
    await acoes(s).qaCriarPlano();
    for (let i = 0; i < 100 && !qa.estado(dir).pausa; i++) await dormir(20);
    assert.deepStrictEqual([qa.estado(dir).fase, qa.estado(dir).pausa.etapa, qa.estado(dir).pausa.opcoes], ['sem_plano', 'Planejamento', ['24h', '48h']]);
    assert.ok(!fs.existsSync(path.join(dir, qa.PLANO_LOCAL)) && qa.html(dir).includes('Qual a regra de cancelamento?'));
    gravaPlano = true;
    await acoes(s).qaResponder({ op: '1' }); // botão da opção "48h": refaz o plano com a resposta
    for (let i = 0; i < 100 && qa.estado(dir).fase !== 'plano_encontrado'; i++) await dormir(20);
    assert.deepStrictEqual([qa.estado(dir).fase, qa.estado(dir).pausa, qa.estado(dir).publicarPendente], ['plano_encontrado', null, true]);
    assert.ok(fs.readFileSync(path.join(dir, qa.RESPOSTAS), 'utf8').includes('48h'));
    assert.ok(!fs.existsSync(path.join(raiz, '.subtarefas.json'))); // nada publicado antes do Aprovar
    // ajuste pedido que gera pergunta: a resposta refaz o ajuste (o pedido segue no prompt), não o plano do zero
    let ultimo = '';
    const rodarAntes = maestro.rodar;
    maestro.rodar = (d, o) => { ultimo = o.prompt; return rodarAntes(d, o); };
    resposta = 'trocar o CT02 por reabertura';
    gravaPlano = false;
    await acoes(s).qaPlanoMudar();
    for (let i = 0; i < 100 && !qa.estado(dir).pausa; i++) await dormir(20);
    assert.ok(qa.estado(dir).pausa && qa.estado(dir).pedido === 'trocar o CT02 por reabertura' && qa.estado(dir).fase === 'plano_encontrado');
    gravaPlano = true;
    await acoes(s).qaResponder({ op: '0' });
    for (let i = 0; i < 100 && (qa.estado(dir).pausa || qa.estado(dir).fase !== 'plano_encontrado' || qa.estado(dir).versao < 1 || qa.estado(dir).pedido); i++) await dormir(20);
    assert.ok(ultimo.includes('trocar o CT02 por reabertura') && /pediu esta mudança/.test(ultimo) && qa.estado(dir).pausa === null && qa.estado(dir).pedido === null);
    // briefing: pedido pela extensão (ticket sem fonte); resposta por caixa de texto vira .briefing.md
    qa.mudar(dir, { fase: 'sem_plano', pausa: { motivo: 'briefing', pergunta: 'O que testar?', opcoes: [], etapa: 'Planejamento' } });
    resposta = 'Cancelar nota faturada';
    await acoes(s).qaResponder({});
    assert.ok(fs.readFileSync(path.join(dir, entrada.BRIEFING), 'utf8').includes('Cancelar nota faturada'));
    for (let i = 0; i < 100 && qa.estado(dir).pausa; i++) await dormir(20);
    assert.strictEqual(qa.estado(dir).pausa, null);
    assert.deepStrictEqual(rede, []);
  }
  // ── Massa por SQL: a IA propõe, você lê e aprova, a extensão executa numa transação; nunca produção; com SQL de desfazer.
  {
    const bancoMod = require('../infra/banco');
    const v = (sql) => bancoMod.validarAlteracao(sql);
    assert.ok(v("UPDATE pedido SET status = 'F' WHERE id = 10; INSERT INTO log_nota (id) VALUES (1)").ok && v('update t set a = 1 where b = 2').stmts.length === 1);
    for (const ruim of ['UPDATE pedido SET status = 1', 'DELETE FROM pedido', 'DROP TABLE pedido', "UPDATE t SET a = 1 WHERE b = 2; COMMIT", 'SELECT * FROM t', 'BEGIN x; END',
      'UPDATE t SET a = 1 WHERE b IN (SELECT 1 FROM x@link)', 'INSERT INTO t VALUES (dbms_random.value)', 'MERGE INTO t USING s ON (1=1) WHEN MATCHED THEN UPDATE SET a = 1', '']) assert.ok(!v(ruim).ok, ruim);
    assert.ok(v("UPDATE t SET a = 'sem where depois' WHERE id = 1").ok && !v("UPDATE t SET a = ' where '").ok); // WHERE dentro de string não conta

    // Executor: SQLcl falso lê o script do stdin. Produção e conexão sem ambiente não chegam nem a chamar o SQLcl.
    const fake = (corpo) => { const f = path.join(home, `sql-${Math.random().toString(36).slice(2)}`); fs.writeFileSync(f, `#!/bin/sh\ncat > "$SAIDA"\n${corpo}\n`); fs.chmodSync(f, 0o755); return f; };
    const saida = path.join(home, 'script-sql.txt'); process.env.SAIDA = saida;
    const bom = { conexao: 'qas-wms', ambiente: 'copia-producao', sqlcl: fake('echo "1 row updated."') };
    const r1 = await bancoMod.executar(bom, ["UPDATE t SET a = 1 WHERE id = 5"]);
    const script = fs.readFileSync(saida, 'utf8');
    assert.ok(r1.ok && /connect -name qas-wms\nwhenever sqlerror exit failure rollback/.test(script) && script.includes('UPDATE t SET a = 1 WHERE id = 5;') && script.trimEnd().endsWith('commit;\nexit'));
    fs.rmSync(saida);
    assert.ok(!(await bancoMod.executar({ ...bom, ambiente: 'producao' }, ['UPDATE t SET a = 1 WHERE id = 5'])).ok && !fs.existsSync(saida));
    assert.ok(!(await bancoMod.executar({ ...bom, ambiente: '' }, ['UPDATE t SET a = 1 WHERE id = 5'])).ok && !fs.existsSync(saida));
    assert.ok(!(await bancoMod.executar(bom, ['DROP TABLE t'])).ok && !fs.existsSync(saida));
    assert.ok(!(await bancoMod.executar({ ...bom, sqlcl: fake('echo "ORA-00001: unique constraint violated"') }, ['INSERT INTO t (a) VALUES (1)'])).ok);

    // Fluxo na esteira: massa → proposta → cartão → aprovar → massa registrada → cenários passam; recusar, erro e produção.
    const back = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-back-')); fs.mkdirSync(path.join(back, 'testes-funcionais'));
    fs.writeFileSync(path.join(back, 'testes-funcionais', 'preparar-ambiente.py'), 'import json\nprint(json.dumps({"ref":"v1","backend":"","mobile":"","parou_em":None,"pendentes":0,"itens":[]}))\n');
    const apiPlano = async () => [{ key: 'K-9', resumo: '[QA] Planejamento dos Casos de Testes', updated: 'x', md: '#### CT01 – A\n\n#### CT02 – B' }];
    const novo = async () => { const d = novoDir(); await qa.verificarPlano(d, 'K-1', apiPlano); qa.aprovar(d); return d; };
    const sqlRodado = []; let respostaSql = { ok: true, saida: '2 rows updated.' };
    const deps = { chave: 'K-1', backend: back, filhos: apiPlano, horaRefresh: '06:00', confirmar: async () => true,
      banco: { conexao: 'qas-wms', ambiente: 'copia-producao', sqlcl: '', sensiveis: [] }, executarSql: async (b, stmts) => { sqlRodado.push({ b, stmts }); return respostaSql; } };
    const veio = []; let fazer = async () => {};
    maestro.rodando = () => false; maestro.parar = () => {};
    maestro.rodar = (dir, o) => { veio.push(o); Promise.resolve(fazer(dir, o)).then(() => o.aoMudar()); return true; };
    const cliEnv = (dir, env, ...a) => execFileSync(path.join(__dirname, 'qa-state'), a, { env: { ...process.env, QA_DIR: dir, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    const propor = (dir, o) => cliEnv(dir, o.env, 'massa', 'proposta', '--papel', 'pedido faturado', '--cenarios', 'CT01,CT02', '--dados', '{"NUMPEDIDO":77,"STATUS":"F"}',
      '--sql', "UPDATE pedido SET status = 'F' WHERE numpedido = 77; INSERT INTO log_nota (id, nota) VALUES (1, 77)", '--desfazer', "UPDATE pedido SET status = 'A' WHERE numpedido = 77; DELETE FROM log_nota WHERE id = 1 AND nota = 77", '--porque', 'nenhum pedido faturado na cópia');
    const passa = (dir, id) => { const ev = path.join(os.tmpdir(), `s-${process.pid}-${id}.txt`); fs.writeFileSync(ev, 'ok'); cliEnv(dir, {}, 'evidencia', id, ev); cliEnv(dir, {}, 'cenario', id, 'concluir', '--status', 'passou'); };

    const d = await novo();
    fazer = async (dir, o) => { if (/massa/.test(o.titulo)) propor(dir, o); };
    await qa.executar(d, deps);
    assert.ok(veio[0].prompt.includes('PROPONHA o lote') && veio[0].env.QA_BANCO_ESCRITA === '1');
    assert.deepStrictEqual([qa.estado(d).pausa.motivo, qa.estado(d).pausa.opcoes, qa.estado(d).execucao, sqlRodado.length], ['massa-sql', ['Aprovar e executar', 'Recusar'], 'pausado', 0]);
    const h = qa.html(d);
    assert.ok(h.includes("UPDATE pedido SET status = &#39;F&#39; WHERE numpedido = 77") && h.includes('SQL de desfazer (2)') && h.includes('nenhum pedido faturado na cópia') && h.includes('data-op="0"'));
    // erro do banco: nada gravado, proposta continua, pausa vira pergunta
    respostaSql = { ok: false, saida: 'ORA-02291: integrity constraint violated' };
    assert.strictEqual((await qa.aplicarProposta(d, deps)).ok, false);
    assert.deepStrictEqual([qa.estado(d).pausa.motivo, qa.massa(d).itens.length, !!qa.propostaMassa(d)], ['massa-sql-erro', 0, true]);
    // aprovado: executa o lote (SQL e conexão) e registra a massa com origem e desfazer
    respostaSql = { ok: true, saida: '2 rows updated.' };
    const ap = await qa.aplicarProposta(d, deps);
    assert.ok(ap.ok && sqlRodado.at(-1).b.conexao === 'qas-wms' && sqlRodado.at(-1).stmts.length === 2);
    const item = qa.massa(d).itens[0];
    assert.deepStrictEqual([item.origem, item.estado, item.cenarios, item.desfazer.length, item.dados.NUMPEDIDO, qa.estado(d).pausa, !!qa.propostaMassa(d)], ['sql', 'valida', ['CT01', 'CT02'], 2, 77, null, false]);
    const log = fs.readFileSync(path.join(d, qa.LOG_SQL), 'utf8').trim().split('\n').map((x) => JSON.parse(x));
    assert.deepStrictEqual(log.map((x) => [x.tipo, x.ok]), [['aplicar', false], ['aplicar', true]]);
    assert.ok(log[1].sql.length === 2 && log[1].desfazer.length === 2 && log[1].conexao === 'qas-wms');
    assert.ok(qa.massaHtml(d).includes('Desfazer no banco') && qa.massaHtml(d).includes('data-acao="qaMassaDesfazer"'));
    // retomada: a massa já existe, os cenários rodam sem nova busca
    veio.length = 0; fazer = async (dir, o) => passa(dir, o.titulo.match(/CT\d+/)[0]);
    await qa.executar(d, deps);
    assert.deepStrictEqual([veio.map((x) => x.titulo), qa.cenarios(d).cenarios.map((c) => c.status)], [['QA · CT01 · A', 'QA · CT02 · B'], ['passou', 'passou']]);
    // desfazer: roda o SQL de desfazer e invalida o item
    assert.ok(await qa.desfazerMassa(d, 'M1', deps));
    assert.deepStrictEqual([sqlRodado.at(-1).stmts[0].startsWith("UPDATE pedido SET status = 'A'"), qa.massa(d).itens[0].estado], [true, 'invalida']);
    assert.throws(() => cliEnv(d, { QA_BANCO_ESCRITA: '1' }, 'massa', 'proposta', '--cenarios', 'CT01', '--sql', 'x', '--desfazer', 'y'), /só vale na Etapa 4/);

    // recusar: nada executa, a proposta some
    const dr = await novo(); const antes = sqlRodado.length; veio.length = 0;
    fazer = async (dir, o) => { if (/massa/.test(o.titulo)) propor(dir, o); };
    await qa.executar(dr, deps);
    qa.recusarProposta(dr);
    assert.deepStrictEqual([sqlRodado.length - antes, qa.estado(dr).pausa, !!qa.propostaMassa(dr)], [0, null, false]);
    assert.ok(JSON.parse(fs.readFileSync(path.join(dr, qa.LOG_SQL), 'utf8').trim().split('\n').at(-1)).tipo === 'recusar');

    // produção (ou sem ambiente): a IA nem recebe a escrita; o qa-state recusa e o executor padrão também
    const dp = await novo(); veio.length = 0;
    let recusouCli = '';
    fazer = async (dir, o) => { if (/massa/.test(o.titulo)) { try { propor(dir, o); } catch (e) { recusouCli = String(e.stderr || e.message); } } };
    await qa.executar(dp, { ...deps, banco: { conexao: 'x', ambiente: 'producao', sqlcl: '', sensiveis: [] } });
    assert.ok(!veio[0].prompt.includes('PROPONHA o lote') && !veio[0].env.QA_BANCO_ESCRITA && /não está liberada/.test(recusouCli));
    fs.writeFileSync(path.join(dp, qa.PROPOSTA), JSON.stringify({ papel: 'p', cenarios: ['CT01'], dados: {}, sql: ['UPDATE t SET a = 1 WHERE id = 1'], desfazer: ['UPDATE t SET a = 2 WHERE id = 1'], porque: '' }));
    const bloq = await qa.aplicarProposta(dp, { banco: { conexao: 'x', ambiente: 'producao', sqlcl: '' } }); // executor padrão
    assert.deepStrictEqual([bloq.ok, qa.massa(dp).itens.length], [false, 0]);
    assert.deepStrictEqual(rede, []);
  }
  console.log('ok esteira qa');
})().catch((e) => { console.error(e); process.exit(1); });
