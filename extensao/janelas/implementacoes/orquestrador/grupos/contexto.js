// @ts-check
// Serviços e ticket de um grupo de subtarefas: a esteira de hoje (1 → 8) roda sem mudar, porque tudo nela parte de s.pastaAba(t.id) e de
// s.reposDe(t). Aqui a pasta vira grupos/<id>/, os repositórios ficam só os das camadas do grupo (no paralelo, o worktree no lugar da checkout)
// e o Ao vivo do grupo é espelhado no do pai ("[G1] …"). t.grupo marca o ticket do grupo (prompts, dossiê, fim da esteira); s.pai e t.pai voltam ao pai.
const path = require('path');
const aoVivo = require('../../../../componentes/ao-vivo');
const { estado } = require('../../estado');
const { dirGrupo, lerPlano, CONTEXTO_GRUPO } = require('../../etapas/00-subtarefas/arquivos');
const worktree = require('../../etapas/00-subtarefas/regras/worktree');

// Repositórios das camadas do grupo (sem camada informada ou sem nenhum casando: todos).
const reposDoGrupo = (repos, g) => {
  const sel = (g?.camadas || []).length
    ? repos.filter((r) => g.camadas.some((c) => c === r.camada || c === path.basename(r.caminho).toLowerCase()))
    : repos;
  return sel.length ? sel : repos;
};

/** @returns {{ s: any, t: any, dir: string, g: any } | null} */
function contexto(s, t, id) {
  const dirPai = s.pastaAba(t.id),
    g = lerPlano(dirPai)?.grupos.find((x) => x.id === id);
  if (!g) return null;
  const dir = dirGrupo(dirPai, id);
  aoVivo.espelhar(dir, dirPai, `[${id}] `);
  const repos = (tt) => {
    const sel = reposDoGrupo(s.reposDe(tt), g);
    return estado(dir).worktree ? sel.map((r) => ({ ...r, caminho: worktree.caminho(t.chave, id, r) })) : sel;
  };
  const sG = { ...s, pastaAba: () => dir, reposDe: repos, pai: s };
  const tG = {
    ...t,
    titulo: `${t.titulo || t.chave} · ${id}: ${g.titulo}`,
    grupo: { id, titulo: g.titulo, subtarefas: g.subtarefas, contexto: path.join(dir, CONTEXTO_GRUPO) },
    pai: t
  };
  return { s: sG, t: tG, dir, g };
}

module.exports = { contexto, reposDoGrupo };
