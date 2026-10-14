// @ts-check
const vscode = require('vscode');

// Provedor ativo: a ferramenta de gestão de trabalho escolhida em craftingTable.provedor (padrão: Jira).
// Novo provedor = um arquivo provedores/<id>.js que cumpre o contrato (provedores/contrato.js) + uma linha aqui.
const ADAPTADORES = { jira: () => require('./jira') };
// Adaptadores locais: nunca aparecem como ferramenta escolhível (configuracao/conexao.js lista só ADAPTADORES); a fachada os roteia por ticket.
const LOCAIS = { documento: () => require('./documento') };
const provedorPorId = (id) => (ADAPTADORES[id] || LOCAIS[id] || ADAPTADORES.jira)();
// Operação sobre ticket-documento: algum argumento (depois de secrets) é alvo com site 'documento:…' / provedor 'documento', ou string 'documento:…'.
const eLocal = (a) => (typeof a === 'string' ? a.startsWith('documento:') : !!a && typeof a === 'object' && (a.provedor === 'documento' || String(a.site || '').startsWith('documento:')));
const provedorPara = (args) => (args.some(eLocal) ? provedorPorId('documento') : provedorAtivo());

/** @returns {import('./contrato').Provedor} */
function provedorAtivo() {
  const id = vscode.workspace?.getConfiguration?.('craftingTable')?.get?.('provedor') || 'jira'; // sem vscode (testes): o padrão
  return (ADAPTADORES[id] || ADAPTADORES.jira)();
}
// Nome para os rótulos da tela ("Ver no Jira").
const nomeProvedor = () => provedorAtivo().nome;

module.exports = { provedorAtivo, provedorPorId, provedorPara, LOCAIS, nomeProvedor, ADAPTADORES, ids: Object.keys(ADAPTADORES) };
