// @ts-check
// ── Tarefas: cards do passo 4 (como no Jira). Pendentes → você aprova (vira subtarefa no Jira), reprova ou pede
// alteração (o Claude ajusta em segundo plano). O detalhe abre por cima do quadro (script "Tarefas" em pagina()).
//   rotulos.js  rótulos e constantes (onde mora a subtarefa, responsável, colunas)
//   tela.js     quadro, detalhe e grade das abertas
//   script.js   script da webview do modal
//   jira.js     texto da subtarefa no Jira e a subtarefa de QA que já existe
//   css.js      CSS da aba
//   acoes/      cliques do card (campos, aprovar, revisão, reprovar)
const { telaTarefas } = require('./tela');
const { script } = require('./script');
const { CSS } = require('./css');
const { acoes } = require('./acoes');

module.exports = { telaTarefas, script, CSS, acoes };
