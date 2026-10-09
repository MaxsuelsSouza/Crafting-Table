// node teste-teams.js — VS Code simulado + fetch falso, HOME temporário
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'teams-'));
const avisos = [];
const Module = require('module'); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? { window: { showWarningMessage: (m) => avisos.push(m), setStatusBarMessage: (m) => avisos.push(m) } } : r === './emulador' ? {} : load(r, ...a));
const tickets = require('./tickets');
const { ciclo } = require('./teams')._teste;

const URL = 'https://x.logic.azure.com/segredo123';
let posts = [], status = 200;
global.fetch = async (u, o) => { posts.push({ u, corpo: JSON.parse(o.body) }); return { ok: status < 400, status }; };
const estado = {}, secrets = { get: async () => secrets.url }, ctx = { secrets, globalState: { get: (k) => estado[k], update: async (k, v) => { estado[k] = v; } } };

tickets.criar('https://ex.atlassian.net/browse/WMS-1');
const dir = tickets.pasta('WMS-1'), arq = path.join(dir, '.notificacoes.jsonl');
const T0 = Date.now() - 3600e3;
const linha = (seg, tipo, texto) => ({ em: new Date(T0 + seg * 1000).toISOString(), tipo, texto });
const grava = (ls) => fs.appendFileSync(arq, ls.map((l) => JSON.stringify(l)).join('\n') + '\n');
const titulo = (p) => p.corpo.attachments[0].content.body[0].text;

(async () => {
  // sem URL: nada é enviado
  grava([linha(0, 'sdd', 'passo 3 pronto')]);
  await ciclo(ctx, T0 + 3600e3); assert.strictEqual(posts.length, 0);

  // primeira vez com URL: o que já existe conta como enviado
  secrets.url = URL;
  await ciclo(ctx, T0 + 10e3); assert.strictEqual(posts.length, 0);

  // só os tipos ligados, impacto só médio/alto, rajada agrupada, card rico
  fs.writeFileSync(path.join(dir, '.impactos.json'), JSON.stringify([{ id: '9', autor: 'PO Fulano', nivel: 'alto', resumo: 'Separação passa a ser por onda', passo: 1, cards: ['t01'], link: 'https://ex/c9' }]));
  grava([linha(20, 'fim', 'terminou'), linha(21, 'duvida', 'd'), linha(22, 'permissao', 'p'),
    linha(23, 'impacto', 'Comentário novo de X: analisando o impacto no refinamento'),
    linha(24, 'mudanca', 'Comentário de Y: impacto BAIXO — nada'),
    linha(25, 'mudanca', 'Comentário de PO Fulano: impacto ALTO — Separação passa a ser por onda'),
    linha(25, 'impacto', 'Comentário de PO Fulano: impacto ALTO — o tipo antigo não vai mais'),
    linha(26, 'pergunta', 'q1: a'), linha(30, 'pergunta', 'q2: b'), linha(35, 'pergunta', 'q3: c'),
    linha(40, 'jira', 'subtarefa WMS-960 [QA] criada')]);
  await ciclo(ctx, T0 + 45e3); assert.strictEqual(posts.length, 0, 'rajada ainda rolando');
  await ciclo(ctx, T0 + 70e3);
  assert.deepStrictEqual(posts.map(titulo), ['WMS-1 · Mudança pedida · ALTO', 'WMS-1 · Perguntas', 'WMS-1 · Jira']);
  const imp = posts[0].corpo.attachments[0].content;
  assert.strictEqual(imp.body[0].color, 'Attention');
  assert.deepStrictEqual(imp.body[2].facts, [{ title: 'Spec', value: 'passo 1 afetado' }, { title: 'Revisar', value: 't01' }]);
  assert.deepStrictEqual(imp.actions.map((a) => a.url), ['https://ex.atlassian.net/browse/WMS-1', 'https://ex/c9']);
  assert.strictEqual(posts[1].corpo.attachments[0].content.body[1].text, 'O Claude tem 3 perguntas esperando você');
  assert.ok(posts.every((p) => p.u === URL));

  assert.ok(imp.body[1].text.endsWith('Nada foi alterado: decida no painel.'));

  // não repete
  posts = []; await ciclo(ctx, T0 + 200e3); assert.strictEqual(posts.length, 0);

  // refinamento iniciado por outra pessoa: o aviso de mudança não sai daqui
  tickets.gravar({ ...tickets.ler('WMS-1'), refinamento: { estado: 'rodando', iniciadoPor: 'outra-pessoa' } });
  grava([linha(250, 'mudanca', 'Comentário de Z: impacto ALTO — x')]);
  posts = []; await ciclo(ctx, T0 + 300e3); assert.strictEqual(posts.length, 0);
  tickets.gravar({ ...tickets.ler('WMS-1'), refinamento: { estado: 'rodando' } });

  // falha: não avança e avisa sem a URL; 3 falhas seguidas pausam; trocar a URL destrava
  grava([linha(300, 'sdd', 'passo 4 pronto')]); status = 403;
  for (let i = 0; i < 3; i++) await ciclo(ctx, T0 + 400e3);
  assert.strictEqual(posts.length, 3);
  assert.ok(avisos[0].includes('403') && avisos.every((a) => !a.includes('segredo123')));
  await ciclo(ctx, T0 + 400e3); assert.strictEqual(posts.length, 3, 'pausado');
  secrets.url = URL + 'novo'; status = 200; posts = [];
  await ciclo(ctx, T0 + 400e3); assert.strictEqual(posts.length, 1);
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
