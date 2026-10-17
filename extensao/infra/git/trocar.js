// @ts-check
// Troca de branch com proteção: com destacar.js, o único lugar da extensão que faz checkout num repositório do usuário. Nunca commita, faz push, merge nem stash.
//   trocar(repo, branch)            checkout da branch (local; só no origin → cria a local rastreando a remota)
//   criar(repo, nome, base)         fetch + checkout -b <nome> --no-track <base>
//   garantirPrincipal(repo, o)      na ENTRADA de cada execução: volta para a principal, salvo se a checkout já é do ticket (chave no nome)
// Proteções (qualquer uma devolve { ok: false, motivo, texto } e não mexe em nada):
//   'dono'              outra execução viva (outro ticket) está usando o repositório (dono em memória: assumir())
//   'worktree-esteira'  a pasta é o worktree da esteira de outro ticket (~/.cache/crafting-table/worktrees/<CHAVE>/) ou a branch está presa nele
//   'sujo'              alterações não commitadas em arquivos versionados (arquivo novo não conta: o git recusa se fosse sobrescrito)
//   'presa'             a branch está em uso em outro worktree
const fs = require('fs');
const os = require('os');
const path = require('path');
const { git, gitOk, erroGit } = require('./git');
const { reChave } = require('../dossie/trabalho-existente');

// Mesma pasta de janelas/implementacoes/etapas/00-subtarefas/regras/worktree.js (worktree do grupo em paralelo).
const raizWorktrees = () => path.join(os.homedir(), '.cache', 'crafting-table', 'worktrees');
const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
// Chave do ticket dono do worktree da esteira em que `p` está (ou null).
const chaveDoWorktree = (p) => {
  const rel = path.relative(real(raizWorktrees()), real(p));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep)[0] : null;
};

// Dono em memória: caminho → { chave, vivo }. Só bloqueia enquanto vivo() (ex.: o Claude da execução ainda roda).
const donos = new Map();
/** @param {string} caminho @param {string} chave @param {() => boolean} vivo */
const assumir = (caminho, chave, vivo) => donos.set(real(caminho), { chave, vivo });
const donoDe = (caminho) => donos.get(real(caminho)) || null;

const nomeRepo = (cwd) => path.basename(cwd);
const atualDe = (cwd) => git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);

function bloqueioDono(cwd, chave) {
  const d = donoDe(cwd);
  if (d && d.chave !== chave && d.vivo())
    return { ok: false, motivo: 'dono', texto: `${nomeRepo(cwd)} está em uso pela execução de ${d.chave}: espere ela terminar (ou pare) e tente de novo.` };
  const wt = chaveDoWorktree(cwd);
  if (wt && wt !== chave) return { ok: false, motivo: 'worktree-esteira', texto: `${cwd} é o worktree da esteira de ${wt}: não mexo nele.` };
  return null;
}
function bloqueio(cwd, chave, alvo) {
  const d = bloqueioDono(cwd, chave);
  if (d) return d;
  if (git(cwd, ['status', '--porcelain', '--untracked-files=no']))
    return { ok: false, motivo: 'sujo', texto: `${nomeRepo(cwd)} tem alterações não commitadas em ${atualDe(cwd)}. Guarde ou commite e continue: a extensão não mexe em trabalho seu.` };
  if (!alvo) return null;
  // branch presa em outro worktree (o git recusaria o checkout)
  const aqui = real(git(cwd, ['rev-parse', '--show-toplevel']));
  const blocos = git(cwd, ['worktree', 'list', '--porcelain']).split(/\n\n+/);
  const preso = blocos.map((b) => ({ dir: b.match(/^worktree (.+)$/m)?.[1] || '', branch: b.match(/^branch (.+)$/m)?.[1] || '' }))
    .find((w) => w.branch === `refs/heads/${alvo}` && real(w.dir) !== aqui);
  if (!preso) return null;
  const k = chaveDoWorktree(preso.dir);
  return k && k !== chave
    ? { ok: false, motivo: 'worktree-esteira', texto: `${alvo} está em uso no worktree da esteira de ${k} (${preso.dir}).` }
    : { ok: false, motivo: 'presa', texto: `${alvo} está em uso em outro worktree (${preso.dir}): libere lá (git worktree remove) e tente de novo.` };
}

/**
 * @param {{ caminho: string }} repo
 * @param {string} branch
 * @param {{ chave?: string, vivo?: () => boolean }} [o] chave: ticket da execução; vivo: com ele, o repositório passa a ter este dono
 * @returns {{ ok: boolean, de?: string, para?: string, trocou?: boolean, motivo?: string, texto?: string }}
 */
function trocar(repo, branch, o = {}) {
  const cwd = repo.caminho;
  try {
    const de = atualDe(cwd);
    if (de === branch) return feito(cwd, o, { ok: true, de, para: branch, trocou: false });
    const b = bloqueio(cwd, o.chave || '', branch);
    if (b) return b;
    if (gitOk(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])) git(cwd, ['checkout', branch]);
    else if (gitOk(cwd, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`])) git(cwd, ['checkout', '-b', branch, '--track', `origin/${branch}`]);
    else return { ok: false, motivo: 'nao-existe', texto: `${nomeRepo(cwd)}: a branch ${branch} não existe (nem no origin).` };
    return feito(cwd, o, { ok: true, de, para: branch, trocou: true });
  } catch (x) {
    return { ok: false, motivo: 'git', texto: `${nomeRepo(cwd)}: ${erroGit(x)}` };
  }
}

/**
 * @param {{ caminho: string }} repo
 * @param {string} nome branch nova
 * @param {string} base ref de onde parte (ex.: origin/master-md, origin/story/WMS-1)
 * @param {{ chave?: string, vivo?: () => boolean, buscar?: boolean }} [o] buscar: false pula o fetch
 */
function criar(repo, nome, base, o = {}) {
  const cwd = repo.caminho;
  try {
    const de = atualDe(cwd);
    const b = bloqueio(cwd, o.chave || '');
    if (b) return b;
    if (o.buscar !== false)
      try {
        git(cwd, ['fetch', 'origin'], { timeout: 120000 });
      } catch (x) {
        return { ok: false, motivo: 'fetch', texto: `${nomeRepo(cwd)}: não consegui buscar o origin: ${erroGit(x)}` };
      }
    git(cwd, ['checkout', '-b', nome, '--no-track', base]);
    return feito(cwd, o, { ok: true, de, para: nome, trocou: true });
  } catch (x) {
    return { ok: false, motivo: 'git', texto: `${nomeRepo(cwd)}: ${erroGit(x)}` };
  }
}

/**
 * @param {{ caminho: string, branchPrincipal?: string }} repo
 * @param {{ chave?: string, chaves?: string[], branches?: string[], vivo?: () => boolean }} [o] chaves: as do ticket (subtarefas, pai, avô): checkout com uma
 *   delas no nome fica; branches: nomes do ticket sem a chave (escolhidos pelo usuário) que também ficam
 */
function garantirPrincipal(repo, o = {}) {
  const cwd = repo.caminho,
    p = repo.branchPrincipal;
  if (!p) return { ok: false, motivo: 'sem-principal', texto: `${nomeRepo(cwd)}: branch principal não configurada.` };
  try {
    const b = bloqueioDono(cwd, o.chave || '');
    if (b) return b;
    const de = atualDe(cwd),
      chaves = (o.chaves || [o.chave]).filter(Boolean);
    if (de !== p && ((o.branches || []).includes(de) || (chaves.length && reChave(chaves).test(de)))) return feito(cwd, o, { ok: true, de, para: de, trocou: false, doTicket: true });
  } catch (x) {
    return { ok: false, motivo: 'git', texto: `${nomeRepo(cwd)}: ${erroGit(x)}` };
  }
  return trocar(repo, p, o);
}

function feito(cwd, o, r) {
  if (o.vivo && o.chave) assumir(cwd, o.chave, o.vivo);
  return r;
}

module.exports = { trocar, criar, garantirPrincipal, assumir, donoDe, raizWorktrees, bloqueio, atualDe };
