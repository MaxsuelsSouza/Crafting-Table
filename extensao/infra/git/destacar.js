// @ts-check
// Checkout destacado para reproduzir um bug/incidente no código certo (frente D) e a volta ao HEAD de antes. Mesmas proteções de trocar.js
// (sujo, dono, worktree da esteira): recusa devolve { ok: false, motivo, texto } e não mexe em nada. Nunca commita, faz push, merge nem stash.
//   destacar(repo, commit, o)  guarda o HEAD atual (branch, ou o sha se já estava destacado) e faz checkout --detach <commit>
//   voltar(repo, head)         checkout <head> (o que destacar devolveu em `de`)
// Usado por: Implementações (1.4 Ref e ambiente; a volta no fim da 1.6 e ao retomar).
const path = require('path');
const { git, erroGit } = require('./git');
const { bloqueio, atualDe } = require('./trocar');

/** @param {{ caminho: string }} repo @param {string} commit @param {{ chave?: string }} [o] */
function destacar(repo, commit, o = {}) {
  const cwd = repo.caminho;
  try {
    const nome = atualDe(cwd),
      de = nome === 'HEAD' ? git(cwd, ['rev-parse', 'HEAD']) : nome;
    if (git(cwd, ['rev-parse', 'HEAD']) === git(cwd, ['rev-parse', commit])) return { ok: true, de, trocou: false };
    const b = bloqueio(cwd, o.chave || '');
    if (b) return b;
    git(cwd, ['checkout', '--detach', commit]);
    return { ok: true, de, trocou: true };
  } catch (x) {
    return { ok: false, motivo: 'git', texto: `${path.basename(cwd)}: ${erroGit(x)}` };
  }
}

/** @param {{ caminho: string }} repo @param {string} head */
function voltar(repo, head) {
  const cwd = repo.caminho;
  try {
    const nome = atualDe(cwd);
    if (nome === head || (nome === 'HEAD' && git(cwd, ['rev-parse', 'HEAD']) === head)) return { ok: true };
    git(cwd, ['checkout', head]);
    return { ok: true };
  } catch (x) {
    return { ok: false, motivo: 'git', texto: `${path.basename(cwd)}: ${erroGit(x)}` };
  }
}

module.exports = { destacar, voltar };
