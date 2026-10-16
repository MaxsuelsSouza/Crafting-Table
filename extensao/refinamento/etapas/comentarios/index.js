// @ts-check
// Etapa paralela "Comentários novos" do Refinamento: comentário de outra pessoa no ticket → triagem (resposta, mudança ou ruído) →
// impacto (só análise) → decisão do humano → aplicar. Corre ao lado dos passos, uma execução por vez.
// Mudança de escopo vinda de comentário do Jira: o impacto fica em .impactos.json com status "aguardando_decisao" até o
// humano escolher. Aqui moram as peças sem vscode: quais passos ficam em atenção e o snapshot que permite "Não prosseguir"
// depois de uma aplicação (desfazer), mais as caixas da aba Spec, as ações e o CSS. Roda em teste-mudancas.js (vscode simulado).
//   regras.js    quem depende de quem, nível, pendentes e o que cada mudança atinge
//   snapshot.js  guardar, voltar e conferir a spec e os cards
//   vigia.js     comentários novos a cada 5 min (liga em orquestrador/iniciar.js)
//   triagem.js   [triagem] resposta, mudança ou ruído
//   impacto.js   [impacto] só análise, com snapshot
//   avisar.js    o que ficou sem registro vira erro, desfaz análise que mexeu na spec, avisa
//   decidir.js   decisão do humano ([aplicar]), desfazer e ciente
// As caixas da aba Spec e o CSS moram em abas/spec/mudancas.js (reexportados aqui, como no antigo mudancas.js).
const { NIVEL, pendentes, passosAfetados, cardsAfetados } = require('./regras');
const { snapshot, restaurar, alterou } = require('./snapshot');
const { acoes } = require('./decidir');
const { caixaDecisao, caixaMudancas, CSS } = require('../../abas/spec/mudancas');
const { filaTriagem } = require('./triagem');
const { filaImpactos } = require('./impacto');
const { vigiarComentarios } = require('./vigia');
const { avisarImpactos } = require('./avisar');

module.exports = {
  NIVEL,
  CSS,
  acoes,
  alterou,
  pendentes,
  passosAfetados,
  cardsAfetados,
  snapshot,
  restaurar,
  caixaDecisao,
  caixaMudancas,
  filaTriagem,
  filaImpactos,
  vigiarComentarios,
  avisarImpactos
};
