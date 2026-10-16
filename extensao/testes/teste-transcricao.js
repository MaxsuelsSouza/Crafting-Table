// node teste-transcricao.js: conversa de etapa em segundo plano aberta só para leitura dentro da aba Conversas
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'));
process.env.HOME = home;
const Module = require('module'), carregar = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? { workspace: { workspaceFolders: [{ uri: { fsPath: home } }] }, window: {}, commands: {}, env: {}, Uri: {}, EventEmitter: class { constructor() { this.event = () => ({}); } fire() {} }, Disposable: { from: () => ({}) } } : carregar(r, ...a));
const tr = require('../componentes/transcricao');

const L = (o) => JSON.stringify(o);
const bg = path.join(home, 'bg.jsonl'), chat = path.join(home, 'chat.jsonl');
fs.writeFileSync(bg, [
  L({ type: 'user', timestamp: '2026-10-14T12:00:00Z', message: { role: 'user', content: '[segundo plano] [Crafting Table · Incidente WMS-1] Etapa 1 <b>x</b>' } }),
  L({ type: 'assistant', timestamp: '2026-10-14T12:00:01Z', message: { model: 'claude-x', content: [{ type: 'thinking', thinking: 'preciso ler o ticket' }, { type: 'text', text: 'Vou ler o contexto.' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/a/b.md' } }, { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'ls -la', description: 'Lista arquivos' } }] } }),
  L({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'conteúdo do <arquivo>' }, { type: 'tool_result', tool_use_id: 't2', content: 'This command requires approval', is_error: true }] } }),
  L({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'text', text: 'SUBAGENTE' }] } }),
  L({ type: 'custom-title', customTitle: 'WMS-1 · Mergulho · Etapa 1' }),
  L({ type: 'cost-state', totalCostUSD: 0.5, totalDuration: 51000 }), 'linha corrompida'
].join('\n'));
fs.writeFileSync(chat, L({ type: 'user', message: { role: 'user', content: 'oi, conversa normal' } }));

assert.ok(tr.ehSegundoPlano(bg) && !tr.ehSegundoPlano(chat) && !tr.ehSegundoPlano(path.join(home, 'nao-existe.jsonl')));
const h = tr.html(bg);
// pedido, pensamento, fala, ferramentas com resultado, erro marcado; subagente e linha corrompida ignorados; tudo escapado
for (const t of ['Pedido enviado ao Claude', 'Pensamento', 'preciso ler o ticket', 'Vou ler o contexto.', 'Leu /a/b.md', 'Lista arquivos', 'ls -la', 'conteúdo do &#60;arquivo&#62;', 'requires approval', 'tr-erro', 'WMS-1 · Mergulho · Etapa 1', 'US$ 0,50', '2 ação(ões)']) assert.ok(h.includes(t), t);
assert.ok(!h.includes('SUBAGENTE') && !h.includes('<b>x</b>') && h.indexOf('Pensamento') < h.indexOf('Vou ler') && h.indexOf('Vou ler') < h.indexOf('Leu /a/b.md'));
assert.ok(!/<(input|textarea|button)/.test(h)); // sem interação: só leitura
assert.ok(tr.html(path.join(home, 'x.jsonl')).includes('ainda não tem histórico'));

// aba Conversas: a tela de leitura tem voltar e atualizar e a transcrição
const conv = require('../modulos/conversas');
fs.mkdirSync(path.join(home, '.claude', 'projects', '-x'), { recursive: true });
fs.copyFileSync(bg, path.join(home, '.claude', 'projects', '-x', 's1.jsonl'));
const tela = conv._teste.telaLeitura('s1');
assert.ok(tela.includes('data-acao="fechar"') && tela.includes('data-acao="recarregar"') && tela.includes('Leu /a/b.md') && tela.includes('somente leitura'));
// o botão do Claude do ticket não pega a conversa de segundo plano (abriria vazia)
const claude = require('../infra/agentes/conversa'), tickets = require('../infra/ticket/tickets');
tickets.gravar({ chave: 'WMS-1', link: 'x', site: 's', titulo: 'T', status: '', conversas: [], refinamento: { estado: 'desligado' }, criado: 1 });
tickets.vincular('s1', 'WMS-1', 'incidentes');
const t = tickets.ler('WMS-1');
assert.strictEqual(claude.ultimaConversa(t, 'incidentes'), null);
console.log('ok');
