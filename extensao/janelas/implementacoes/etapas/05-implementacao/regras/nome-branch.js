// @ts-check
// Nome da branch do ticket: <prefixo>/<CHAVE>, uma por ticket, sem slug (CLAUDE.md, "Branches"). O prefixo segue o padrão do repositório para o tipo
// do ticket (infra/git/padrao-branch.js: história → story/ ou feature/, bug → bugfix/ ou fix/, incidente → hotfix/…), e a esteira sempre confirma
// antes de criar (pausa 'criar'). Tipo não reconhecido: conhecido() é false e a esteira pausa perguntando (motivo 'tipo'); a resposta vira a
// categoria do ticket. Ticket com subtarefas: a chave e o tipo são os do pai.
const tipoTicket = require('../../../../../infra/ticket/tipo-ticket');
const git = require('../../../../../infra/git');

// Opções da pausa 'tipo' (texto do botão → categoria).
const OPCOES_TIPO = {
  'feature (história, tarefa, melhoria)': 'outro',
  'bugfix (bug)': 'bug',
  'hotfix (incidente)': 'incidente'
};

const conhecido = (t) => !!tipoTicket.categoriaDe(t);
// O nome do tipo na ferramenta (História, Task…); escolhido pelo usuário, a categoria (outro, bug, incidente).
const tipoDe = (t) => (t.categoriaOrigem === 'usuario' ? t.categoria : t.tipo || t.categoria);
/** @returns {{ nome: string, prefixo: string, porque: string }} */
const sugerido = (r, t) => git.nomeSugerido(r, { chave: t.chave, tipo: tipoDe(t) });
// Para mostrar: a branch já escolhida (estado.branches), senão "<prefixo>/CHAVE".
const rotulo = (t, branches) => Object.values(branches || {})[0] || `<prefixo>/${t.chave}`;

module.exports = { OPCOES_TIPO, conhecido, tipoDe, sugerido, rotulo };
