// node teste-triagem.js — sdd-state comentario classificar, numa pasta temporária
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { spawnSync } = require('child_process');
const ref = fs.mkdtempSync(path.join(os.tmpdir(), 'triagem-'));
const ler = (n) => JSON.parse(fs.readFileSync(path.join(ref, n), 'utf8'));
const gravar = (n, d) => fs.writeFileSync(path.join(ref, n), JSON.stringify(d));
const cmd = (...a) => spawnSync('node', [path.join(__dirname, 'bin/sdd-state'), 'comentario', 'classificar', ...a, '--ref', ref], { encoding: 'utf8' });
const c = (id, status = 'triando') => ({ id, autor: 'PO Fulano', texto: 'texto', link: `https://j/${id}`, status });

gravar('.impactos.json', [c('1'), c('2'), c('3'), c('4'), c('5', 'na_fila')]);
gravar('.duvidas.json', [{ id: 'D01', texto: 'cor do botão?', resposta: null, sugestao: null }, { id: 'D02', texto: 'x', resposta: { texto: 'ok' }, sugestao: null }]);

// resposta: sugere na dúvida, some da caixa de mudanças
let r = cmd('1', '--tipo', 'resposta', '--motivo', 'define a cor', '--duvida', 'D01');
assert.strictEqual(r.status, 0, r.stderr);
assert.strictEqual(ler('.duvidas.json')[0].sugestao.motivo, 'define a cor');
let x = ler('.impactos.json')[0];
assert.deepStrictEqual([x.status, x.nivel, x.tipo, x.duvida], ['analisado', 'nenhum', 'resposta', 'D01']);

// mudança que também responde: segue para o impacto e ainda sugere (decisão 1 do planejamento)
r = cmd('2', '--tipo', 'mudanca', '--motivo', 'botão vermelho', '--duvida', 'D01');
assert.strictEqual(r.status, 0, r.stderr);
x = ler('.impactos.json')[1];
assert.deepStrictEqual([x.status, x.nivel], ['na_fila', undefined]);

// ruído
assert.strictEqual(cmd('3', '--tipo', 'ruido', '--motivo', 'agradecimento').status, 0);
assert.deepStrictEqual([ler('.impactos.json')[2].status, ler('.impactos.json')[2].nivel], ['analisado', 'nenhum']);

// recusas: resposta sem alvo, dúvida já respondida, tipo inválido, comentário fora de triagem, sem motivo
assert.notStrictEqual(cmd('4', '--tipo', 'resposta', '--motivo', 'm').status, 0);
assert.notStrictEqual(cmd('4', '--tipo', 'resposta', '--motivo', 'm', '--duvida', 'D02').status, 0);
assert.notStrictEqual(cmd('4', '--tipo', 'outro', '--motivo', 'm').status, 0);
assert.notStrictEqual(cmd('5', '--tipo', 'ruido', '--motivo', 'm').status, 0);
assert.notStrictEqual(cmd('4', '--tipo', 'ruido').status, 0);
assert.strictEqual(ler('.impactos.json')[3].status, 'triando', 'recusa não muda nada');
console.log('ok');
