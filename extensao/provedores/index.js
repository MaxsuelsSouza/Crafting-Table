// @ts-check
const vscode = require('vscode');

// Provedor ativo: a ferramenta de gestão de trabalho escolhida em craftingTable.provedor (padrão: Jira).
// Novo provedor = um arquivo provedores/<id>.js que cumpre o contrato (provedores/contrato.js) + uma linha aqui.
const ADAPTADORES = { jira: () => require('./jira') };

/** @returns {import('./contrato').Provedor} */
function provedorAtivo() {
  const id = vscode.workspace?.getConfiguration?.('craftingTable')?.get?.('provedor') || 'jira'; // sem vscode (testes): o padrão
  return (ADAPTADORES[id] || ADAPTADORES.jira)();
}
// Nome para os rótulos da tela ("Ver no Jira").
const nomeProvedor = () => provedorAtivo().nome;

module.exports = { provedorAtivo, nomeProvedor, ADAPTADORES, ids: Object.keys(ADAPTADORES) };
