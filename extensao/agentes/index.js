// @ts-check

// Agente de IA ativo: o escolhido em craftingTable.agente (padrão: Claude Code).
// Novo agente = uma linha aqui. `plugins` é opcional: agente sem plugins/marketplace (só o Claude Code tem) esconde a aba Plugins.
const AGENTES = {
  claude: () => ({ id: 'claude', nome: 'Claude Code', plugins: require('./claude') })
};

/** @returns {{ id: string, nome: string, plugins?: typeof import('./claude') }} */
function agenteAtivo() {
  let id = 'claude';
  try { id = require('vscode').workspace.getConfiguration('craftingTable').get('agente') || 'claude'; } catch {} // sem vscode (testes): o padrão
  return (AGENTES[id] || AGENTES.claude)();
}

module.exports = { agenteAtivo, AGENTES, ids: Object.keys(AGENTES) };
