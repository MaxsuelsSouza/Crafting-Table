// @ts-check
// Provedor do ticket (Jira ou documento local): nome nos rótulos, ticket por documento e o contexto do ticket para a IA.
const path = require('path');

// Nome do provedor para os rótulos (fora do VS Code, nos testes, cai no Jira).
const nomeProvedor = () => {
  try {
    return require('../../../infra/provedores/fachada').jira.nome || 'Jira';
  } catch {
    return 'Jira';
  }
};
// Ticket por documento (provedor local, sem rede): a pasta do QA é <ticket>/qa. Rótulos e prompt mudam; o fluxo é o mesmo, pelo adaptador local.
const ehLocal = (dir) => {
  try {
    return require('../../../infra/ticket/tickets').ler(path.basename(path.dirname(dir)))?.provedor === 'documento';
  } catch {
    return false;
  }
};
const onde = (dir) => (ehLocal(dir) ? 'documento' : nomeProvedor()); // "no <onde>"
// Ticket normalizado do provedor (buscar) + ticket local → arquivo de contexto que a IA lê (infra/ticket/contexto.js, igual para todo módulo).
const contextoTicket = (j, t) => require('../../../infra/ticket/contexto').contextoDoTicket(j, t);

module.exports = { nomeProvedor, ehLocal, onde, contextoTicket };
