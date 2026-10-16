// @ts-check
// Regras do Claude na etapa 5: ferramentas liberadas no claude -p, regras do prompt (as mesmas da 6) e a skill da reprodução.
const { GRAVAR, FLUXO, REGRAS_5E6: REGRAS } = require('../../../prompt'); // ~/.claude é bloqueada para Write/Edit no claude -p: os arquivos do incidente são gravados por mergulho-gravar.
const vagas = require('../../../../infra/agentes/etapas');

// Ferramentas por prefixo (nada de Bash livre): só os bins do incidente, o banco por mapa-db (leitura), adb e maestro para o emulador e leitura de arquivos.
const FERRAMENTAS = (mapa = '', adb = 'adb') => [
  'Read',
  'Glob',
  'Grep',
  'Skill',
  `Bash(${GRAVAR}:*)`,
  `Bash(${FLUXO}:*)`,
  ...(mapa ? [`Bash(${mapa}/bin/mapa-db:*)`] : []),
  'Bash(adb:*)',
  ...(adb !== 'adb' ? [`Bash(${adb}:*)`] : []),
  'Bash(maestro:*)',
  'Bash(ls:*)',
  'Bash(cat:*)',
  'Bash(head:*)',
  'Bash(tail:*)',
  'Bash(grep:*)'
];

// Skill da reprodução (Configurações > Plugins, infra/agentes/etapas.js; padrão: ~/.claude/skills/testes-funcionais).
const SKILL = () => vagas.pastaSkill('incidentes.reproducao') || '';

module.exports = { FERRAMENTAS, REGRAS, SKILL, GRAVAR, FLUXO };
