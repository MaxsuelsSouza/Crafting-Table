// @ts-check
// node componentes/teste-caixa-etapas.js
const assert = require('assert');
const { caixa, CSS } = require('./caixa-etapas');

// Sem subetapas: uma linha por etapa, estado em rótulo, ✓ na concluída, nenhuma lista de subetapas.
const simples = caixa({ titulo: 'Mergulho', acao: '<button>x</button>', atual: 2, etapas: [
  { n: 1, nome: 'Triagem', estado: 'concluida' }, { n: 2, nome: 'Artefatos', estado: 'aguardando' }, { n: 3, nome: 'Dados', estado: 'pendente' }, { n: 4, nome: 'Dx', estado: 'erro' }] });
assert.ok(simples.includes('Mergulho') && simples.includes('<button>x</button>'));
assert.ok(simples.includes('<b>✓</b>Triagem') && simples.includes('aguardando sua aprovação') && simples.includes('com erro'));
assert.ok(simples.includes('ce-et aguardando atual') && !simples.includes('ce-subs'));

// Com subetapas: expande sozinha só na etapa atual, numeradas N.1, N.2…, com o estado de cada uma.
const subs = [{ nome: 'Mapeamento', estado: 'concluida' }, { nome: 'Plano', estado: 'rodando' }];
const com = (atual) => caixa({ atual, etapas: [{ n: 3, nome: 'Antes', estado: 'concluida' }, { n: 4, nome: 'Plano técnico', estado: 'rodando', subetapas: subs }] });
const aberta = com(4);
assert.ok(aberta.includes('ce-subs') && aberta.indexOf('4.1') < aberta.indexOf('Mapeamento') && aberta.indexOf('Mapeamento') < aberta.indexOf('4.2') && aberta.indexOf('4.2') < aberta.indexOf('Plano<span'));
assert.ok(aberta.includes('ce-et feita sub') && aberta.includes('ce-et rodando sub'));
assert.ok(!com(3).includes('ce-subs')); // recolhida enquanto não é a atual
assert.ok(caixa({ atual: 3, etapas: [{ n: 4, nome: 'x', aberta: true, subetapas: subs }] }).includes('ce-subs'));
assert.ok(caixa({ atual: 4, etapas: [{ n: 4, nome: 'x', subetapas: [{ n: 'A', nome: 'y' }] }] }).includes('<b>A</b>'));
assert.ok(!caixa({ atual: 4, etapas: [{ n: 4, nome: 'x', subetapas: [] }] }).includes('ce-subs'));
// texto escapado
assert.ok(caixa({ etapas: [{ n: 1, nome: '<i>' }] }).includes('&#60;i&#62;') && CSS.includes('.ce-subs'));
console.log('ok');
