// @ts-check
// Pacote do refinamento: um único refinamento.md na pasta da spec (repositório de specs, versionável) para quem pega a atividade sem ter
// participado. Junta o que hoje mora em lugares diferentes: os arquivos de cada passo (spec, plano, tarefas, análise, testes) e o que só existia
// na pasta do ticket desta máquina (perguntas e respostas, dúvidas ao time, decisões, mudanças pedidas em comentário, cards).
// Só lê disco e escreve um arquivo: sem IA, sem vscode. Gerado de novo a cada aprovação e quando a spec conclui; não edite à mão.
//   comum.js      nome do arquivo, rótulos e utilidades
//   montar.js     monta o texto: cabeçalho, pendências, passos e as seções abaixo, nessa ordem
//   historico.js  perguntas e respostas, dúvidas ao time, decisões e mudanças por comentário
//   tarefas.js    tabela dos cards
//   arquivos.js   arquivos de cada passo embutidos, mapas do código e constituição
//   gravar.js     grava na pasta da spec (não regrava se só a data mudou)
const { ARQUIVO } = require('./comum');
const { montar } = require('./montar');
const { gravar } = require('./gravar');

module.exports = { ARQUIVO, montar, gravar };
