// @ts-check
// Aba Esteira do ticket com subtarefas: com grupos em andamento, um Ao vivo por grupo lado a lado (divididos ao meio; sem largura, um embaixo
// do outro) e, abaixo de cada um, as Alterações do worktree dele. Sem grupo em andamento: o Ao vivo do pai, como antes.
const aoVivo = require('../../../componentes/ao-vivo');
const { esc } = require('../../../infra/texto');
const { reposDe } = require('../../../infra/ticket/repos');
const { dirGrupo } = require('../etapas/00-subtarefas/arquivos');
const { situacao, controlesDe } = require('../estado');
const alteracoes = require('./alteracoes');

const CSS = `<style>
  .iv-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr)); gap: 12px; }
  .iv-col { min-width: 0; } .iv-col-t { font-size: 12px; font-weight: 600; margin: 4px 0; }
</style>${alteracoes.CSS}`;

const corpo = (t, dir, sit, plano) => {
  const ativos = (plano?.grupos || []).filter((g) => {
    const sg = situacao(dirGrupo(dir, g.id));
    return sg.e.iniciado && sg.fase !== 'concluido';
  });
  if (!ativos.length) return aoVivo.caixa(dir, sit.rodando, 'esteira', controlesDe(sit));
  const s = { pastaAba: () => dir, reposDe },
    { contexto } = require('../orquestrador/grupos');
  return `${CSS}<div class="iv-grade">${ativos
    .map((g) => {
      const c = contexto(s, t, g.id),
        sg = situacao(c.dir);
      return `<div class="iv-col"><div class="iv-col-t">${esc(g.id)} · ${esc(g.titulo)}</div>
      ${aoVivo.caixa(c.dir, sg.rodando, null, { conversa: false }, `aoVivo-${g.id}`) || '<div class="folha"><div class="alt-vazio">Nada ao vivo ainda.</div></div>'}
      ${alteracoes.caixa(c.dir, c.s.reposDe(c.t), g.id)}</div>`;
    })
    .join('')}</div>`;
};

module.exports = { corpo };
