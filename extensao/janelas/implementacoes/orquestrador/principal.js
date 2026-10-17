// @ts-check
// Entrada de cada execução (rodar-etapa.js): os repositórios voltam para a principal (infra/git garantirPrincipal), salvo se a checkout já é do
// ticket (chave dele, das subtarefas, do pai ou do avô no nome). A volta é na entrada e não no fim: a esteira termina com alterações não commitadas.
// Recusa (sujo, branch presa, execução de outro ticket…) vira a pausa 'principal' (tentar de novo ou seguir assim: estado.principalOk).
// Grupo em worktree e repositório sem branch principal ficam de fora (a etapa 5 pergunta a principal).
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const git = require('../../../infra/git');
const dossie = require('../../../infra/dossie');
const { TENTAR, SEGUIR, estado, pausar, situacao } = require('../estado');
const { ambiente } = require('./ambiente');
const { chavesDo } = require('../etapas/05-implementacao/regras/base-branch');

// Só as proteções pausam; erro de git (pasta que não é repositório, principal inexistente) segue: a etapa 5 trata.
const PROTECOES = ['sujo', 'presa', 'worktree-esteira', 'dono'];

/** true = pode seguir; false = pausou. */
function garantir(s, t, dir, n) {
  const e = estado(dir);
  if (e.worktree || e.principalOk) return true;
  const c = chavesDo(t, dossie.lerGravado(dir), s.cacheJira?.[t.id]),
    chaves = [...c.proprias, c.pai, c.avo].filter(Boolean);
  for (const r of ambiente(s, t).repos.filter((x) => x.branchPrincipal)) {
    const res = git.garantirPrincipal(r, {
      chave: t.chave,
      chaves,
      branches: [...Object.values(e.branches || {}), ...Object.values(e.criar || {}).map((x) => x.nome)],
      vivo: () => situacao(dir).rodando
    });
    if (res.trocou)
      aoVivo.anotar(dir, {
        tipo: 'acao',
        texto: `${path.basename(r.caminho)}: de volta para ${r.branchPrincipal} (estava em ${res.de})`
      });
    if (!res.ok && PROTECOES.includes(String(res.motivo))) {
      pausar(dir, n, {
        motivo: 'principal',
        pergunta: `${res.texto} Antes de rodar, a esteira volta o repositório para a principal (${r.branchPrincipal}).`,
        opcoes: [TENTAR, SEGUIR]
      });
      return false;
    }
  }
  return true;
}

module.exports = { garantir };
