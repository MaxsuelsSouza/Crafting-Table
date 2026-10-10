// @ts-check
// node refinamento/teste-mudancas.js — fluxo de mudança por comentário: análise só leitura, decisão pendente, snapshot/desfazer e telas
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { spawnSync } = require('child_process');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-home-'));
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? new Proxy({}, { get: () => new Proxy(function () {}, { get: () => () => {}, apply: () => {} }) }) : load(r, ...a));
const mud = require('./mudancas');
const { caixaDecisao, caixaMudancas } = mud;
const { telaConstituicao, telaTarefas, cabecalho } = require('../painel')._teste;

// ── mudancas.js: passos em atenção, snapshot, alterou, restaurar ──
const imp = (o) => ({ id: '9', autor: 'PO Fulano', data: '2026-10-08T10:00:00Z', link: 'https://j/9', texto: 'o botão agora é vermelho', resumo: 'Cor do botão muda', ...o });
const pend = imp({ status: 'aguardando_decisao', nivel: 'alto', passo: 3, cards: ['t02', 'qa'], opcoes: [{ rotulo: 'Aplicar: botão vermelho', tipo: 'aplicar' }] });
assert.deepStrictEqual([...mud.passosAfetados([pend])], [3, 4, 5, 6]);
assert.deepStrictEqual([...mud.passosAfetados([{ ...pend, status: 'descartado' }])], [], 'decidida não marca nada');
assert.deepStrictEqual([...mud.cardsAfetados([pend])], ['t02', 'qa']);

const tk = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-tk-')), spec = path.join(tk, 'spec');
fs.mkdirSync(spec);
fs.writeFileSync(path.join(spec, 'spec.md'), 'azul'); fs.writeFileSync(path.join(spec, 'plan.md'), 'plano');
fs.writeFileSync(path.join(tk, '.tarefas.json'), '[{"id":"t01"}]');
mud.snapshot(tk, spec, 'a9');
assert.strictEqual(mud.alterou(tk, spec, 'a9'), false);
fs.writeFileSync(path.join(spec, 'spec.md'), 'vermelho');
assert.strictEqual(mud.alterou(tk, spec, 'a9'), true, 'texto mudou');
fs.writeFileSync(path.join(spec, 'spec.md'), 'azul'); fs.writeFileSync(path.join(spec, 'novo.md'), 'x');
assert.strictEqual(mud.alterou(tk, spec, 'a9'), true, 'arquivo novo');
fs.writeFileSync(path.join(spec, 'sdd-state.json'), '{}'); fs.rmSync(path.join(spec, 'novo.md'));
assert.strictEqual(mud.alterou(tk, spec, 'a9'), false, 'o estado é regravado pelo status: não conta');
// aplicar e desfazer
mud.snapshot(tk, spec, '9');
fs.writeFileSync(path.join(spec, 'spec.md'), 'vermelho'); fs.writeFileSync(path.join(spec, 'novo.md'), 'x'); fs.rmSync(path.join(spec, 'plan.md'));
fs.writeFileSync(path.join(tk, '.tarefas.json'), '[{"id":"t01","revisao":{}}]');
assert.strictEqual(mud.restaurar(tk, spec, '9'), true);
assert.strictEqual(fs.readFileSync(path.join(spec, 'spec.md'), 'utf8'), 'azul');
assert.strictEqual(fs.readFileSync(path.join(spec, 'plan.md'), 'utf8'), 'plano');
assert.ok(!fs.existsSync(path.join(spec, 'novo.md')));
assert.strictEqual(fs.readFileSync(path.join(tk, '.tarefas.json'), 'utf8'), '[{"id":"t01"}]');
assert.strictEqual(mud.restaurar(tk, spec, 'inexistente'), false);

// ── telas: caixa vermelha, passos e cards laranja, trava ──
const html = caixaDecisao([pend, imp({ id: '10', status: 'aguardando_decisao', nivel: 'baixo', opcoes: [] })]);
assert.ok(html.includes('class="dec-caixa"') && html.includes('A spec ainda não foi alterada') && html.includes('+1 na fila'));
assert.ok(html.includes('Aplicar: botão vermelho') && html.includes('data-op="nao"') && html.includes('Não prosseguir'));
assert.strictEqual(caixaDecisao([{ ...pend, status: 'descartado' }]), '', 'sem pendência não há caixa');
assert.ok(!caixaMudancas([pend]).includes('mud-tx'), 'a pendente só aparece na caixa de decisão');

const passos = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ n, titulo: `P${n}`, arquivo: `a${n}.md`, status: n < 4 ? 'aprovado' : n === 4 ? 'aguardando_revisao' : 'pendente', hash: 'h', resumo: {} }));
const est = { feature: 'f', proximaAcao: '', passos, perguntas: [], achados: [] };
const r = { id: 'WMS-1', spec: { repo: '/r', dir: 'd' } };
const tela = (l) => telaConstituicao(r, est, new Set(['WMS-1:4:h']), l);
const conta = (h, re) => (h.match(re) || []).length;
let h = tela([pend]);
assert.strictEqual(conta(h, /s-atencao/g), 2, 'passos 3 e 4 (começados e afetados); 5 e 6 pendentes ficam como estão');
assert.ok(/class="aprovar travado"[^>]*disabled/.test(h), 'Aprovar travado com decisão pendente');
h = tela([{ ...pend, status: 'descartado' }]);
assert.strictEqual(conta(h, /s-atencao/g), 0);
assert.ok(!/class="aprovar travado"[^>]*disabled/.test(h), 'decidida libera o Aprovar');

const tarefas = [{ id: 't02', titulo: 'x', status: 'pendente' }, { id: 't03', titulo: 'y', status: 'pendente' }];
const th = telaTarefas({ chave: 'WMS-1' }, tarefas, [pend]);
assert.strictEqual(conta(th, /class="tcard[^"]*tatencao/g), 1, 'só t02 está afetado');

// ── sdd-state: análise registra opções e trava iniciar/aprovar até decidir ──
const SDD = path.join(__dirname, '../../plugin/plugins/sdd/bin/sdd-state');
const sdd = (...a) => spawnSync('node', [SDD, ...a, '--ref', ref], { encoding: 'utf8' });
const ref = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-ref-')), repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mud-repo-'));
fs.writeFileSync(path.join(ref, 'meta.json'), JSON.stringify({ titulo: 'Botao' }));
assert.strictEqual(sdd('init', '--repo', repo).status, 0);
const arq = path.join(ref, '.impactos.json'), lerI = () => JSON.parse(fs.readFileSync(arq, 'utf8'));
fs.writeFileSync(arq, JSON.stringify([{ id: '9', autor: 'PO Fulano', texto: 't', link: 'l', status: 'analisando' }]));
const reg = (...a) => sdd('impacto', 'registrar', '9', '--nivel', 'alto', '--resumo', 'cor muda', '--passo', '1', '--cards', 't01', ...a);
assert.notStrictEqual(reg().status, 0, 'impacto sem opções é recusado');
assert.notStrictEqual(reg('--opcoes', '[{"rotulo":"x","tipo":"inventado"}]').status, 0);
assert.notStrictEqual(reg('--opcoes', '[]').status, 0);
const OP = '[{"rotulo":"Aplicar: vermelho (Recomendado)","tipo":"aplicar","instrucao":"trocar a cor"},{"rotulo":"Manter azul","tipo":"manter"}]';
let x = reg('--opcoes', OP);
assert.strictEqual(x.status, 0, x.stderr);
assert.deepStrictEqual([lerI()[0].status, lerI()[0].opcoes.length, lerI()[0].opcoes[1].instrucao], ['aguardando_decisao', 2, '']);
assert.ok(fs.readFileSync(path.join(ref, '.notificacoes.jsonl'), 'utf8').includes('"tipo":"mudanca"'));
x = sdd('iniciar', '0');
assert.strictEqual(x.status, 4, 'iniciar travado'); assert.ok(x.stderr.includes('aguardando decisão'));
assert.strictEqual(sdd('aprovar', '0', '--por', 'eu').status, 4, 'aprovar travado');
assert.notStrictEqual(sdd('impacto', 'aplicado', '9', '--resumo', 'r').status, 0, 'aplicado só depois de aplicando');
// decidiu (a extensão grava o status): libera e o Claude fecha a aplicação
const l = lerI(); l[0].status = 'aplicando'; fs.writeFileSync(arq, JSON.stringify(l));
assert.strictEqual(sdd('iniciar', '0').status, 0, 'sem pendência, iniciar passa');
assert.strictEqual(sdd('impacto', 'aplicado', '9', '--resumo', 'spec.md atualizado').status, 0);
assert.strictEqual(lerI()[0].status, 'aplicado');
// nível nenhum não abre decisão
fs.writeFileSync(arq, JSON.stringify([{ id: '9', autor: 'X', status: 'analisando' }]));
assert.strictEqual(sdd('impacto', 'registrar', '9', '--nivel', 'nenhum', '--resumo', 'obrigado').status, 0);
assert.strictEqual(lerI()[0].status, 'analisado');

// menu do cabeçalho: cada lista com as suas abas (componentes/menu-abas.js); Evidências logo depois de Docs só no QA
const sessao = require('../sessao');
const abasNa = (lista) => { sessao.focoLista = () => lista; return [...cabecalho({ id: 'WMS-1', chave: 'WMS-1' }, { aba: 'docs', secao: 'claudeAbas.painel', dentro: true })
  .matchAll(/data-(?:id|secao)="([^"]+)"[^>]*>(?:Docs|Spec|Ticket|Análise|Tarefas|Decisões|Dúvidas|Massa|Evidências|Conversas)/g)].map((m) => m[1]); };
assert.deepStrictEqual(abasNa('refinamento'), ['docs', 'spec', 'ticket', 'analise', 'tarefas', 'decisoes', 'duvidas', 'claudeAbas.conversas']);
assert.deepStrictEqual(abasNa('impl'), ['docs', 'ticket', 'decisoes', 'claudeAbas.conversas']);
assert.deepStrictEqual(abasNa('qa'), ['docs', 'claudeAbas.evidencias', 'ticket', 'decisoes', 'massa', 'claudeAbas.conversas']);
console.log('ok');
