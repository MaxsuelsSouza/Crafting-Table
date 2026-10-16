// @ts-check
const { esc } = require('../../../infra/texto');
const aoVivo = require('../../../componentes/ao-vivo');
const mudancas = require('./mudancas');
const { emRefino } = require('../../estado');
const { controlesDe } = require('./cabecalho');
const { caixaPausa } = require('./pausa');
const { telaConstituicao } = require('./constituicao');
const { cartaoAgora } = require('./agora');

// Corpo da aba Spec: cartão Agora, caixas de mudança, Ao vivo e a constituição.
const corpoAba = (t, d) =>
  `${caixaPausa(t, d.dir)}${emRefino(t) || d.estado ? cartaoAgora(t, d.estado, d.vivoRodando, d.tarefas, d.impactos) : ''}${mudancas.caixaDecisao(d.impactos)}${mudancas.caixaMudancas(d.impactos)}${aoVivo.caixa(d.dir, d.vivoRodando, 'spec', emRefino(t) ? controlesDe(t) : undefined)}<div class="folha">${
    t.spec?.dir
      ? telaConstituicao(t, d.estado, d.abertos, d.impactos)
      : `<div class="vazio-aba">A spec ainda não foi iniciada.<br>Clique em <b>▶</b> no topo: o Claude cria <code>${esc(t.chave)}-…/</code> no repositório de specs e começa pelo passo 0.</div>`
  }</div>`;

module.exports = { corpoAba };
