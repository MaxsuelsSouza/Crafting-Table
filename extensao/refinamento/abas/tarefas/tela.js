// @ts-check
// Tela da aba Tarefas: quadro de colunas, detalhe de cada card (modal) e a grade das abertas.
const jira = require('../../../infra/ticket').jira;
const { esc } = require('../../../infra/texto');
const { markdown } = require('../../../componentes/markdown');
const { quando, iniciais } = require('../../../componentes/formato');
const { IC } = require('../../../componentes/icones');
const { lerTexto } = require('../../locais');
const mudancas = require('../../etapas/comentarios/regras');
const { ondeNome, respNome, siglas, linkSub, STATUS_T, COLUNAS_T } = require('./rotulos');

function telaTarefas(t, l, impactos = []) {
  const atencao = mudancas.cardsAfetados(impactos);
  if (!l.length)
    return `<div class="folha"><div class="vazio-aba">Nenhuma tarefa ainda.<br>No passo 4 da spec o Claude cria as tarefas e elas aparecem aqui como cards,
    para você aprovar (vira subtarefa no ${esc(ondeNome(t))} em ${esc(t.chave)}), reprovar ou pedir alteração.</div></div>`;
  const chip = (c) => `${c.camada ? `<span class="tcam cam-${esc(c.camada)}">${esc(c.camada)}</span>` : ''}
    ${c.estimativa ? `<span class="test" title="Estimativa original">⏱ ${esc(c.estimativa)}</span>` : ''}
    ${c.ticket ? `<span class="tjira">${esc(c.ticket)}</span>` : ''}
    ${respNome(c) ? `<span class="tav" title="Responsável: ${esc(respNome(c))}">${esc(c.responsavel ? siglas(c.responsavel.nome) : iniciais())}</span>` : ''}`;
  const card = (
    c
  ) => `<div class="tcard ts-${esc(c.status)} ${c.tipo === 'qa' ? 'tqa' : ''} ${atencao.has(c.id) ? 'tatencao' : ''}" data-tcard="${esc(c.id)}" title="Abrir ${esc(c.id)}">
    <div class="ttit">${atencao.has(c.id) ? `<span class="taten" title="Uma mudança pedida em comentário do ${esc(ondeNome(t))} pode atingir este card (aguarda sua decisão na aba Spec)">⚠</span>` : ''}${c.tipo === 'qa' ? '<span class="selo-qa">QA</span>' : ''}${esc(c.titulo || c.id)}${c.revisao ? '<span class="trev" title="Uma mudança no ticket atingiu esta subtarefa">↻ revisar</span>' : ''}</div>
    ${c.tipo === 'qa' && c.resumo ? `<div class="tres">${esc(c.resumo)}</div>` : ''}
    ${c.status === 'em_alteracao' ? '<div class="tproc"><span class="vivo-bola"></span>Claude alterando…</div>' : ''}
    <div class="tpe"><span class="tid">${esc(c.id)}</span>${chip(c)}</div></div>`;
  const linha = (rot, v) => (v ? `<div class="tm-l"><span>${rot}</span><div>${v}</div></div>` : '');
  // Corpo do detalhe (título em diante): o mesmo no modal de uma tarefa e na célula da grade das abertas.
  const corpo = (c) => {
    const aberta = c.status === 'pendente';
    return `<h3>${esc(c.titulo || c.id)}</h3>
      ${c.status === 'em_alteracao' ? `<div class="tproc"><span class="vivo-bola"></span>Claude aplicando: “${esc(c.alteracao || '')}”</div>` : ''}
      ${
        c.tipo === 'qa'
          ? `<div class="tm-desc md">${markdown(lerTexto(c.arquivo || '') || 'Plano de testes não encontrado.')}</div>`
          : `<div class="tm-desc">${esc(c.descricao || 'Sem descrição.')}</div>`
      }
      <div class="tm-ls">
        ${linha('Pronto quando', esc(c.pronto || ''))}
        ${linha('Requisitos', esc((c.rf || []).join(', ')))}
        ${linha('Depende de', esc((c.depende || []).join(', ')))}
        ${linha('Camada', esc(c.camada || ''))}
        ${linha(esc(ondeNome(t)), c.ticket ? (linkSub(t, c.ticket) ? `<a href="${esc(linkSub(t, c.ticket))}">${esc(c.ticket)}</a>` : esc(c.ticket)) : '')}
        ${!aberta ? linha('Estimativa original', esc(c.estimativa || '—')) + linha('Responsável', esc(respNome(c) || '—')) : ''}
        ${c.motivo ? linha('Motivo', esc(c.motivo)) : ''}
      </div>
      ${
        aberta
          ? `<div class="tm-campos">
        <label>Estimativa original<input data-tcampo="estimativa" value="${esc(c.estimativa || '')}" placeholder="ex.: 30m, 2h, 1d"></label>
        <div class="tm-resp"><span>Responsável no ${esc(ondeNome(t))}</span><b>${esc(respNome(c) || 'Sem responsável')}</b>
          <button data-tacao="tarefaResponsavel" title="Escolher quem fica com a tarefa (uma pessoa só)">${respNome(c) ? 'Trocar' : 'Escolher…'}</button></div></div>
      <div class="tm-acoes"><button class="aprovar" data-tacao="tarefaAprovar">Aprovar</button>
        <button class="reprovar" data-tacao="tarefaReprovar">Reprovar</button><button data-talterar>Pedir alteração</button></div>
      <div class="tm-alt" hidden><textarea placeholder="O que o Claude deve mudar nesta tarefa?"></textarea>
        <div class="tm-acoes"><button class="primario" data-tenviar>Enviar para o Claude</button><button data-tcancelar>Cancelar</button></div></div>`
          : ''
      }
      ${
        c.revisao
          ? `<div class="tm-rev"><b>↻ Alteração proposta</b> — ${esc(c.revisao.motivo)}
        ${c.revisao.comentario && !jira.ehDocumento(t) ? ` · <a href="${esc(c.revisao.comentario)}">comentário</a>` : ''}
        ${Object.entries(c.revisao.campos || {})
          .map(([k, v]) => `<div class="tm-l"><span>${esc(k)} (novo)</span><div>${esc(v)}</div></div>`)
          .join('')}
        ${c.tipo === 'qa' ? '<div class="tm-l"><span>Plano</span><div>testes.md atualizado (acima)</div></div>' : ''}
        <div class="tm-acoes"><button class="aprovar" data-tacao="revisaoAplicar">Aplicar no ${esc(ondeNome(t))}</button><button data-tacao="revisaoDescartar">Descartar</button></div></div>`
          : ''
      }
      ${(c.historico || []).length ? `<div class="tm-hist">${c.historico.map((h) => `<div><span>${esc(quando(h.em))}</span> ${esc(h.texto || h.evento)}</div>`).join('')}</div>` : ''}`;
  };
  const cab = (c) =>
    `<span class="tid">${esc(c.id)}</span><span class="tstatus ts-${esc(c.status)}">${STATUS_T[c.status] || esc(c.status)}</span>`;
  const modal = (
    c
  ) => `<div class="tmodal" data-tmodal="${esc(c.id)}" data-tstatus="${esc(c.status)}" hidden><div class="tm-caixa">
      <div class="tm-cab">${cab(c)}<button class="tm-x" data-tfechar title="Fechar (Esc)">✕</button></div>${corpo(c)}
    </div></div>`;
  // Grade das tarefas abertas (pendentes e em alteração): todas na mesma tela, para ler, aprovar, reprovar ou pedir alteração sem abrir uma a uma.
  const abertas = l.filter((c) => ['pendente', 'em_alteracao'].includes(c.status));
  const grade = abertas.length
    ? `<div class="tmodal tgrade" data-tgrade hidden><div class="tg-caixa">
      <div class="tm-cab"><b>Tarefas abertas</b><span class="tid">${abertas.length}</span><button class="tm-x" data-tfechar title="Fechar (Esc)">✕</button></div>
      <div class="tg-grade">${abertas
        .map(
          (c) => `<div class="tg-cel ts-${esc(c.status)} ${c.tipo === 'qa' ? 'tqa' : ''}" data-tgcard="${esc(c.id)}">
        <div class="tm-cab">${cab(c)}</div>${corpo(c)}</div>`
        )
        .join('')}</div>
    </div></div>`
    : '';
  return `<div class="tboard">${COLUNAS_T.map(([nome, sts]) => {
    const cs = l.filter((c) => sts.includes(c.status));
    const abrir =
      sts.includes('pendente') && abertas.length
        ? `<button class="tg-abrir" data-tgrade-abrir title="Ver todas as tarefas abertas numa grade (ler, aprovar, reprovar ou pedir alteração)">${IC.grade || '⊞'}</button>`
        : '';
    return `<div class="tcol"><div class="tcol-t"><span class="tcol-n">${nome}<span>${cs.length}</span></span>${abrir}</div>${cs.map(card).join('') || '<div class="tvazio">—</div>'}</div>`;
  }).join('')}</div>${grade}${l.map(modal).join('')}`;
}

module.exports = { telaTarefas };
