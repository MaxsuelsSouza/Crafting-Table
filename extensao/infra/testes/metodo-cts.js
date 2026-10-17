// @ts-check
// Método do plano de casos de teste (CT01…), o do plugin jira-qa-planner sem a parte que publica: texto de prompt.
// Usado pelo QA (janelas/qa/etapas/01-planejamento/prompt.js) e, na variante METODO_ENTREGA, pela Implementação (teste na aplicação).
// O formato é o que parser-cts.js (cenariosDo) entende.

// Método do planejamento (o do jira-qa-planner, sem a parte que publica): casos de teste no formato que cenariosDo() entende.
const METODO =
  'MÉTODO: ANTES de criar do zero, procure nas fontes (subtarefas de QA, descrição, comentários, anexos) um planejamento já existente, em qualquer formato: se houver, transcreva-o fielmente em vez de inventar outro. Leia a descrição, os critérios de aceite e os comentários e monte os casos de teste que os cobrem. ' +
  'Estrutura do arquivo: "## Cenários de Teste" com um título "#### CT01 – <o que valida>" por caso (numeração contínua CT01, CT02…); ' +
  'em cada caso, o passo a passo em Gherkin, uma linha por item em negrito no início: **Dado que** …, **Quando** …, **Então** … (**E** … para continuar); ' +
  'depois "Validações:" com os pontos a conferir. Cubra o caminho feliz, as regras de negócio e os critérios de aceite, os limites e erros, e as regressões prováveis. ' +
  'Casos que dependem de exploração livre vão ao final como "#### Exploratório 1 – …". Termine com "## Critérios de aceite cobertos" (tabela CA × CT) e "## Riscos e pré-requisitos" ' +
  '(massa de dados, perfis/permissões, ambiente). Um cenário por comportamento verificável; sem inventar regra que não esteja nas fontes (o que faltar vai em Riscos). ' +
  'Na tabela de critérios use as colunas Critério | Cenários | Fonte (arquivo ou campo do ticket) | Confiança (aprovado, gerado, bruto, verbal ou inferido): critério que você deduziu é "inferido". ' +
  'Se a implementação (impl/implementacao.md, impl/plano-mudanca.md) grava em uma tabela (log, auditoria, histórico), crie um cenário que consulte essa tabela e cite o nome dela no título ou no corpo.';

// Variante da Implementação (o score da etapa de teste lê criticidade e tipo de cada CT): o método do QA + dois campos por caso.
const METODO_ENTREGA =
  `${METODO} ` +
  'EM CADA CASO, logo abaixo do título e antes do Gherkin, escreva duas linhas: "Criticidade: critica|alta|normal" (critica = quebra o objetivo do ticket ou perde dado; alta = regra de negócio ou critério de aceite principal; normal = o resto) e ' +
  '"Tipo: aceite|regressao|borda" (aceite = cobre um critério de aceite; regressao = algo que já funcionava na área tocada e não pode quebrar; borda = limite, erro ou entrada inválida). ' +
  'A tabela "## Critérios de aceite cobertos" (CA × CT) é OBRIGATÓRIA: todo critério de aceite aparece com pelo menos um CT, ou com "sem CT" e o motivo. Inclua ao menos um CT de regressão da área tocada pelo diff.';

module.exports = { METODO, METODO_ENTREGA };
