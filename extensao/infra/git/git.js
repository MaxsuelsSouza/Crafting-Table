// @ts-check
// Wrapper único do git para infra/git: git(cwd, args) devolve a saída sem as pontas (erro = exceção com stderr), gitOk(cwd, args) só diz se deu certo.
// Usado por localizar.js, padrao-branch.js e trocar.js. Sem vscode.
const { execFileSync } = require('child_process');

/** @param {string} cwd @param {string[]} args @param {{ timeout?: number }} [o] */
const git = (cwd, args, o = {}) =>
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: o.timeout || 60000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

/** @param {string} cwd @param {string[]} args */
const gitOk = (cwd, args) => {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
};

// Primeira linha do erro do git (para pausa e aviso).
const erroGit = (x) => String(x?.stderr || x?.message || x).trim().split('\n')[0];

module.exports = { git, gitOk, erroGit };
