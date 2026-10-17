// @ts-check
// Quais subtarefas entram na Etapa 0: 'aberta' (vai para um grupo e é implementada), 'concluida' (já feita: não implementa de novo, mas
// indica trabalho que a branch do ticket precisa levar; ver 05-implementacao/regras/base-branch.js) e 'fora' (cancelada ou de QA).
// Pelo nome do status e do tipo (o provedor não manda a categoria do status). Sem vscode: a lista usa para o selo do card.
const CONCLUIDA = /conclu|done|fechad|closed|resolvid|resolved|finaliz|entregue/i;
const CANCELADA = /cancel|descart|rejeit|won'?t|duplicad|obsolet|invalid/i;
const QA = /(^|[^A-Za-z])QA([^A-Za-z]|$)|\bteste?s?\b|\btest\b/i;

/** @param {{ resumo?: string, status?: string, tipo?: string }} x @returns {'aberta'|'concluida'|'fora'} */
function situacao(x) {
  const status = String(x.status || '');
  if (CANCELADA.test(status)) return 'fora';
  if (/\[QA\]/i.test(String(x.resumo || '')) || QA.test(String(x.tipo || ''))) return 'fora';
  return CONCLUIDA.test(status) ? 'concluida' : 'aberta';
}
/** @param {any[]} lista subtarefas do ticket (jira.buscar().subtarefas) */
const separar = (lista) => {
  const r = { abertas: [], concluidas: [], fora: [] };
  for (const x of lista || []) r[{ aberta: 'abertas', concluida: 'concluidas', fora: 'fora' }[situacao(x)]].push(x);
  return r;
};

module.exports = { situacao, separar };
