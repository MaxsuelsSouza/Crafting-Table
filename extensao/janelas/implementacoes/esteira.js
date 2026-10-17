// @ts-check
// API antiga da esteira de Implementação (era o arquivo único): só reexporta, para os testes e o _teste. A lógica mora em orquestrador/,
// etapas/, abas/ e estado.js; os pontos comuns usam o registro (implementacoes.js). Ver FAZER-QUANDO-DER.md.
const { deps, filhos } = require('./dependencias');
const {
  ESTADO,
  PAUSA,
  RESPOSTAS,
  TENTAR,
  SEGUIR,
  CORRIGIR,
  RESUMIR,
  REPETIR,
  VERIFICAR,
  SEM_CONFIRMAR,
  estado,
  mudar,
  situacao
} = require('./estado');
const { ETAPAS } = require('./etapas');
const {
  parsePausa,
  lerPausa,
  seguir,
  aposEtapa,
  responder,
  rodarEtapa,
  avancar,
  proxima,
  FERRAMENTAS
} = require('./orquestrador');
const { prepararDossie } = require('./etapas/01-dossie/subetapas/1.1-dossie');
const { rodarReproducao, aposReproducao } = require('./etapas/01-dossie/subetapas/1.2-reproducao');
const { FERRAMENTAS_REPRO } = require('./etapas/01-dossie/regras/ferramentas');
const { prepararBranches, afetados, ramo } = require('./etapas/05-implementacao');
const { verificar, verificacaoComandos, MAX_CORRECOES } = require('./etapas/06-verificacao');
const { corpo, botaoPlay } = require('./abas/esteira');
const { corpoDossie } = require('./abas/dossie');
const { acoes, dentro } = require('./abas/acoes');

module.exports = {
  corpo,
  corpoDossie,
  acoes,
  botaoPlay,
  ETAPAS,
  _teste: {
    parsePausa,
    lerPausa,
    deps,
    estado,
    mudar,
    situacao,
    seguir,
    aposEtapa,
    responder,
    prepararBranches,
    prepararDossie,
    verificar,
    afetados,
    ramo,
    verificacaoComandos,
    FERRAMENTAS,
    FERRAMENTAS_REPRO,
    SEM_CONFIRMAR,
    rodarReproducao,
    aposReproducao,
    rodarEtapa,
    avancar,
    proxima,
    ESTADO,
    PAUSA,
    RESPOSTAS,
    TENTAR,
    SEGUIR,
    CORRIGIR,
    RESUMIR,
    REPETIR,
    VERIFICAR,
    MAX_CORRECOES,
    filhos,
    dentro
  }
};
