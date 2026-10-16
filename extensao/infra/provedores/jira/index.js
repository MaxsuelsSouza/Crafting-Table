// @ts-check
// Adaptador do Jira (Cloud): REST v3, Agile 1.0, JQL e ADF. Cumpre infra/provedores/contrato.js; o resto da extensão não vê
// JQL nem ADF: texto entra e sai em Markdown.
//
// Um arquivo por regra:
//   link.js        link do ticket ↔ chave (lerLink, chaveDaBranch, linkDo)
//   conta.js       credenciais, conta guardada e quem é você (eu)
//   api.js         chamada autenticada à API
//   adf.js         Markdown ↔ ADF (descrição e comentários)
//   ticket.js      ler o ticket: buscar, filhos, comentários, anexo
//   escrever.js    escrever no ticket: comentar, anexar, descrição, subtarefa
//   busca.js       pessoas, seus tickets (JQL) e labels
//   board.js       board, etapas (colunas) e status do projeto
//   descoberta.js  metadados da conta para o mapeamento por IA
const vscode = require('vscode');
const { lerLink, chaveDaBranch, linkDo } = require('./link');
const { camposCredencial, credenciais, conectado, sairConta, eu } = require('./conta');
const { buscar, filhos, comentarios, baixarAnexo } = require('./ticket');
const { comentar, anexar, atualizarDescricao, criarSubtarefa } = require('./escrever');
const { pessoas, meus, labels } = require('./busca');
const { etapas, boardPorNome, boardsPorNome, boards, projetoInfo, statusDoProjeto } = require('./board');
const { projetos, descobrir } = require('./descoberta');
const { mdParaAdf, adfTexto, adfMd } = require('./adf');

/** @type {import('../contrato').Provedor} */
const jira = {
  id: 'jira', nome: 'Jira', camposCredencial,
  capacidades: { subtarefas: true, anexos: true, comentarios: true, mencoes: true, labels: true, board: true, estimativa: true },
  lerLink, chaveDaBranch, linkDo, credenciais, conectado, sairConta, buscar, filhos, comentar, comentarios, anexar, baixarAnexo, pessoas, eu, meus, labels,
  etapas, boardPorNome, boardsPorNome, boards, projetos, projetoInfo, statusDoProjeto, descobrir, criarSubtarefa, atualizarDescricao
};
module.exports = { ...jira, _teste: { mdParaAdf, adfTexto, adfMd } };
