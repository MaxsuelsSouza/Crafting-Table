// @ts-check
// Orquestrador do QA (lista QA do painel). O ▶ roda tudo em ordem (executar): planejamento → mapa de cenários → ambiente → massa → um
// roteiro por cenário (Claude) que a extensão executa (etapas/06-execucao). Estado em arquivos da pasta qa/ do ticket, então pausar/retomar é só parar entre execuções.
// A lógica de cada etapa mora em etapas/NN-*; aqui fica só o que é comum a todas. Um arquivo por regra:
//   executar.js     ▶ Dar início: ambiente → pré-condição → massa → cenários (cada etapa devolve true quando parou)
//   claude.js       um claude -p em segundo plano até terminar (limite de tempo, erro da API)
//   ferramentas.js  ferramentas liberadas e proibidas
//   prompt-comum.js skill, qa-state, regras e citações dos prompts
//   pausa.js        pergunta do Claude (.pausa.json) vira pausa no estado
//   responder.js    resposta do humano (.respostas.md)
//   zero-skip.js    bloqueio e erro da API pausam no cenário, sem pular
//   rodando.js · pausar.js · reconciliar.js  execução viva, ⏸ e rodada interrompida
//   decisoes.js     decisões do usuário na aba Decisões
//   principal.js    entrada: repositórios de volta para a principal (sujo: pausa)
const { executar } = require('./executar');
const { claude } = require('./claude');
const { FERRAMENTAS_EXEC, PROIBIDAS } = require('./ferramentas');
const { pausaPendente, registrarPausa, absorverPausa } = require('./pausa');
const { responder } = require('./responder');
const { bloquearFluxo, pausarPorApi } = require('./zero-skip');
const { pausado, rodando } = require('./rodando');
const { pausar } = require('./pausar');
const { reconciliar } = require('./reconciliar');
const { registrarDecisao } = require('./decisoes');

module.exports = {
  executar,
  claude,
  FERRAMENTAS_EXEC,
  PROIBIDAS,
  pausaPendente,
  registrarPausa,
  absorverPausa,
  responder,
  bloquearFluxo,
  pausarPorApi,
  pausado,
  rodando,
  pausar,
  reconciliar,
  registrarDecisao
};
