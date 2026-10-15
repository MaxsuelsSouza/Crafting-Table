// @ts-check
// node refinamento/teste-pacote.js — refinamento.md: reúne os passos e o que só existia na pasta do ticket desta máquina
// (perguntas, dúvidas, decisões, mudanças, cards). Disco real em HOME temporário, sem IA e sem rede.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'pac-home-'));
const tickets = require('../infra/tickets');
const pacote = require('./pacote');

const chave = 'PAC-1', dir = tickets.pasta(chave), repo = path.join(dir, 'repo'), sd = path.join(repo, 'spec-x');
fs.mkdirSync(sd, { recursive: true });
const passos = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ n, titulo: `Passo${n}`, status: n <= 2 ? 'aprovado' : n === 3 ? 'aguardando_revisao' : 'pendente', aprovadoPor: n <= 2 ? 'maxsuel' : null, aprovadoEm: n <= 2 ? '2026-10-14T10:00:00Z' : null }));
const estado = ['sdd', 'state.json'].join('-'), tarefas = ['', 'tarefas.json'].join('.');
fs.writeFileSync(path.join(sd, estado), JSON.stringify({ proximoPasso: 3, passos, achados: [], perguntas: [
  { id: 'Q01', status: 'respondida', pergunta: 'Saldo negativo bloqueia?', resposta: 'Sim, bloqueia', respondidaEm: '2026-10-14T09:00:00Z', passo: 2 },
  { id: 'Q02', status: 'aberta', pergunta: 'Vale para filial?', passo: 3 }] }));
fs.writeFileSync(path.join(sd, 'spec.md'), '# Spec\n\n## Requisitos\n\nRF01 bloquear pedido com saldo negativo.\n');
fs.writeFileSync(path.join(sd, 'plan.md'), '# Plano\n\n## Mapeamento do código\n\nPedidoService.\n');
fs.writeFileSync(path.join(sd, 'mapa-backend.md'), '# mapa');
tickets.gravar({ chave, titulo: 'Saldo no pedido', link: 'https://j/PAC-1', spec: { repo, dir: 'spec-x' }, conversas: [], refinamento: { estado: 'rodando', iniciadoPor: 'maxsuel' } });
fs.writeFileSync(path.join(dir, '.duvidas.json'), JSON.stringify([
  { id: 'D01', texto: 'Cliente pré-pago entra?', contexto: 'passo 2', resposta: { texto: 'Não entra', autor: 'PO Ana', origem: 'comentario', link: 'https://j/c1' } },
  { id: 'D02', texto: 'Limite por filial?', resposta: null }]));
fs.writeFileSync(path.join(dir, '.decisoes.json'), JSON.stringify([
  { id: 'a', data: '2026-10-14T09:30:00Z', origem: 'claude', titulo: 'Saldo vem do ERP', resumo: 'Usar o saldo do ERP, não do cache' },
  { id: 'b', data: '2026-10-14T09:31:00Z', origem: 'claude', titulo: 'Lendo spec.md', resumo: '/x/spec.md' },
  { id: 'c', data: '2026-10-14T09:32:00Z', origem: 'claude', titulo: 'Conferindo onde a spec parou', resumo: 'x' },
  { id: 'd', data: '2026-10-14T09:33:00Z', origem: 'usuario', titulo: 'Sem filial nesta entrega', resumo: 'Filial fica para depois' }]));
fs.writeFileSync(path.join(dir, '.impactos.json'), JSON.stringify([
  { id: 'c9', autor: 'PO Ana', data: '2026-10-14T11:00:00Z', texto: 'agora vale para filial', status: 'aguardando_decisao', nivel: 'alto', resumo: 'Escopo passa a incluir filial', link: 'https://j/c9' }]));
fs.writeFileSync(path.join(dir, tarefas), JSON.stringify([
  { id: 't01', titulo: 'Validar saldo', camada: 'backend', estimativa: '2h', status: 'aprovada', ticket: 'PAC-2' },
  { id: 't02', titulo: 'Mensagem na tela', camada: 'mobile', status: 'pendente' }]));

const arq = pacote.gravar(chave);
assert.strictEqual(arq, path.join(sd, 'refinamento.md'));
const md = fs.readFileSync(arq, 'utf8');
for (const trecho of [
  '# Refinamento PAC-1 · Saldo no pedido', 'https://j/PAC-1', 'refinamento de maxsuel',
  'Q01', 'Sim, bloqueia', 'D01', 'Não entra', 'PO Ana', 'Saldo vem do ERP', 'Sem filial nesta entrega',
  'Escopo passa a incluir filial', 'RF01 bloquear pedido', 'PedidoService', 'mapa-backend.md', 'Validar saldo', 'PAC-2'
]) assert.ok(md.includes(trecho), `falta: ${trecho}`);
// pendências visíveis para quem pega
assert.match(md, /Pendências abertas/);
assert.match(md, /Q02/); assert.match(md, /D02/); assert.match(md, /esperando decisão/); assert.match(md, /t02/);
assert.match(md, /Passo 3 \(Passo3\): Aguardando revisão/);
// ruído do modo de teste do maestro fica de fora
assert.ok(!md.includes('Lendo spec.md') && !md.includes('Conferindo onde a spec parou'));
// títulos do arquivo embutido descem um nível
assert.match(md, /^### Requisitos$/m);
// plano ainda não aprovado é avisado
assert.match(md, /plan\.md, ainda não aprovado/);
// só a data mudou: não regrava (não suja o git)
const m1 = fs.statSync(arq).mtimeMs;
setTimeout(() => {
  pacote.gravar(chave);
  assert.strictEqual(fs.statSync(arq).mtimeMs, m1);
  // sem spec: não grava e não lança
  tickets.gravar({ chave: 'PAC-2', conversas: [], refinamento: { estado: 'desligado' } });
  assert.strictEqual(pacote.gravar('PAC-2'), null);
  assert.strictEqual(pacote.gravar('NAO-EXISTE'), null);
  console.log('pacote ok');
}, 20);
