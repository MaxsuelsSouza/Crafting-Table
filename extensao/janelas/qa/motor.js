// @ts-check
// API do QA para o bin/qa-state, as ações (abas/acoes/), os pontos comuns e os testes: exatamente o que o antigo janelas/qa/qa.js exportava.
// Só encadeia e exporta; a lógica mora em estado.js, orquestrador/, etapas/ e abas/.
const { ESTADO, estado, mudar } = require('./estado');
const {
  executar,
  FERRAMENTAS_EXEC,
  PROIBIDAS,
  pausaPendente,
  registrarPausa,
  absorverPausa,
  responder,
  pausar,
  rodando,
  reconciliar,
  registrarDecisao
} = require('./orquestrador');
const { RESPOSTAS, PAUSA } = require('./orquestrador/prompt-comum');
const {
  ehLocal,
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
} = require('./etapas/01-planejamento');
const {
  cenariosDo,
  CENARIOS,
  cenarios,
  sincronizar,
  refazer,
  iniciarRefazerLote,
  responderRefazer,
  cancelarRefazerLote,
  loteRefazer,
  dispensar
} = require('./etapas/02-cenarios');
const { ambiente, donoAmbiente, LOG_AMB } = require('./etapas/03-ambiente/estado');
const { papeisDe } = require('./etapas/03-ambiente/regras/papeis');
const { FERRAMENTAS_ANALISE } = require('./etapas/03-ambiente/prompt');
const { analisarAmbiente, analiseVista, gravarAnalise } = require('./etapas/03-ambiente/analise');
const { statusAmbiente, resumoErroAmbiente } = require('./etapas/03-ambiente/status');
const { emPreCondicao, registrarPreCondicao } = require('./etapas/04-precondicao/estado');
const { healthCheck } = require('./etapas/04-precondicao/dependencias');
const { promptPreCondicao } = require('./etapas/04-precondicao/prompt');
const { MASSA, massa, massaAdd, massaEstado, emEtapaMassa } = require('./etapas/05-massa/estado');
const { ultimoRefresh, massaValida, semMassa, sincronizarMassa } = require('./etapas/05-massa/regras/validade');
const { bancoDaSessao } = require('./orquestrador/banco');
const { registrarReceita } = require('./etapas/05-massa/receita');
const { registrarCard } = require('./etapas/06-execucao/regras/camadas');
const { registrarAviso } = require('./etapas/06-execucao/cenario');
const {
  PROPOSTA,
  LOG_SQL,
  propostaMassa,
  proporMassa,
  aplicarProposta,
  recusarProposta,
  desfazerMassa
} = require('./etapas/05-massa/proposta');
const { desistirMassa } = require('./etapas/05-massa/desistir');
const { validarMassa } = require('./etapas/05-massa/validar');
const {
  RESULTADOS,
  fila,
  iniciarCenario,
  concluirCenario,
  naoExecutavel,
  NAO_EXECUTAVEL
} = require('./etapas/06-execucao/cenario');
const { evidencia, arquivosDe } = require('./etapas/06-execucao/evidencias');
const { exigenciasDe, faltaEvidencia } = require('./etapas/06-execucao/regras/evidencia');
const { promptCenario, promptDiagnostico } = require('./etapas/06-execucao/prompt');
const { registrarRoteiro, roteiroDe, pedirNovoRoteiro } = require('./etapas/06-execucao/roteiros');
const { podePublicar, veredito, relatorio } = require('./etapas/07-publicar');
const { html } = require('./abas/evidencias');
const { roteiroHtml } = require('./abas/roteiro');

module.exports = {
  registrarAviso,
  registrarReceita,
  registrarCard,
  desistirMassa,
  validarMassa,
  proporMassa,
  aplicarProposta,
  recusarProposta,
  desfazerMassa,
  propostaMassa,
  PROPOSTA,
  LOG_SQL,
  proporPlano,
  aprovarPublicando,
  conferirPlano,
  reconciliar,
  registrarPausa,
  absorverPausa,
  pausaPendente,
  responder,
  bancoDaSessao,
  FERRAMENTAS_EXEC,
  FERRAMENTAS_ANALISE,
  PROIBIDAS,
  RESPOSTAS,
  PAUSA,
  faltaEvidencia,
  exigenciasDe,
  statusAmbiente,
  analiseVista,
  resumoErroAmbiente,
  verificarPlano,
  aprovar,
  versaoAtual,
  promptCriar,
  promptInterpretar,
  promptMudanca,
  publicarPlano,
  escolherSubtarefa,
  planoLocal,
  mdDaVersao,
  contextoTicket,
  PLANO_LOCAL,
  CONTEXTO,
  analisarAmbiente,
  gravarAnalise,
  LOG_AMB,
  FERRAMENTAS_PLANO,
  html,
  roteiroHtml,
  estado,
  mudar,
  cenarios,
  refazer,
  iniciarRefazerLote,
  responderRefazer,
  cancelarRefazerLote,
  loteRefazer,
  executar,
  pausar,
  rodando,
  registrarDecisao,
  ehLocal,
  podePublicar,
  veredito,
  relatorio,
  dispensar,
  concluirCenario,
  naoExecutavel,
  NAO_EXECUTAVEL,
  registrarRoteiro,
  roteiroDe,
  pedirNovoRoteiro,
  emEtapaMassa,
  emPreCondicao,
  registrarPreCondicao,
  promptPreCondicao,
  evidencia,
  arquivosDe,
  massa,
  massaAdd,
  massaEstado,
  sincronizarMassa,
  massaValida,
  ambiente,
  donoAmbiente,
  INDICE,
  ESTADO,
  CENARIOS,
  MASSA,
  RESULTADOS,
  _teste: {
    healthCheck,
    papeisDe,
    ehQA,
    candidatas,
    temPlano,
    versionar,
    procurar,
    cenariosDo,
    sincronizar,
    iniciarCenario,
    fila,
    ultimoRefresh,
    semMassa,
    promptCenario,
    promptDiagnostico
  }
};
