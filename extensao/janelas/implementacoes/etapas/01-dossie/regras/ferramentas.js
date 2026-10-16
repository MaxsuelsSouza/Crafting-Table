// @ts-check
// Ferramentas do claude -p da Reprodução: leitura, os bins implementacao-gravar e reproducao-fluxo, mapa-db, adb e maestro. Sem Edit/Write.
const prompts = require('../../../prompts');
const reproducao = require('../reproducao');

const FERRAMENTAS_REPRO = (mapa) => [
  'Read',
  'Glob',
  'Grep',
  'Skill',
  `Bash(${prompts.GRAVAR}:*)`,
  `Bash(${reproducao.BIN}:*)`,
  ...(mapa ? [`Bash(${mapa}/bin/mapa-db:*)`] : []),
  'Bash(adb:*)',
  'Bash(maestro:*)',
  'Bash(ls:*)',
  'Bash(cat:*)',
  'Bash(head:*)',
  'Bash(tail:*)',
  'Bash(grep:*)'
];

module.exports = { FERRAMENTAS_REPRO };
