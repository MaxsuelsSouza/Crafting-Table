// @ts-check
// Ferramentas do claude -p da execução do QA: as liberadas (--allowedTools) e as proibidas em qualquer etapa (--disallowedTools).
const FERRAMENTAS_EXEC = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill'];
// Nunca na execução do QA, qualquer que seja a etapa: o prompt pede, a extensão garante (--disallowedTools).
const PROIBIDAS = [
  'Bash(git commit:*)',
  'Bash(git push:*)',
  'Bash(git merge:*)',
  'Bash(git rebase:*)',
  'Bash(git reset:*)',
  'Bash(git clean:*)',
  'Bash(git tag:*)'
];

module.exports = { FERRAMENTAS_EXEC, PROIBIDAS };
