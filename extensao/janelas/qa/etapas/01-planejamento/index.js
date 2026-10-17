// @ts-check
// Etapa 1 · Planejamento: acha o plano no provedor (ou o Claude escreve um), versiona na aba Docs e espera a aprovação do humano.
// Fase 1: planejamento.
// A extensão acha o planejamento sozinha (1 chamada ao provedor, sem Claude): subtarefa de QA do ticket com cenários na descrição
// (convenção herdada do plugin fcx-qa-test-planning: "[QA] Planejamento dos Casos de Testes" / "[QA] Teste de Qualidade", CT01…).
// Cada versão diferente da descrição vira planejamento-qa-vN.md na pasta qa/ do ticket (aba Docs); o índice fica em .planejamento.json.
// Sem planejamento, o QA fica bloqueado até o Claude criar um (a IA escreve qa-plano.md em segundo plano e a extensão publica no provedor; o clique vale como OK).
//
//   dependencias.js           provedor (Jira ou documento) e o contexto do ticket
//   versoes.js                planejamento-qa-vN.md e .planejamento.json
//   prompt.js                 método e prompts do plano (criar, interpretar, mudar)
//   regras/subtarefa.js       qual subtarefa é a de QA e se ela tem plano
//   regras/conferir.js        contrato do plano (avisos)
//   regras/escolher-subtarefa.js  várias subtarefas [QA]: pausa e pergunta onde publicar
//   subetapas/1.1-procurar.js procurar no provedor e verificar (▶)
//   subetapas/1.2-plano-local.js  qa-plano.md escrito pela IA (fica local até aprovar)
//   subetapas/1.3-aprovar.js  aprovar, publicar no provedor
const { nomeProvedor, ehLocal, onde, contextoTicket } = require('./dependencias');
const { INDICE, versionar, versaoAtual, mdDaVersao } = require('./versoes');
const { promptCriar, promptInterpretar, promptMudanca, FERRAMENTAS_PLANO } = require('./prompt');
const { ehQA, candidatas, temPlano } = require('./regras/subtarefa');
const { conferirPlano } = require('./regras/conferir');
const { escolherSubtarefa } = require('./regras/escolher-subtarefa');
const { procurar, verificarPlano } = require('./subetapas/1.1-procurar');
const { PLANO_LOCAL, CONTEXTO, planoLocal, proporPlano } = require('./subetapas/1.2-plano-local');
const { aprovar, aprovarPublicando, publicarPlano } = require('./subetapas/1.3-aprovar');

module.exports = {
  n: 1,
  nomeProvedor,
  ehLocal,
  onde,
  contextoTicket,
  INDICE,
  versionar,
  versaoAtual,
  mdDaVersao,
  promptCriar,
  promptInterpretar,
  promptMudanca,
  FERRAMENTAS_PLANO,
  ehQA,
  candidatas,
  temPlano,
  conferirPlano,
  escolherSubtarefa,
  procurar,
  verificarPlano,
  PLANO_LOCAL,
  CONTEXTO,
  planoLocal,
  proporPlano,
  aprovar,
  aprovarPublicando,
  publicarPlano
};
