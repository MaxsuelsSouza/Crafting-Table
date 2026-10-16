// @ts-check
// Seção Tarefas: a tabela dos cards (id, título, camada, estimativa, dependências, estado e subtarefa).
const { secao } = require('./comum');

/** L = linhas do refinamento.md (montar.js). */
const tarefas = (L, cards) => {
  L.push(
    secao(
      'Tarefas',
      cards.length
        ? [
            '| Id | Título | Camada | Estimativa | Depende de | Estado | Subtarefa |',
            '|---|---|---|---|---|---|---|',
            ...cards.map(
              (c) =>
                `| ${c.id} | ${String(c.titulo || '').replace(/\|/g, '/')} | ${c.camada || ''} | ${c.estimativa || ''} | ${[].concat(c.depende || []).join(', ')} | ${c.status || ''} | ${c.ticket || ''} |`
            )
          ].join('\n')
        : ''
    )
  );
};

module.exports = { tarefas };
