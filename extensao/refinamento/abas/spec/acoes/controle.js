// @ts-check
// Dar início, Pausar e Retomar.
const { ticketDe, gravarRefino } = require('../../../locais');
const orq = require('../../../orquestrador');
const { pasta } = require('../comum');
const { modo } = require('../cabecalho');

const acoes = (s) => ({
  darInicio() {
    return acoes(s).retomar();
  },
  // Pausar de verdade: estado primeiro (as filas e o fim da etapa leem), depois cancela a rodada e para o Claude.
  pausar() {
    const t = s.ticketAberto();
    if (!t) return;
    modo(t.chave, 'pausado');
    orq.interromper(t);
    s.render();
  },
  // Dar início / ▶ Retomar / Continuar: modo rodando e, se nada espera por você, o Claude começa a próxima etapa.
  retomar() {
    const t = s.ticketAberto();
    if (!t) return;
    gravarRefino(pasta(t.chave), { pausa: null, correcao: null }); // retomar zera a pausa da conferência e as correções gastas
    modo(t.chave, 'rodando');
    if (!orq.seguir(ticketDe(t.chave) || t)) {
      orq.retomarFilas(ticketDe(t.chave) || t);
      s.render();
    }
  }
});

module.exports = { acoes };
