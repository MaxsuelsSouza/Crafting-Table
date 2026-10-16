// @ts-check
const path = require('path');
const { esc } = require('../comum');
const { cenariosDo } = require('../../etapas/02-cenarios/regras/parser');
const { mdDaVersao } = require('../../etapas/01-planejamento/versoes');
const { ehLocal, nomeProvedor, onde } = require('../../etapas/01-planejamento/dependencias');

// Cartão do planejamento conforme a fase (ult: versão atual do plano).
function cartaoPlano(dir, e, ult, rodando) {
  const plano = ult && `${esc(ult.subtarefa)} · v${ult.v}`;
  const abrir = ult
    ? `<div class="format-bar arquivo"><button class="fb-btn" data-painel="qaPlanoAbrir" title="${esc(path.join(dir, ult.arquivo))}">Abrir ${esc(ult.arquivo)}</button>` +
      '<button class="fb-btn" data-painel="qaPlanoMencionar" title="Mencionar no Claude">@</button></div>'
    : '';
  const lido = ult && e.lido === ult.v;
  const card =
    e.fase === 'sem_plano' || (e.fase === 'criando' && !rodando)
      ? `<div class="qa-card bloq"><b>Sem planejamento de QA</b><p>O QA só começa com o planejamento.${e.subtarefas?.length ? ` A subtarefa ${esc(e.subtarefas.join(', '))} não tem cenários.` : ''}
       O Claude escreve o plano; você lê e aprova, e só então a Crafting Table ${ehLocal(dir) ? 'salva no documento' : `publica no ${nomeProvedor()}`}.</p><button data-painel="qaCriarPlano">Criar planejamento</button></div>`
      : e.fase === 'criando'
        ? `<div class="qa-card"><b><span class="vivo-bola"></span>Criando o planejamento</b><p>O Claude está escrevendo o plano; ao terminar ele aparece aqui para você ler e aprovar (nada é publicado antes).</p></div>`
        : e.fase === 'alterando' && rodando
          ? `<div class="qa-card"><b><span class="vivo-bola"></span>Aplicando sua mudança no planejamento</b><p>“${esc(e.pedido || '')}”. Ao terminar, a versão nova aparece aqui para aprovar.</p></div>`
          : ['plano_encontrado', 'alterando'].includes(e.fase) && ult
            ? `<div class="qa-card${e.processando ? ' proc' : ''}" title="${esc(e.processando || '')}"><b>Planejamento encontrado · ${plano}</b><p>${esc(ult.resumo)} · ${cenariosDo(mdDaVersao(dir, ult)).length} cenário(s). Leia e aprove para listar os cenários.${e.publicarPendente ? ` O plano ainda está só aqui: aprovar o publica no ${esc(onde(dir))}.` : ''}${e.erro ? ` <span class="dim">Última tentativa: ${esc(e.erro)}</span>` : ''}</p>
       ${abrir}${
         e.fase === 'alterando'
           ? ''
           : `<div class="acoes-passo"><button class="aprovar ${lido ? '' : 'travado'}" data-painel="qaPlanoAprovar" ${lido ? '' : 'disabled'}
         title="${lido ? 'Aprovar o planejamento e listar os cenários' : 'Abra o arquivo antes de aprovar: nunca aprove sem ler'}">Aprovar</button>
         <button data-painel="qaPlanoMudar" title="Descreva o ajuste: o Claude aplica na subtarefa e gera a versão nova">Pedir ajuste</button></div>`
       }</div>`
            : e.fase === 'plano_aprovado' && ult
              ? `<div class="qa-card linha"><b>Planejamento aprovado · ${plano} <span class="dim">${esc(ult.resumo)}</span></b>${abrir}</div>`
              : e.fase === 'erro'
                ? `<div class="qa-card bloq"><b>Não consegui conferir o planejamento</b><p>${esc(e.erro)}</p><button data-painel="qaPlay">Tentar de novo</button></div>`
                : !e.fase
                  ? '<div class="qa-card"><b>QA não iniciado</b><p>Clique em ▶ no topo: a Crafting Table procura o planejamento de QA do ticket.</p></div>'
                  : '';
  return card;
}

module.exports = { cartaoPlano };
