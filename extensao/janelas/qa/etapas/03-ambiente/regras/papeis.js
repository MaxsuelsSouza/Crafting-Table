// @ts-check
// Qual Comando das Configurações sobe a API e qual sobe o Metro (escolha por pontos). Mora em infra/ambientes/aplicacao/papeis.js
// (comum a QA, Incidentes e aos ambientes); aqui só reexporta para o motor e os testes.
const { PAPEIS, pontos, papeisDe } = require('../../../../../infra/ambientes/aplicacao/papeis');

module.exports = { PAPEIS, pontos, papeisDe };
