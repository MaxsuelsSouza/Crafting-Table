// @ts-check
// Bloco do QA no topo da seção Evidências (modulos/evidencias.js): cartões (refazer, pausa, planejamento, execução), etapas, Ao vivo e o mapa de cenários.
//   cartao-plano.js · cartao-pausa.js · cartao-refazer.js  cartões do topo
//   execucao.js  fila, Dar início/Retomar e publicar
//   etapas.js    caixa "Etapas do QA"
//   mapa.js      mapa de cenários
const aoVivo = require('../../../../componentes/ao-vivo');
const { estado } = require('../../estado');
const { qaRodando } = require('../../orquestrador/rodando');
const { versaoAtual } = require('../../etapas/01-planejamento/versoes');
const { cenarios } = require('../../etapas/02-cenarios/mapa');
const { ambiente } = require('../../etapas/03-ambiente/estado');
const { CSS } = require('../css');
const { cartaoPlano } = require('./cartao-plano');
const { cartaoPausa } = require('./cartao-pausa');
const { cartaoRefazer } = require('./cartao-refazer');
const { execucaoHtml } = require('./execucao');
const { etapasQa } = require('./etapas');
const { mapaHtml } = require('./mapa');

// uri(arquivo) → endereço da webview (miniaturas das evidências).
function html(dir, uri = () => '') {
  const e = estado(dir),
    ult = versaoAtual(dir),
    rodando = qaRodando(dir);
  const card = cartaoPlano(dir, e, ult, rodando);
  const aprovado = e.fase === 'plano_aprovado';
  const pausaCard = cartaoPausa(dir, e);
  const loteCard = cartaoRefazer(dir);
  // Plano já aprovado: o cartão dele desce para baixo do Ao vivo (em cima ficam execução e ambiente).
  // O ambiente fica só no rodapé do painel (status, log ao vivo e a análise do Claude num modal).
  return (
    CSS +
    loteCard +
    pausaCard +
    (aprovado || e.pausa ? '' : card) +
    (aprovado && !e.pausa ? execucaoHtml(dir, e, rodando) : '') +
    etapasQa(dir, e, rodando) +
    aoVivo.caixa(dir, rodando, 'qa') +
    (aprovado ? card + mapaHtml(dir, cenarios(dir), ambiente(dir), uri) : '')
  );
}

module.exports = { html };
