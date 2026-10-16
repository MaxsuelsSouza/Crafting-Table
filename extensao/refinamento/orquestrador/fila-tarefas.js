// @ts-check
const { pasta } = require('../../infra/pasta-ticket');
const maestro = require('../../painel/maestro');
const { TAREFAS, tarefasDe } = require('../locais');
const { pausado } = require('../estado');
const { s, alterando } = require('./servicos');
const { etapa } = require('./etapa');

// Pedidos de alteração esperando: uma execução só para todos.
const filaTarefas = (t) => {
  if (maestro.rodando(pasta(t.chave)) || pausado(t.chave)) return;
  const l = tarefasDe(pasta(t.chave)),
    fila = l.filter((c) => c.status === 'em_alteracao' && c.fila);
  if (!fila.length) return;
  fila.forEach((c) => {
    c.fila = false;
    alterando.add(c.id);
  });
  s.gravar(t.chave, TAREFAS, l);
  etapa(
    t,
    `Pedidos de alteração nos cards da aba Tarefas: ${fila.map((c) => `${c.id}: "${c.alteracao}"`).join('; ')}. ` +
      'Para cada tNN: ajuste a linha em tasks.md e o card com sdd-state card editar <id> (só os campos que mudam). ' +
      'Para o card qa: ajuste testes.md (plano de testes) e rode sdd-state card editar qa (com --estimativa/--resumo se mudarem). ' +
      'Não mexa em outras tarefas, não conclua nem inicie passos.',
    false,
    undefined,
    `Alterando ${fila.map((c) => c.id).join(', ')}`
  );
};

module.exports = { filaTarefas };
