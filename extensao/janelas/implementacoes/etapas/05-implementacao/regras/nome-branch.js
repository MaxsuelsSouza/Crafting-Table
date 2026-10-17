// @ts-check
// Nome da branch do ticket: <tipo>/<CHAVE>, uma por ticket, sem slug (CLAUDE.md, "Branch de trabalho"). O tipo sai da categoria do ticket
// (infra/ticket/tipo-ticket.js: o nome do tipo na ferramenta ou a escolha do usuário), porque a Implementação faz feature, bug e incidente:
//   outro (história, tarefa, melhoria…) → feature/<CHAVE> · bug e bug experimental → bugfix/<CHAVE> · incidente → hotfix/<CHAVE>
// Tipo não reconhecido: ramo() devolve null e a esteira pausa perguntando (motivo 'tipo'); a resposta vira a categoria do ticket.
// Ticket com subtarefas: a chave e o tipo são os do pai. Só dados (sem vscode nem git): a tela e os prompts usam rotulo().
const tipoTicket = require('../../../../../infra/ticket/tipo-ticket');

const PREFIXOS = { outro: 'feature', bug: 'bugfix', 'bug-experimental': 'bugfix', incidente: 'hotfix' };
// Opções da pausa 'tipo' (texto do botão → categoria).
const OPCOES_TIPO = {
  'feature (história, tarefa, melhoria)': 'outro',
  'bugfix (bug)': 'bug',
  'hotfix (incidente)': 'incidente'
};

const prefixo = (t) => PREFIXOS[tipoTicket.categoriaDe(t)] || null;
/** @returns {string | null} */
const ramo = (t) => {
  const p = prefixo(t);
  return p ? `${p}/${t.chave}` : null;
};
// Para mostrar antes de saber o tipo: "<tipo>/CHAVE".
const rotulo = (t) => ramo(t) || `<tipo>/${t.chave}`;

module.exports = { PREFIXOS, OPCOES_TIPO, prefixo, ramo, rotulo };
