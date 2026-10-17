// @ts-check
// Git dos repositórios de código (QA, Incidentes, Implementações): onde está o código do ticket, o nome da branch no padrão do repositório e a
// troca de branch com proteção. Sem vscode: roda em teste e em bin/. Regra das branches: CLAUDE.md, "Branches (QA, Incidentes, Implementações)".
// Como usar: const git = require('<…>/infra/git'); git.garantirPrincipal(repo, { chave, chaves, vivo }).
//
// Um arquivo por regra:
//   git.js            wrapper único (git, gitOk, erroGit)
//   localizar.js      onde está o código do ticket (localizar, escolher, refParaReproduzir)
//   padrao-branch.js  nome no padrão do repositório (nomeSugerido) e a branch do ticket que já existe (propria)
//   em-andamento.js   "correção em andamento" (achados fora da principal) em linhas de Markdown
//   trocar.js         trocar / criar / garantirPrincipal, com as proteções (sujo, presa em worktree, worktree da esteira, dono em memória)
//   destacar.js       checkout --detach no commit da reprodução e a volta ao HEAD de antes (mesmas proteções)
//   teste-git.js      node infra/git/teste-git.js (repositório git temporário)
const { git, gitOk, erroGit } = require('./git');
const { CANDIDATAS_PADRAO, localizar, escolher, refParaReproduzir, refPrincipal } = require('./localizar');
const { CANDIDATOS, candidatos, nomeSugerido, propria } = require('./padrao-branch');
const { emAndamento, candidatasDaConfig } = require('./em-andamento');
const { trocar, criar, garantirPrincipal, assumir, donoDe, raizWorktrees } = require('./trocar');
const { destacar, voltar } = require('./destacar');

module.exports = {
  git,
  gitOk,
  erroGit,
  CANDIDATAS_PADRAO,
  localizar,
  escolher,
  refParaReproduzir,
  refPrincipal,
  CANDIDATOS,
  candidatos,
  nomeSugerido,
  propria,
  trocar,
  criar,
  garantirPrincipal,
  assumir,
  donoDe,
  raizWorktrees,
  destacar,
  voltar,
  emAndamento,
  candidatasDaConfig
};
