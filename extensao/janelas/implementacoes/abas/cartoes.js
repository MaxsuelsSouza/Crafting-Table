// @ts-check
// Cartões da aba Esteira: a pausa (pergunta, opções e resposta) e o pedido de aprovação da etapa. Usados pela esteira do ticket simples
// (esteira.js) e pelo ticket com subtarefas (grupos.js), uma vez para o pai e uma por grupo: key = id do grupo (data-key; vazio = o pai).
const path = require('path');
const { esc } = require('../../../infra/texto');
const { etapa } = require('../etapas');
const { btn } = require('./css');

// Pausas resolvidas só pelos botões (sem campo de resposta).
const SO_BOTOES = [
  'tipo',
  'sync',
  'sem-mudanca',
  'verificacao',
  'repro-nao',
  'repro-evidencia',
  'base',
  'integrar',
  'verificacao-final'
];
const SEM_RESPOSTA = ['sujo', 'git', 'repos'];

const cartaoPausa = (e, fase, key = '', titulo = 'Pausa da esteira') => {
  if (!e.pausa || fase !== 'pausado') return '';
  const k = key ? ` data-key="${esc(key)}"` : '',
    p = e.pausa;
  const corpo =
    p.motivo === 'manual'
      ? `<div class="es-barra">${btn('▶ Retomar', 'esteiraRetomar', '', 'bt bt-principal')}</div>`
      : `${p.opcoes.length ? `<div class="es-barra">${p.opcoes.map((o, i) => btn(esc(o), 'esteiraResponder', ` data-op="${i}"${k}`)).join('')}</div>` : ''}
      ${
        SEM_RESPOSTA.includes(p.motivo) || (p.opcoes.length && SO_BOTOES.includes(p.motivo))
          ? ''
          : `<textarea class="es-obs" data-texto placeholder="Sua resposta…" style="margin-top:8px"></textarea><div class="es-barra">${btn('Responder e continuar', 'esteiraResponder', k, 'bt bt-principal')}</div>`
      }`;
  return `<div class="caixa-t">${esc(titulo)}</div><div class="folha"><div class="es-pausa"><p>${esc(p.pergunta)}</p>${corpo}</div></div>`;
};

const AVISO = {
  0: ' Aprovar cria a branch do ticket (feature/, bugfix/ ou hotfix/&lt;CHAVE&gt;) e começa os grupos (no máximo 2 agentes ao mesmo tempo).',
  4: ' Aprovar libera a esteira a alterar o código dos repositórios (na branch do ticket, sem commit).'
};
const cartaoAprovacao = (e, fase, dir, key = '', prefixo = '') => {
  const et = etapa(e.etapa),
    lido = !!e.aprovacao?.lido,
    k = key ? ` data-key="${esc(key)}"` : '';
  if (fase !== 'aguardando' || !et) return '';
  return `<div class="agora"><div class="atitulo">${esc(prefixo)}Revise a etapa ${et.n} · ${esc(et.nome)}</div>
    <div class="atexto">Abra <b>${esc(et.arq)}</b>, leia e clique em <b>Aprovar</b> ou <b>Pedir ajuste</b>.${AVISO[et.n] || ''}</div>
    <div class="aacoes"><div class="format-bar arquivo"><button class="fb-btn" data-acao="esteiraAbrir" data-id="${et.n}"${k} title="${esc(path.join(dir, et.arq))}">Abrir ${esc(et.arq)}</button></div>
      <div class="acoes-passo"><button class="aprovar ${lido ? '' : 'travado'}" data-acao="esteiraAprovar"${k} ${lido ? '' : 'disabled'} title="${lido ? 'Aprovar esta etapa: a esteira segue sozinha' : 'Abra o arquivo antes de aprovar: nunca aprove sem ler'}">Aprovar</button>
        <button data-acao="esteiraAjuste"${k}>Pedir ajuste</button></div></div></div>`;
};

module.exports = { cartaoPausa, cartaoAprovacao };
