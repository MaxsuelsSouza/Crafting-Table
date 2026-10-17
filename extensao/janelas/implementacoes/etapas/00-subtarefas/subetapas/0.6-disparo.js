// @ts-check
// 0.6 · Disparo (extensão, depois do portão): pasta e contexto de cada grupo, a branch <tipo>/<CHAVE> nos repositórios dos grupos (antes dos
// agentes: o worktree parte dela) e, no paralelo, o worktree destacado do segundo grupo. Depois entrega para a fila (orquestrador/grupos).
// Idempotente: o ▶ do pai passa por aqui de novo (branch já selecionada, worktree já criado).
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { TENTAR, ESTADO, mudar, pausar } = require('../../../estado');
const { prepararBranches, ramo } = require('../../05-implementacao');
const { dirGrupo, lerPlano } = require('../arquivos');
const { escreverContextoGrupo } = require('../regras/contexto-grupo');
const worktree = require('../regras/worktree');

async function disparar(s, t, rodada) {
  const grupos = require('../../../orquestrador/grupos'); // ciclo: grupos → etapa 0
  const dir = s.pastaAba(t.id),
    plano = lerPlano(dir);
  if (!plano) {
    mudar(dir, { fase: 'erro' });
    aoVivo.anotar(dir, { tipo: 'erro', texto: 'Plano das subtarefas aprovado, mas plano-subtarefas.json não existe' });
    return s.render();
  }
  mudar(dir, { etapa: 0, fase: 'grupos', pausa: null, planoAprovado: true });
  const paralelo = plano.execucao === 'paralelo';
  plano.grupos.forEach((g, i) => {
    const dG = dirGrupo(dir, g.id);
    escreverContextoGrupo(dir, dG, g, plano);
    if (!fs.existsSync(path.join(dG, ESTADO))) mudar(dG, { worktree: paralelo && i > 0 });
  });
  // <tipo>/<CHAVE> nos repositórios de todos os grupos (pausa aqui fica no pai, etapa 0)
  const todos = s.reposDe(t),
    alvo = todos.filter((r) => plano.grupos.some((g) => grupos.reposDoGrupo(todos, g).includes(r)));
  if (!(await prepararBranches(s, t, dir, { alvo, etapa: 0 }))) return s.render();
  if (paralelo) {
    for (const g of plano.grupos.slice(1))
      for (const r of grupos.reposDoGrupo(todos, g)) {
        const wt = worktree.caminho(t.chave, g.id, r);
        try {
          if (worktree.criar(r, wt, ramo(t)))
            aoVivo.anotar(dir, {
              tipo: 'acao',
              texto: `${path.basename(r.caminho)}: worktree do ${g.id} em ${wt} (destacado de ${ramo(t)})`
            });
        } catch (x) {
          pausar(dir, 0, {
            motivo: 'git',
            pergunta: `${path.basename(r.caminho)}: não consegui criar o worktree do ${g.id}: ${
              String(x.stderr || x.message)
                .trim()
                .split('\n')[0]
            }`,
            opcoes: [TENTAR]
          });
          return s.render();
        }
      }
  }
  mudar(dir, { fase: 'grupos' });
  return grupos.avancarFila(s, t);
}

module.exports = { disparar };
