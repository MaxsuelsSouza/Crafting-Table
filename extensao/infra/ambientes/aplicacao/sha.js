// @ts-check
// Commit curto do código que está rodando (HEAD do repositório), para o `sha` do ambiente. null quando não der.
const { execFileSync } = require('child_process');

const shaDe = (repo) => {
  try {
    return repo
      ? execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { timeout: 5000 }).toString().trim()
      : null;
  } catch {
    return null;
  }
};

module.exports = { shaDe };
