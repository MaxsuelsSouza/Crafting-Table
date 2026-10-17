// @ts-check
// Aba Esteira do ticket com subtarefas: a Etapa 0 (0.1 a 0.6) e uma linha por grupo com a etapa em que ele está (abre a 1 → 8 dele),
// os cartões de aprovação e de pausa do pai e de cada grupo (data-key = grupo) e o Ao vivo: o de cada grupo em andamento lado a lado, com as
// alterações do worktree embaixo (ao-vivo-grupos.js), ou o do pai (os grupos espelham nele, "[G1] …").
const caixaEtapas = require('../../../componentes/caixa-etapas');
const { esc } = require('../../../infra/texto');
const { ETAPAS } = require('../etapas');
const { SUBETAPAS } = require('../etapas/00-subtarefas');
const { lerPlano, lerSubs, dirGrupo } = require('../etapas/00-subtarefas/arquivos');
const { situacao, existe } = require('../estado');
const { cartaoPausa, cartaoAprovacao } = require('./cartoes');
const { CSS } = require('./css');
const { rotulo } = require('../etapas/05-implementacao/regras/nome-branch');

const ESTADO = {
  rodando: 'rodando',
  pausado: 'pausada',
  erro: 'erro',
  aguardando: 'aguardando',
  concluido: 'concluida',
  grupos: 'rodando'
};

// Subetapa atual da etapa 0 (índice em SUBETAPAS).
const atualDa0 = (dir, e) =>
  e.planoAprovado ? 5 : e.fase === 'aguardando' ? 4 : existe(dir, 0) ? 3 : lerSubs(dir).length ? 2 : 0;

const linhaZero = (dir, sit) => {
  const e = sit.e,
    i = atualDa0(dir, e),
    feita = e.planoAprovado && sit.fase !== 'pausado';
  const est = feita ? 'concluida' : ESTADO[sit.fase] || 'pendente';
  return {
    n: 0,
    nome: 'Subtarefas',
    estado: est,
    aberta: !e.planoAprovado,
    subetapas: SUBETAPAS.map((nome, k) => ({
      n: `0.${k + 1}`,
      nome,
      estado: feita || k < i ? 'concluida' : k === i ? est : 'pendente'
    }))
  };
};

const linhaGrupo = (dirPai, g, plano, feitos) => {
  const dir = dirGrupo(dirPai, g.id),
    sit = situacao(dir),
    e = sit.e;
  const espera = g.dependeDe.filter((d) => !feitos.includes(d));
  const est = !e.iniciado ? 'pendente' : sit.fase === 'parado' ? 'pendente' : ESTADO[sit.fase] || 'pendente';
  const et = ETAPAS.find((x) => x.n === e.etapa);
  const rotulo = !e.iniciado
    ? espera.length
      ? `espera ${espera.join(', ')}`
      : 'na fila'
    : sit.fase === 'concluido'
      ? 'concluído'
      : `etapa ${e.etapa} · ${et?.nome || ''}${sit.fase === 'aguardando' ? ' · aguardando sua aprovação' : sit.fase === 'pausado' ? ' · pausado' : sit.fase === 'parado' ? ' · parado' : ''}`;
  return {
    n: g.id,
    nome: `${g.titulo} (${g.subtarefas.join(', ')})${e.worktree ? ' · worktree' : ''}`,
    estado: est,
    rotulo,
    aberta: ['rodando', 'aguardando', 'pausado'].includes(sit.fase),
    subetapas: ETAPAS.map((x) => ({
      n: String(x.n),
      nome: x.nome,
      estado:
        sit.fase === 'concluido' || (x.n < e.etapa && existe(dir, x.n))
          ? 'concluida'
          : x.n === e.etapa && e.iniciado
            ? est
            : 'pendente'
    }))
  };
};

const corpo = (t, d0, dir) => {
  const sit = situacao(dir),
    e = sit.e,
    plano = e.planoAprovado ? lerPlano(dir) : null;
  const feitos = (plano?.grupos || [])
    .filter((g) => situacao(dirGrupo(dir, g.id)).fase === 'concluido')
    .map((g) => g.id);
  const etapas = [linhaZero(dir, sit), ...(plano?.grupos || []).map((g) => linhaGrupo(dir, g, plano, feitos))];
  const resumo = plano
    ? `<div class="folha"><div class="es-resumo">${plano.grupos.length} grupo(s) · execução <b>${esc(plano.execucao)}</b> · branch <b>${esc(rotulo(t, e.branches))}</b> · ${feitos.length}/${plano.grupos.length} concluído(s)${e.fase === 'concluido' ? ' · <b>implementacao.md</b> pronto para o QA' : ''}</div></div>`
    : `<div class="folha"><div class="es-resumo">Branch do ticket: <b>${esc(rotulo(t, e.branches))}</b> (prefixo no padrão do repositório; sem branch, a esteira pergunta antes de criar)</div></div>`;
  const porGrupo = (plano?.grupos || [])
    .map((g) => {
      const sg = situacao(dirGrupo(dir, g.id));
      return (
        cartaoAprovacao(sg.e, sg.fase, dirGrupo(dir, g.id), g.id, `${g.id} · `) +
        cartaoPausa(sg.e, sg.fase, g.id, `Pausa do ${g.id} · ${g.titulo}`)
      );
    })
    .join('');
  return `${CSS}${caixaEtapas.caixa({ titulo: 'Esteira de implementação · subtarefas', etapas, atual: e.planoAprovado ? '' : 0 })}
  ${resumo}${cartaoAprovacao(e, sit.fase, dir)}${cartaoPausa(e, sit.fase)}${porGrupo}
  ${require('./ao-vivo-grupos').corpo(t, dir, sit, plano)}`;
};

module.exports = { corpo };
