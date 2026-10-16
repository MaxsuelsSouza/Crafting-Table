// @ts-check
// Reprodução do bug (etapa da esteira antes do Entendimento, só para ticket do tipo Bug/Defeito/Incidente): o Claude sobe a aplicação, executa o
// passo a passo relatado e confirma se o erro acontece. Cada cenário tem o formato do QA ({ id, titulo, texto, status, execucoes }) e usa o mesmo
// card (componentes/card-cenario.js) e o mesmo registro do fluxo dos Incidentes (componentes/fluxo-passos.js, fluxo.json na pasta da aba). "falhou" = o erro aconteceu.
// Evidências: as que já estão no ticket, no pai ou nos irmãos (anexos do Jira) são baixadas para <aba>/evidencias-ticket/ e indexadas em
// .evidencias-ticket.json; o Claude as anexa ao cenário que falhou (reproducao-fluxo evidencia) junto com as que ele mesmo capturar.
// Resultado: reproducao.md (a extensão grava, para o Entendimento e o QA lerem). Sem vscode: roda em teste.
//
// Um arquivo por regra:
//   evidencias-ticket.js  anexos do ticket, do pai e dos irmãos que parecem evidência
//   resultado.js          cenários, o que falhou e o reproducao.md
//   prompt.js             prompt do claude -p e o bin (bin/reproducao-fluxo)
//   a tela é abas/reproducao.js; a execução, subetapas/1.2-reproducao.js
const { ehBug } = require('../../../../infra/dossie');
const { coletarEvidencias, evidenciasDoTicket, PASTA, INDICE } = require('./evidencias-ticket');
const { comEvidencia, resultado, gravarResumo, reiniciar } = require('./resultado');
const { prompt, BIN } = require('./prompt');
const { corpo } = require('../../../abas/reproducao');

module.exports = {
  corpo,
  prompt,
  resultado,
  gravarResumo,
  coletarEvidencias,
  evidenciasDoTicket,
  reiniciar,
  BIN,
  PASTA,
  INDICE,
  ehBug,
  _teste: { comEvidencia }
};
