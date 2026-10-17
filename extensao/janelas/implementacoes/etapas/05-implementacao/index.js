// @ts-check
// Etapa 5 · Implementação (claude -p com Edit/Write nos repositórios, na branch de trabalho, sem commit nem push). A primeira etapa que
// escreve código: só roda depois do portão da etapa 4. Ao terminar, a verificação (06) roda; se falhar, a 5 volta em modo correção.
//
// Estrutura desta pasta:
//   index.js                 exporta
//   prompt.js                tarefa do prompt (e a correção, com as falhas da verificação)
//   regras/branch.js         branch do ticket <prefixo>/<CHAVE>: usa a que existe, senão pausa 'criar' (afetados, prepararBranches)
//   regras/nome-branch.js    o nome: prefixo no padrão do repositório para o tipo do ticket (sugerido, rotulo)
//   regras/base-branch.js    as bases para criar (trabalho já feito, pai, avô, principal)
//   regras/houve-mudanca.js  a implementação alterou algum repositório?
//   regras/falhas.js         achados do teste na aplicação (teste.json) para a correção pelo teste (correcao: 'teste')
const { tarefa } = require('./prompt');
const { afetados, prepararBranches } = require('./regras/branch');
const { houveMudanca } = require('./regras/houve-mudanca');

module.exports = { n: 5, tarefa, afetados, prepararBranches, houveMudanca };
