// node teste-identidade.js: identidade do ticket sem presumir o formato do Jira (id × chave, pasta segura, card antigo, sessão sem regex)
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? { EventEmitter: class { fire() {} }, workspace: {} } : load(r, ...a));
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ident-'));
const tk = require('../infra/tickets');
const jira = require('../provedores/jira');

// Jira: nada muda (id = chave, pasta = chave, projeto vem do adaptador).
const lj = jira.lerLink('https://x.atlassian.net/browse/WMS-123');
assert.deepStrictEqual([lj.id, lj.chave, lj.projeto], ['WMS-123', 'WMS-123', 'WMS']);
const tj = tk.criar('https://x.atlassian.net/browse/WMS-123', {}, { ...lj, provedor: 'jira' });
assert.strictEqual(tk.pasta('WMS-123'), path.join(tk.RAIZ, 'WMS-123'));
assert.deepStrictEqual([tj.provedor, tj.projeto], ['jira', 'WMS']);
const arq = JSON.parse(fs.readFileSync(path.join(tk.RAIZ, 'WMS-123', '.ticket.json'), 'utf8'));
assert.deepStrictEqual([arq.id, arq.chave, arq.provedor, arq.idProvedor], ['WMS-123', 'WMS-123', 'jira', undefined]);
assert.strictEqual(jira.chaveDaBranch('feature/wms-13429-x'), 'WMS-13429');
assert.strictEqual(jira.chaveDaBranch('main'), null);

// Monday (id numérico) e Notion (UUID, chave de exibição com caracteres ruins): a pasta nasce da chave saneada.
const m = tk.criar('https://x.monday.com/boards/1/pulses/5012345678', {}, { id: '5012345678', chave: '5012345678', site: 'https://x.monday.com', provedor: 'monday' });
assert.strictEqual(tk.ler(m.chave).idProvedor, '5012345678');
const uuid = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';
const n = tk.criar('https://www.notion.so/Titulo-' + uuid.replace(/-/g, ''), {}, { id: uuid, chave: 'Fluxo de entrada/saída #7', site: 'https://www.notion.so', provedor: 'notion' });
const nome = path.basename(tk.pasta(n.chave));
assert.ok(/^[\p{L}\p{N}._-]+$/u.test(nome) && !nome.includes('/'), nome);
assert.ok(fs.existsSync(path.join(tk.pasta(n.chave), '.ticket.json')));
assert.strictEqual(tk.ler(n.chave).idProvedor, uuid);
assert.deepStrictEqual(tk.alvo(tk.ler(n.chave)), { key: uuid, site: 'https://www.notion.so', provedor: 'notion' });
assert.strictEqual(tk.nomeSeguro('../../etc'), 'etc');
assert.strictEqual(tk.nomeSeguro('WMS-123'), 'WMS-123');
assert.strictEqual(tk.listar().length, 3);
// abaDaPasta devolve a chave do ticket, não o nome da pasta
assert.deepStrictEqual(tk.abaDaPasta(tk.pasta(n.chave, 'qa')), { chave: n.chave, lista: 'qa' });
// vínculo de conversa com chave não-Jira
tk.vincular('sid-1', n.chave, 'qa');
assert.deepStrictEqual([tk.ticketDa('sid-1'), tk.listaDa('sid-1')], [tk.nomeSeguro(n.chave), 'qa']);

// Ticket antigo (sem id/provedor) continua valendo.
fs.mkdirSync(path.join(tk.RAIZ, 'OLD-1'), { recursive: true });
fs.writeFileSync(path.join(tk.RAIZ, 'OLD-1', '.ticket.json'), JSON.stringify({ chave: 'OLD-1', site: 's', conversas: [], criado: 1 }));
assert.deepStrictEqual([tk.ler('OLD-1').idProvedor, tk.ler('OLD-1').provedor], ['OLD-1', 'jira']);

// Sessão: ticket × conversa pela existência do .ticket.json, sem regex.
const sessao = require('../infra/sessao');
assert.strictEqual(sessao.pasta('5012345678'), tk.pasta('5012345678'));
assert.strictEqual(sessao.pasta(n.chave), tk.pasta(n.chave));
assert.strictEqual(sessao.pasta('WMS-123'), tk.pasta('WMS-123'));
assert.strictEqual(sessao.pasta(uuid), path.join(sessao.RAIZ, uuid)); // não é ticket nenhum: conversa avulsa
assert.strictEqual(sessao.pasta('WMS-999'), path.join(sessao.RAIZ, 'WMS-999')); // parece Jira mas não existe: conversa

// Card antigo com `jira` é lido como `ticket`.
const { tarefasDe, TAREFAS } = require('../refinamento/locais');
const dir = tk.pasta('WMS-123');
fs.writeFileSync(path.join(dir, TAREFAS), JSON.stringify([{ id: 't01', jira: 'WMS-124' }, { id: 't02', ticket: 'WMS-125' }, { id: 't03', jira: null }]));
assert.deepStrictEqual(tarefasDe(dir).map((c) => [c.ticket, c.jira]), [['WMS-124', undefined], ['WMS-125', undefined], [null, undefined]]);
console.log('ok identidade');
