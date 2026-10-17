// @ts-check
// Ferramentas dos claude -p da etapa 7: o plano (7.1) só lê e grava pelo implementacao-gravar; a execução (7.3) também registra pelo
// reproducao-fluxo e dirige a aplicação com as ferramentas do ambiente (adb/maestro ou o Playwright MCP). Sem Edit/Write: não mexe em código.
const path = require('path');
const prompts = require('../../../prompts');

const FLUXO = path.join(__dirname, '..', '..', '..', 'bin', 'reproducao-fluxo');
const BASE = (mapa) => [
  'Read',
  'Glob',
  'Grep',
  `Bash(${prompts.GRAVAR}:*)`,
  ...(mapa ? [`Bash(${mapa}/bin/mapa-db:*)`, `Bash(${mapa}/bin/mapa-git:*)`] : []),
  'Bash(ls:*)',
  'Bash(cat:*)',
  'Bash(head:*)',
  'Bash(tail:*)',
  'Bash(grep:*)'
];
const FERRAMENTAS_PLANO = (mapa) => BASE(mapa);
/** @param {string} mapa @param {{ ferramentas: string[] }} amb ambiente (infra/ambientes) */
const FERRAMENTAS_EXECUTAR = (mapa, amb) => [...BASE(mapa), 'Skill', `Bash(${FLUXO}:*)`, ...amb.ferramentas];

module.exports = { FLUXO, FERRAMENTAS_PLANO, FERRAMENTAS_EXECUTAR };
