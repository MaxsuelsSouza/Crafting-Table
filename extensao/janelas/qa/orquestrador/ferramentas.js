// @ts-check
// Ferramentas do claude -p da execução do QA: as liberadas (--allowedTools) e as proibidas em qualquer etapa (--disallowedTools).
// Bash livre em todas as etapas (com padrões, comando composto, variável ou pipe caía na permissão e a sessão travava: WMS-14752);
// o que não pode está nas PROIBIDAS. O banco vem à parte (orquestrador/banco.js: MCP do SQLcl com hook só SELECT).
const FERRAMENTAS_EXEC = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill'];
// Nunca na execução do QA, qualquer que seja a etapa: o prompt pede, a extensão garante (--disallowedTools).
const PROIBIDAS = [
  'Bash(git commit:*)',
  'Bash(git push:*)',
  'Bash(git merge:*)',
  'Bash(git rebase:*)',
  'Bash(git reset:*)',
  'Bash(git clean:*)',
  'Bash(git tag:*)',
  // banco só pelo MCP (hook só SELECT) ou pelo mapa-db: nunca um SQLcl/SQL*Plus direto, que escreveria sem a aprovação do humano
  'Bash(sql:*)',
  'Bash(sqlplus:*)',
  ...[require('../../../infra/plugins/mapa/lib/banco').acharSqlcl()].filter(Boolean).map((p) => `Bash(${p}:*)`)
];

module.exports = { FERRAMENTAS_EXEC, PROIBIDAS };
