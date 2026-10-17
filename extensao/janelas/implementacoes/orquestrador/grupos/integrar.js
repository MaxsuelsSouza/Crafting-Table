// @ts-check
// Integração do grupo que rodou em paralelo (worktree): aplica a diferença de cada worktree na checkout de <tipo>/<CHAVE> e remove o worktree.
// Conflito (o outro grupo mexeu no mesmo trecho): pausa o pai com o patch gravado; nada se perde (o worktree só sai depois de aplicar).
const path = require('path');
const aoVivo = require('../../../../componentes/ao-vivo');
const { TENTAR, estado, mudar, pausar } = require('../../estado');
const { lerPlano } = require('../../etapas/00-subtarefas/arquivos');
const worktree = require('../../etapas/00-subtarefas/regras/worktree');
const { reposDoGrupo } = require('./contexto');
const { rotulo } = require('../../etapas/05-implementacao/regras/nome-branch');

const INTEGREI = 'Já integrei à mão (remover o worktree)';

/** true = integrado (ou nada a integrar); false = pausou. */
function integrar(s, t) {
  const dirPai = s.pastaAba(t.id),
    plano = lerPlano(dirPai),
    e = estado(dirPai);
  if (!plano || plano.execucao !== 'paralelo' || e.integrado) return true;
  const manual = e.integrarManual;
  for (const g of plano.grupos.slice(1)) {
    for (const r of reposDoGrupo(s.reposDe(t), g)) {
      const wt = worktree.caminho(t.chave, g.id, r);
      if (!manual) {
        let res;
        try {
          res = worktree.aplicar(r, wt);
        } catch (x) {
          res = {
            ok: false,
            erro: String(x.stderr || x.message)
              .trim()
              .split('\n')[0]
          };
        }
        if (!res.ok) {
          pausar(dirPai, 0, {
            motivo: 'integrar',
            pergunta: `Não consegui aplicar o que o ${g.id} fez (worktree ${wt}) em ${path.basename(r.caminho)}: ${res.erro}${res.patch ? `\nO patch está em ${res.patch}.` : ''}\nResolva (aplique o patch à mão ou ajuste os arquivos) e escolha.`,
            opcoes: [TENTAR, INTEGREI]
          });
          return false;
        }
        aoVivo.anotar(dirPai, {
          tipo: 'acao',
          texto: `${path.basename(r.caminho)}: ${res.vazio ? `${g.id} não alterou nada` : `alterações do ${g.id} aplicadas na branch ${rotulo(t)}`}`
        });
      }
      worktree.remover(r, wt);
    }
  }
  mudar(dirPai, { integrado: true, integrarManual: false });
  return true;
}

module.exports = { INTEGREI, integrar };
