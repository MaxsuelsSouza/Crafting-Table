// @ts-check
// Orquestrador do Mergulho (módulo Incidentes): roda as etapas na ordem, pausa, pede aprovação e retoma. A lógica de cada etapa mora em
// etapas/NN-*.js; aqui fica só o que é comum a todas. Estado em <aba>/.mergulho.json (estado.js). Contrato: janelas/incidentes/CONTRATO.md.
// Etapas 1 a 4: cada uma é um `claude -p` (maestro.rodar) que grava o seu arquivo; a extensão confere o arquivo e segue para a próxima.
// Etapa 5 (e o fecho da 6): etapas/05-reproducao executar.
// Pausa: o Claude grava .pausa.json ({ motivo, pergunta, opcoes }); a extensão guarda no estado, mostra na aba e retoma com a resposta (.respostas.md).
//
// Um arquivo por regra:
//   rodar-etapa.js     etapas 1 a 4: portão do ticket, gancho "antes" e o claude -p
//   portao-ticket.js   etapas que leem o ticket: relê, anexos baixados, ticket legível, .jira-contexto.md
//   claude-etapa.js    opções do claude -p (prompt, banco, env do mapa-db, plugins, --add-dir)
//   apos-etapa.js      etapa terminou: pausa do Claude, arquivo não gravado (erro) ou pausa do "depois"
//   avancar.js         segue sozinho ou pede aprovação
//   reproduzir.js      entrada na etapa 5
//   seguir.js          Iniciar/Continuar/Retomar
//   pausar.js          pausa de uma etapa e ⏸ manual
//   responder.js       resposta à pausa: etapa dona, ticket ou .respostas.md
//
// Ganchos que um arquivo de etapa pode exportar (todos opcionais):
//   tarefa(dir, obsPO)              texto da etapa no prompt (prompt.js)
//   leTicket / analisaAnexos        a etapa lê o ticket: relê, exige anexos baixados e o ticket legível (portao-ticket.js)
//   antes({ s, t, dir, j, ajuste }) antes de rodar; devolve { motivo, pergunta, opcoes, aviso } para pausar ou null
//   depois({ s, t, dir })           com o arquivo da etapa gravado; idem (pausa) ou null
//   sempreAprovar                   pede aprovação mesmo com a entrada completa
//   responder({ s, t, dir, e, resposta })  resposta a uma pausa: 'seguir' | 'avancar' | 'render' | null (ignora) | undefined (não é desta etapa)
const { rodarEtapa } = require('./rodar-etapa');
const { aposEtapa } = require('./apos-etapa');
const { avancarEtapa } = require('./avancar');
const { seguir, retomar } = require('./seguir');
const { pausarManual } = require('./pausar');
const { responder } = require('./responder');
const { anexosFaltando } = require('./portao-ticket');

module.exports = { rodarEtapa, aposEtapa, avancarEtapa, seguir, pausarManual, retomar, responder, anexosFaltando };
