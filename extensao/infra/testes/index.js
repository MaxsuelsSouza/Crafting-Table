// @ts-check
// Plano de testes (casos de teste CT01…) em código reutilizável: o que veio do plugin fcx-qa-test-planning. Usado pelo QA e pela Implementação.
//   metodo-cts.js      método do plano (texto de prompt): METODO (QA) e METODO_ENTREGA (com criticidade e tipo por CT)
//   parser-cts.js      cenariosDo: Markdown do plano → cenários
//   nivel.js           nível de um cenário pela última execução
//   template-api.js    Template B (API) e escolherTemplate
//   estimativa.js      esforço de teste (modo detalhado e rápido) com memória de cálculo
//   nome-subtarefa.js  nome da subtarefa [QA] pelo tipo do pai e o casamento do plugin
module.exports = {
  ...require('./metodo-cts'),
  ...require('./parser-cts'),
  ...require('./nivel'),
  ...require('./template-api'),
  ...require('./estimativa'),
  ...require('./nome-subtarefa')
};
