// @ts-check
// node componentes/teste-ao-vivo.js — o botão "Conduzir em conversa" do Ao vivo: desligado por padrão, ligado só com a flag `conversa`.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const aoVivo = require('./ao-vivo');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aovivo-'));

// sem log: nada, e com a flag só o cabeçalho com o botão
assert.strictEqual(aoVivo.caixa(dir, false, 'x', undefined), '');
assert.strictEqual(aoVivo.caixa(dir, false, 'x', { conversa: false }), '');
assert.strictEqual(aoVivo.caixa(dir, false, 'x', { pausar: 'p' }), '');
const vazio = aoVivo.caixa(dir, false, 'x', { conversa: true });
assert.ok(vazio.includes('data-acao="claude"') && vazio.includes('Conduzir em conversa') && vazio.includes('Nada ao vivo ainda.'));

// com log: sem flag não há botão (o Ao vivo dos outros módulos não muda); com flag, o botão e o ⏸/▶ convivem
fs.writeFileSync(path.join(dir, aoVivo.ARQUIVOS[0]), JSON.stringify({ em: new Date().toISOString(), tipo: 'etapa', texto: 'Etapa 1' }) + '\n');
const sem = aoVivo.caixa(dir, true, 'x', { pausar: 'esteiraPausar' }), padrao = aoVivo.caixa(dir, true, 'x');
assert.ok(!sem.includes('Conduzir em conversa') && !padrao.includes('Conduzir em conversa') && sem.includes('esteiraPausar'));
const com = aoVivo.caixa(dir, true, 'x', { conversa: true, pausar: 'esteiraPausar' });
assert.ok(com.includes('data-acao="claude"') && com.includes('esteiraPausar') && com.includes('Etapa 1'));
assert.ok(!aoVivo.caixa(dir, true, 'x', { conversa: 'sim' }).includes('Conduzir em conversa')); // só `true` liga
console.log('ok');
