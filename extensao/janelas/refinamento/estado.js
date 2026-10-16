// @ts-check
// Estado do Refinamento no .ticket.json (refinamento.*): o modo (estado), o papel do tipo de ticket e quem lê/grava.
// Lido pela tela, pela lista, pelo orquestrador e pelas etapas.
const tickets = require('../../infra/ticket/tickets');

// Modo refinamento (.ticket.json refinamento.estado): aguardando_inicio → (Dar início) → rodando ⇄ pausado.
const MODO_ATIVO = ['aguardando_inicio', 'rodando', 'pausado'];
const emRefino = (t) => MODO_ATIVO.includes(t.refinamento?.estado);
const estadoDe = (chave) => tickets.ler(chave)?.refinamento?.estado;
const pausado = (chave) => estadoDe(chave) === 'pausado'; // pausado: nada novo começa (triagem, impacto e alteração esperam o ▶)
const mudarEstado = (chave, estado) => {
  const x = tickets.ler(chave);
  if (!x) return undefined;
  const refinamento = { ...x.refinamento, estado };
  tickets.gravar({ ...x, refinamento });
  return refinamento;
};
// Tipo do ticket (hierarquia): papel gravado ao iniciar o refinamento (spec.js). Sem papel (refinamento antigo) = desenvolvimento.
const papelDoTicket = (t) => {
  const r = tickets.ler(t.chave || t.id)?.refinamento || {};
  return { papel: r.papel || 'desenvolver', tipo: r.tipoTicket || '', filho: r.filho || '' };
};
// Pill do card na lista (infra/ticket/situacao.js, pelo registro): o texto e a cor do modo refinamento, ou null (desligado/concluído).
const situacaoCard = (t) => {
  const m = t.refinamento?.estado;
  return m === 'rodando'
    ? { texto: 'Refinando', cor: 'ia', dica: 'Modo refinamento: o Claude trabalha nos passos da spec' }
    : m === 'pausado'
      ? { texto: 'Refinamento pausado', cor: 'pausada', dica: '' }
      : m === 'aguardando_inicio'
        ? { texto: 'Preparando spec', cor: 'ia', dica: '' }
        : null;
};

module.exports = { MODO_ATIVO, emRefino, estadoDe, pausado, mudarEstado, papelDoTicket, situacaoCard };
