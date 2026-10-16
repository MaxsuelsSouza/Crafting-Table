// @ts-check
// Dependência externa do relatório: quem executou (git config user.name do repositório do backend).
const { execFileSync } = require('child_process');

function executor(repo) {
  try {
    return execFileSync('git', ['config', 'user.name'], {
      cwd: repo || undefined,
      encoding: 'utf8',
      timeout: 5000
    }).trim();
  } catch {
    return '';
  }
}

module.exports = { executor };
