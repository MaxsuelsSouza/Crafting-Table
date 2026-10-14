// node teste-conversas-ao-vivo.js: a sessão do Claude que termina é anexada à aba Conversas do ticket/módulo (padrão do Ao vivo)
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'));
process.env.HOME = home; // tickets.js e o ao-vivo leem ~/.claude na carga
const tickets = require('../infra/tickets'), { anexarConversa } = require('../componentes/ao-vivo');

tickets.gravar({ chave: 'WMS-9', link: 'x', site: 's', titulo: 'T', status: '', conversas: [], refinamento: { estado: 'desligado' }, criado: 1 });
const sessao = (sid) => { const d = path.join(home, '.claude', 'projects', '-qualquer-cwd'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${sid}.jsonl`), '{"type":"user"}'); return path.join(d, `${sid}.jsonl`); };

// módulo Incidentes (subpasta da aba): vira conversa da aba incidentes, com título da etapa
const arq1 = sessao('s1'), dirInc = tickets.pasta('WMS-9', 'incidentes');
assert.strictEqual(anexarConversa(dirInc, 's1', 'Mergulho · Etapa 1: Triagem'), true);
assert.deepStrictEqual([tickets.ler('WMS-9').conversas, tickets.listaDa('s1'), tickets.ticketDa('s1')], [['s1'], 'incidentes', 'WMS-9']);
assert.ok(fs.readFileSync(arq1, 'utf8').includes('"customTitle":"WMS-9 · Mergulho · Etapa 1: Triagem"'));
// idempotente: de novo não duplica o vínculo
anexarConversa(dirInc, 's1');
assert.deepStrictEqual(tickets.ler('WMS-9').conversas, ['s1']);
// raiz do ticket = Refinamento; QA = qa
sessao('s2'); sessao('s3');
anexarConversa(tickets.pasta('WMS-9'), 's2', 'Spec'); anexarConversa(tickets.pasta('WMS-9', 'qa'), 's3');
assert.deepStrictEqual([tickets.listaDa('s2'), tickets.listaDa('s3')], ['refinamento', 'qa']);
// fora de pasta de ticket (ou ticket inexistente): nada acontece
assert.strictEqual(anexarConversa(path.join(home, 'qualquer'), 's9'), true); // avulsa: vai para a lista de conversas sem ticket
assert.ok(fs.readFileSync(path.join(home, '.cache', 'crafting-table', 'avulsas.txt'), 'utf8').includes('s9'));

assert.strictEqual(anexarConversa(dirInc, ''), false);
console.log('ok');
