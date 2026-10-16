// @ts-check
// Dossiê da Implementação: o que existe no disco do ticket (spec, cards, incidente, QA, descrição, briefing do dev) normalizado em três
// eixos (alvo, pronto, onde) com a confiança de cada fonte. Daí saem a prontidão e o modo da esteira (implementacoes/). Só lê arquivos:
// sem vscode e sem IA, então roda em teste e em bin/. Gravado em impl/dossie.json (máquina) e impl/dossie.md (IA e aba Dossiê).
//   confiança: aprovado (humano aprovou) > gerado (IA produziu) > bruto (texto do ticket) > verbal (o dev explicou) > ausente
//   modo: executar (spec e tarefas aprovadas) · corrigir (diagnóstico do incidente) · entender (texto sem refino) · perguntar (nada)
// Usado por: Implementações (esteira e abas Esteira e Dossiê), QA (qa/entrada.js: montar, gravar, nivelDe), Incidentes (incidentes/entrada.js:
// a régua) e Refinamento (refinamento/abas/spec/acoes/iniciar.js: sobreTicket).
// Como usar: const dossie = require('<…>/infra/dossie'); dossie.gravar(dir, dossie.montar(t, { j, banco, repos })).
//
// Um arquivo por regra:
//   arquivos.js            nomes dos arquivos (sem require)
//   ticket.js              sobreTicket (descrição, comentários, documento) e ehBug
//   confianca.js           régua de confiança (NIVEIS, rank, nivelDe) e capacidades (banco, repositórios)
//   trabalho-existente.js  branches e commits do ticket nos repositórios (git só leitura)
//   montar.js              eixos, prontidão e modo
//   markdown.js            dossie.md (paraMarkdown) e os rótulos
//   gravar.js              grava e lê o dossiê
const { BRIEFING, JSON_, MD, TRABALHO, REPRODUCAO } = require('./arquivos');
const { sobreTicket, ehBug } = require('./ticket');
const { NIVEIS, rank, nivelDe, capacidadesDe } = require('./confianca');
const { trabalhoExistente, trabalhoParaMarkdown, reChave } = require('./trabalho-existente');
const { montar } = require('./montar');
const { ROTULO_MODO, paraMarkdown } = require('./markdown');
const { gravar, lerGravado } = require('./gravar');

/** @typedef {import('./confianca').Item} Item */

module.exports = { montar, sobreTicket, capacidadesDe, rank, ehBug, paraMarkdown, gravar, lerGravado, nivelDe, trabalhoExistente, trabalhoParaMarkdown, NIVEIS, ROTULO_MODO, BRIEFING, JSON_, MD, TRABALHO, REPRODUCAO, _teste: { rank, reChave } };
