// @ts-check
// Ferramentas dos claude -p da Reprodução. Nenhuma tem Edit/Write: o que a IA grava passa pelos bins (implementacao-gravar e reproducao-fluxo).
//   LEITURA_REPRO       1.2 Evidências, 1.3 Roteiro e o rascunho do pedido de dados: ler, gravar o artefato e registrar o plano
//   FERRAMENTAS_REPRO   1.5 Reproduzir: o de cima + mapa-db, adb, maestro e as ferramentas do ambiente (ex.: Playwright MCP no web)
const prompts = require('../../../prompts');
const { BIN } = require('../reproducao/prompt');

const LEITURA_REPRO = () => [
  'Read',
  'Glob',
  'Grep',
  `Bash(${prompts.GRAVAR}:*)`,
  `Bash(${BIN}:*)`,
  'Bash(ls:*)',
  'Bash(cat:*)',
  'Bash(head:*)',
  'Bash(tail:*)',
  'Bash(grep:*)'
];
/** @param {string} mapa raiz do plugin mapa @param {string[]} [doAmbiente] ferramentas do ambiente (infra/ambientes: ferramentas) */
const FERRAMENTAS_REPRO = (mapa, doAmbiente = []) => [
  ...LEITURA_REPRO().slice(0, 3),
  'Skill',
  ...LEITURA_REPRO().slice(3),
  ...(mapa ? [`Bash(${mapa}/bin/mapa-db:*)`] : []),
  'Bash(adb:*)',
  'Bash(maestro:*)',
  ...doAmbiente.filter((f) => !['Bash(adb:*)', 'Bash(maestro:*)'].includes(f))
];

module.exports = { LEITURA_REPRO, FERRAMENTAS_REPRO };
