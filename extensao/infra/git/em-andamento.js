// @ts-check
// "Correção em andamento": onde o código do ticket já está fora da principal (localizar, sem o achado 'principal'), em linhas de Markdown.
// Só informativo (Incidentes: fim do 3-dados-logs.md). As candidatas vêm de craftingTable.branchesCandidatas; fora do VS Code, o padrão.
const path = require('path');
const { localizar } = require('./localizar');

const candidatasDaConfig = () => {
  try {
    return require('../../configuracao/configuracao').cfg().get('branchesCandidatas');
  } catch {
    return undefined; // fora do VS Code: o padrão do localizar
  }
};

/** @param {{ caminho: string, branchPrincipal?: string }[]} repos @param {string[]} chaves @returns {string[]} */
const emAndamento = (repos, chaves) =>
  repos.flatMap((r) =>
    localizar(r, chaves, { candidatas: candidatasDaConfig() })
      .achados.filter((a) => a.via !== 'principal')
      .map((a) => `- ${path.basename(r.caminho)}: correção em andamento em \`${a.ref}\` (${a.via}, ${a.commits.length} commit(s))`)
  );

module.exports = { emAndamento, candidatasDaConfig };
