// node teste-vinculados-ferramenta.js
// A caixa "Vinculados a você" só existe com ferramenta de gestão cadastrada (conta conectada no provedor ativo):
// sem conta não há caixa nem busca; conectada mas incompleta mostra as pendências; completa mostra os itens; ticket-documento segue na lista.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-vinc-'));
const Module = /** @type {any} */ (require('module')); const load = Module._load;
let pend = [];
const cfgStub = { siteJira: () => 'https://x.atlassian.net', projetoJira: () => ['WMS'], boardsJira: () => ['B'], pendencias: async () => pend };
const vscode = { workspace: { getConfiguration: () => ({ get: () => undefined, update: async () => {} }) }, window: {}, env: {}, Uri: { parse: (x) => x, file: (f) => ({ fsPath: f }) }, EventEmitter: class { fire() {} } };
Module._load = (r, ...a) => (r === 'vscode' ? vscode : r === '../configuracao/configuracao' ? cfgStub : load(r, ...a));
const jira = require('../infra/ticket').jira;
const tickets = require('../infra/tickets');
const lista = require('../painel/lista');

let conta = false, rede = 0, apiOk = true;
const item = { key: 'WMS-1', resumo: 'Vinculado de teste', status: 'Em andamento', tipo: 'Task' };
jira.conectado = async () => conta;
for (const n of ['meus', 'etapas', 'labels', 'boardsPorNome']) jira[n] = async () => { rede++; if (!apiOk) throw new Error('rede'); return n === 'meus' ? [item] : []; };
const estado = new Map();
const s = { secrets: {}, globalState: { get: (k) => estado.get(k), update: async (k, v) => { estado.set(k, v); } }, render: () => {}, cacheJira: {}, atualizarJira() {} };
const espera = () => new Promise((r) => setTimeout(r, 20));
const html = async (modo) => {
  await lista.acoes(s).listaModo({ id: modo }); // troca o módulo
  lista.carregarSeNecessario(s); await espera();
  return lista.corpo(s, '', () => false);
};
const MODOS = ['refinamento', 'impl', 'qa', 'incidentes'];

(async () => {
  lista.iniciar(s.globalState);
  // Sem conta: nenhuma caixa, nenhuma busca.
  for (const m of MODOS) { const h = await html(m); assert.ok(!h.includes('class="meus"') && !h.includes('Vinculados a você') && !h.includes('Com a label') && !h.includes('meusAtualizar'), m); assert.ok(h.includes('data-acao="novo"'), m); }
  assert.strictEqual(rede, 0);

  // Conectada com pendências: a caixa avisa e não busca.
  conta = true; pend = ['projeto'];
  lista.resetar();
  for (const m of MODOS) { const h = await html(m); assert.ok(h.includes('class="meus"') && h.includes('falta projeto'), m); }
  assert.strictEqual(rede, 0);

  // Completa: itens.
  pend = []; lista.resetar();
  for (const m of ['refinamento', 'impl', 'incidentes']) { const h = await html(m); assert.ok(h.includes('WMS-1') && h.includes('class="meus"'), m); }
  assert.ok(rede > 0);

  // Sair da conta: some sem resetar() de fora; conectar de novo: volta.
  conta = false; rede = 0;
  let h = await html('refinamento');
  assert.ok(!h.includes('class="meus"') && rede === 0);
  conta = true;
  h = await html('refinamento');
  assert.ok(h.includes('class="meus"') && h.includes('WMS-1'));

  // Ticket por documento aparece na lista local com e sem conta.
  const t = tickets.gravar({ chave: 'DOC-1', titulo: 'Ticket do documento', provedor: 'documento', site: 'documento:doc-1', listas: ['refinamento'], conversas: [] });
  for (const c of [false, true]) { conta = c; h = await html('refinamento'); assert.ok(h.includes('DOC-1'), String(c)); assert.strictEqual(h.includes('class="meus"'), c); }
  console.log('ok vinculados-ferramenta');
})().catch((e) => { console.error(e); process.exit(1); });
