// @ts-check
// Etapa 5 · Implementação (claude -p com Edit/Write nos repositórios, na branch de trabalho, sem commit nem push). A primeira etapa que
// escreve código: só roda depois do portão da etapa 4. Ao terminar, a verificação (06) roda; se falhar, a 5 volta em modo correção.
//
// Estrutura desta pasta:
//   index.js                 exporta
//   prompt.js                tarefa do prompt (e a correção, com as falhas da verificação)
//   regras/branch.js         branch de trabalho (slug, ramo, afetados, prepararBranches)
//   regras/houve-mudanca.js  a implementação alterou algum repositório?
const { tarefa } = require('./prompt');
const { slug, ramo, afetados, prepararBranches } = require('./regras/branch');
const { houveMudanca } = require('./regras/houve-mudanca');

module.exports = { n: 5, tarefa, slug, ramo, afetados, prepararBranches, houveMudanca };
