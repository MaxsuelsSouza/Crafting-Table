// @ts-check
// Ações do card de tarefa (handlers da webview). Contrato: acoes(servicos), ver teste-acoes.js.
//   campos.js    estimativa e responsável
//   aprovar.js   aprovar (subtarefa/item) e o card [QA]
//   revisao.js   aplicar ou descartar a revisão de card já no Jira
//   reprovar.js  reprovar e pedir alteração
const campos = require('./campos');
const aprovar = require('./aprovar');
const revisao = require('./revisao');
const reprovar = require('./reprovar');

const acoes = (s) => ({ ...campos.acoes(s), ...aprovar.acoes(s), ...revisao.acoes(s), ...reprovar.acoes(s) });

module.exports = { acoes };
