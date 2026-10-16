// @ts-check
const vagas = require('../../../../infra/agentes/etapas');
const caixaEtapas = require('../../../../componentes/caixa-etapas');
const { estado } = require('../../estado');
const { cenarios } = require('../../etapas/02-cenarios/mapa');
const { RESULTADOS } = require('../../etapas/06-execucao/cenario');
const { statusAmbiente } = require('../../etapas/03-ambiente/status');
const { massa } = require('../../etapas/05-massa/estado');
const { podePublicar } = require('../../etapas/07-publicar');

// Caixa de etapas do QA: os nomes vêm de infra/agentes/etapas.js (módulo "qa", os mesmos da aba Plugins); o estado sai do que o módulo já sabe.
function etapasQa(dir, e, rodando) {
  const nomes = vagas.MODULOS.find((m) => m.id === 'qa').etapas.map((x) => x.nome);
  const r = cenarios(dir).cenarios.filter((c) => !c.arquivado && c.status !== 'dispensado'),
    feitos = r.filter((c) => RESULTADOS.includes(c.status)).length;
  const aprovado = e.fase === 'plano_aprovado',
    amb = statusAmbiente(dir),
    ms = massa(dir).itens;
  const plano =
    e.fase === 'erro'
      ? ['erro']
      : aprovado
        ? ['concluida']
        : e.fase === 'plano_encontrado'
          ? ['aguardando']
          : ['criando', 'alterando'].includes(e.fase) && rodando
            ? ['rodando']
            : ['pendente'];
  const ambEt = !aprovado
    ? ['pendente']
    : amb?.tipo === 'preparando'
      ? ['rodando']
      : amb?.tipo === 'erro'
        ? ['erro']
        : amb
          ? ['concluida']
          : ['pendente'];
  const pc = estado(dir).precondicao,
    preEt =
      !aprovado || !r.length
        ? ['pendente']
        : pc?.status === 'ok'
          ? ['concluida']
          : pc?.status === 'falhou'
            ? ['erro']
            : pc?.status === 'verificando' && rodando
              ? ['rodando']
              : ['pendente'];
  const massaEt =
    !aprovado || !r.length
      ? ['pendente']
      : ms.some((i) => i.estado === 'valida')
        ? ['concluida']
        : ambEt[0] === 'concluida' && rodando
          ? ['rodando']
          : ['pendente'];
  const exec =
    !aprovado || !r.length
      ? ['pendente']
      : feitos === r.length
        ? ['concluida', `${feitos}/${r.length}`]
        : e.execucao === 'pausado'
          ? ['pausada', `${feitos}/${r.length}`]
          : rodando
            ? ['rodando', `${feitos}/${r.length}`]
            : ['pendente', feitos ? `${feitos}/${r.length}` : ''];
  const pub = podePublicar(cenarios(dir).cenarios) ? ['aguardando', 'pronta para publicar'] : ['pendente'];
  const est = [
    plano,
    aprovado ? ['concluida', `${r.length} cenário(s)`] : ['pendente'],
    ambEt,
    preEt,
    massaEt,
    exec,
    pub
  ];
  const refazMassa =
    '<button class="ce-hover" data-painel="qaMassaRefazer" title="Valida no banco a massa dos cenários pendentes, move para Massas mortas só a que não serve mais e pede à IA massa nova só para quem ficou sem">↻ Refazer massa</button>';
  const etapas = nomes.map((nome, i) => ({
    n: i + 1,
    nome,
    estado: est[i][0],
    ...(est[i][1] !== undefined ? { rotulo: est[i][1] } : {}),
    ...(i === 4 && est[i][0] === 'concluida' && !rodando ? { hover: refazMassa } : {})
  }));
  return caixaEtapas.caixa({
    titulo: 'Etapas do QA',
    etapas,
    atual: (etapas.find((x) => x.estado !== 'concluida') || {}).n
  });
}

module.exports = { etapasQa };
