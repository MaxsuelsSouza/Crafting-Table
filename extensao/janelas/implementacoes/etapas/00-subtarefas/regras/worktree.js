// @ts-check
// Worktree do grupo que roda em paralelo (CLAUDE.md, "Branch de trabalho"): destacado (--detach) do HEAD de <tipo>/<CHAVE>, sem branch nova,
// fora de ~/.claude (o Claude Code protege a pasta para escrita): ~/.cache/crafting-table/worktrees/<CHAVE>/<grupo>/<repositório>.
// Ao terminar, a diferença do worktree (inclusive arquivos novos) é aplicada na checkout do repositório (git apply, sem commit) e o worktree sai.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { deps } = require('../../../dependencias');

const RAIZ = () => path.join(os.homedir(), '.cache', 'crafting-table', 'worktrees');
const caminho = (chave, grupo, repo) => path.join(RAIZ(), chave, grupo, path.basename(repo.caminho));

/** Cria o worktree destacado em `ref` (idempotente). */
function criar(repo, wt, ref) {
  if (fs.existsSync(path.join(wt, '.git'))) return false;
  fs.mkdirSync(path.dirname(wt), { recursive: true });
  deps.git(repo.caminho, ['worktree', 'add', '--detach', wt, ref]);
  return true;
}
// Diferença do worktree contra o HEAD dele, com os arquivos novos (add -N só marca a intenção: nada é commitado).
function diferenca(wt) {
  deps.git(wt, ['add', '-N', '.']);
  return deps.gitBruto(wt, ['diff', '--binary', 'HEAD']);
}
/** Aplica a diferença do worktree no repositório. { ok, vazio?, erro?, patch? } (patch gravado ao lado do worktree quando falha). */
function aplicar(repo, wt) {
  if (!fs.existsSync(path.join(wt, '.git'))) return { ok: true, vazio: true };
  const patch = diferenca(wt);
  if (!patch.trim()) return { ok: true, vazio: true };
  try {
    deps.gitBruto(repo.caminho, ['apply', '--check', '-'], patch);
  } catch (x) {
    const arq = `${wt}.patch`;
    fs.writeFileSync(arq, patch);
    return {
      ok: false,
      patch: arq,
      erro: String(x.stderr || x.message)
        .trim()
        .split('\n')
        .slice(0, 6)
        .join('\n')
    };
  }
  deps.gitBruto(repo.caminho, ['apply', '-'], patch);
  return { ok: true };
}
function remover(repo, wt) {
  try {
    deps.git(repo.caminho, ['worktree', 'remove', '--force', wt]);
  } catch {
    fs.rmSync(wt, { recursive: true, force: true });
    try {
      deps.git(repo.caminho, ['worktree', 'prune']);
    } catch {
      /* sem worktree registrado */
    }
  }
}

module.exports = { RAIZ, caminho, criar, aplicar, remover };
