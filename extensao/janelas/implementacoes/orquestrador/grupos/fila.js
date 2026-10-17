// @ts-check
// Fila dos grupos de subtarefas (depois do portão da etapa 0): começa os grupos cujas dependências estão concluídas, no máximo 2 ao mesmo
// tempo, e chama a conclusão do pai quando todos terminam. Chamada pelo disparo (0.6), pelo fim de cada grupo (avancar.js) e pelo ▶ do pai.
const aoVivo = require('../../../../componentes/ao-vivo');
const controle = require('../../../../infra/controle');
const { estado, mudar, situacao } = require('../../estado');
const { dirGrupo, lerPlano } = require('../../etapas/00-subtarefas/arquivos');
const { contexto } = require('./contexto');

const MAX_AO_MESMO_TEMPO = 2;

// Situação de cada grupo: iniciado (a fila já começou), concluído e rodando.
const situacoes = (dirPai, plano) =>
  Object.fromEntries(
    plano.grupos.map((g) => {
      const d = dirGrupo(dirPai, g.id),
        sit = situacao(d);
      return [g.id, { iniciado: !!sit.e.iniciado, concluido: sit.fase === 'concluido', rodando: sit.rodando, sit }];
    })
  );

async function avancarFila(s, t) {
  const dirPai = s.pastaAba(t.id),
    plano = lerPlano(dirPai);
  if (!plano || estado(dirPai).fase !== 'grupos') return;
  const st = situacoes(dirPai, plano);
  if (plano.grupos.every((g) => st[g.id].concluido)) return require('./concluir').concluir(s, t, controle.nova(dirPai)); // ciclo: concluir → fila
  const ativos = plano.grupos.filter((g) => st[g.id].iniciado && !st[g.id].concluido).length;
  const prontos = plano.grupos.filter((g) => !st[g.id].iniciado && g.dependeDe.every((d) => st[d]?.concluido));
  const { seguir } = require('../seguir'); // ciclo: seguir → grupos
  for (const g of prontos.slice(0, Math.max(0, MAX_AO_MESMO_TEMPO - ativos))) {
    const c = contexto(s, t, g.id);
    if (!c) continue;
    mudar(c.dir, { iniciado: true });
    aoVivo.anotar(dirPai, { tipo: 'acao', texto: `Grupo ${g.id} (${g.subtarefas.join(', ')}) começou` });
    seguir(c.s, c.t).catch(() => {});
  }
  s.render();
}

module.exports = { MAX_AO_MESMO_TEMPO, situacoes, avancarFila };
