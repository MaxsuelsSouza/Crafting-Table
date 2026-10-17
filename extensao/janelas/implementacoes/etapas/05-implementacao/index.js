// @ts-check
// Etapa 5 · Implementação (claude -p com Edit/Write nos repositórios, na branch de trabalho, sem commit nem push). A primeira etapa que
// escreve código: só roda depois do portão da etapa 4. Ao terminar, a verificação (06) roda; se falhar, a 5 volta em modo correção.
//
// Estrutura desta pasta:
//   index.js                 exporta
//   prompt.js                tarefa do prompt (e a correção, com as falhas da verificação)
//   regras/branch.js         branch de trabalho <tipo>/<CHAVE> (afetados, prepararBranches)
//   regras/nome-branch.js    o nome: feature/, bugfix/ ou hotfix/ pelo tipo do ticket (ramo)
//   regras/base-branch.js    de onde a branch parte (a que já existe, a do trabalho já feito ou a principal)
//   regras/houve-mudanca.js  a implementação alterou algum repositório?
const { tarefa } = require('./prompt');
const { ramo, afetados, prepararBranches } = require('./regras/branch');
const { houveMudanca } = require('./regras/houve-mudanca');

module.exports = { n: 5, tarefa, ramo, afetados, prepararBranches, houveMudanca };
