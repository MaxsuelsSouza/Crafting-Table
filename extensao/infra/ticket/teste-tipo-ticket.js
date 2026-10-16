// node infra/teste-tipo-ticket.js — tipo do ticket (reconhecimento e escolha do usuário) e situação por módulo
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'tipo-home-'));
const Module = require('module'), load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? new Proxy({}, { get: () => new Proxy(function () {}, { get: () => () => {}, apply: () => {} }) }) : load(r, ...a));
const tt = require('./tipo-ticket'), tickets = require('./tickets'), { situacaoDe } = require('./situacao');
const c = tt.classificar;
assert.strictEqual(c('Bug'), 'bug'); assert.strictEqual(c('Defeito'), 'bug'); assert.strictEqual(c('Incidente'), 'incidente'); assert.strictEqual(c('Incident'), 'incidente');
assert.strictEqual(c('Bug Experimental'), 'bug-experimental'); assert.strictEqual(c('Story'), 'outro'); assert.strictEqual(c('Sub-tarefa'), 'outro'); assert.strictEqual(c('Épico'), 'outro');
assert.strictEqual(c('Chamado'), null); assert.strictEqual(c(''), null); assert.strictEqual(c(undefined), null); // não reconhecido: a extensão pergunta
assert.strictEqual(tt.categoriaDe({ tipo: 'Chamado' }), null);
assert.strictEqual(tt.categoriaDe({ tipo: 'Chamado', categoria: 'bug', categoriaOrigem: 'usuario' }), 'bug');
assert.strictEqual(tt.categoriaDe({ tipo: 'Bug', categoria: 'outro', categoriaOrigem: 'usuario' }), 'outro'); // a escolha do usuário vale mais
assert.ok(tt.exigeReproducao('bug-experimental') && !tt.exigeReproducao('outro') && !tt.exigeReproducao(null));
// situação por módulo
tickets.gravar({ idProvedor: 'T-1', chave: 'T-1', provedor: 'jira', site: 'x', link: 'x', titulo: '', status: '', conversas: [], criado: 1 });
const t = tickets.ler('T-1');
assert.strictEqual(situacaoDe(t, 'impl'), null);
assert.strictEqual(situacaoDe({ ...t, refinamento: { estado: 'rodando' } }, 'refinamento').texto, 'Refinando');
assert.strictEqual(situacaoDe({ ...t, refinamento: { estado: 'rodando' } }, 'impl'), null); // "refinando" não aparece nos outros módulos
fs.mkdirSync(tickets.pasta('T-1', 'impl'), { recursive: true });
fs.writeFileSync(path.join(tickets.pasta('T-1', 'impl'), '.esteira.json'), JSON.stringify({ etapa: 4, fase: 'aguardando' }));
assert.strictEqual(situacaoDe(t, 'impl').texto, 'Aguardando aprovação');
fs.writeFileSync(path.join(tickets.pasta('T-1', 'impl'), '.esteira.json'), JSON.stringify({ etapa: 3, fase: 'rodando', host: 999999 }));
assert.strictEqual(situacaoDe(t, 'impl').texto, 'Parado · etapa 3'); // rodando sem dono vivo
fs.mkdirSync(tickets.pasta('T-1', 'qa'), { recursive: true });
fs.writeFileSync(path.join(tickets.pasta('T-1', 'qa'), '.qa.json'), JSON.stringify({ fase: 'plano_aprovado' }));
assert.strictEqual(situacaoDe(t, 'qa').texto, 'Plano aprovado');
// card: tipo e situação no lugar do "refinando"
const card = require('../../componentes/card-ticket').card;
const h = card({ ...t, tipo: 'Bug', conversas: [], situacao: { texto: 'Plano aprovado', cor: 'ok', dica: '' } });
assert.ok(h.includes('>Bug<') && h.includes('Plano aprovado') && !h.includes('refinando'));
assert.ok(card({ ...t, tipo: 'Chamado', conversas: [] }).includes('Tipo?'));
console.log('ok');
