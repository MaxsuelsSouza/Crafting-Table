// @ts-check
// Cartão "Agora" no topo da aba Spec, com a pilha de perguntas do Claude.
const path = require('path');
const { esc } = require('../../../infra/texto');
const { IC } = require('../../../componentes/icones');
const { arquivoPasso, duvidasDe } = require('../../locais');
const { pasta, nomeProvedor } = require('./comum');

// Cartão "Agora" no topo da aba Spec: o que está acontecendo e a sua única ação, com o botão certo.
// Cards que ainda esperam decisão para o passo poder ser aprovado: dev (tNN) no passo 4, o [QA] no passo 6.
const semDecisaoDo = (n, l) =>
  l.filter((c) => (n === 6 ? c.tipo === 'qa' : c.tipo !== 'qa') && ['pendente', 'em_alteracao'].includes(c.status));

function cartaoAgora(t, est, rodandoAgora, tarefas = [], impactos = []) {
  const modo = t.refinamento?.estado;
  const passo = est && est.proximoPasso <= 6 ? est.passos[est.proximoPasso] : null;
  const abertas = est ? est.perguntas.filter((q) => q.status === 'aberta') : [];
  const duvidasAbertas = duvidasDe(pasta(t.id)).filter((x) => !x.resposta).length;
  let titulo,
    texto = '',
    acoes = '';
  if (rodandoAgora)
    [titulo, texto] = [
      `Claude trabalhando${passo ? ` · passo ${passo.n} · ${passo.titulo}` : ''}`,
      'Acompanhe abaixo. ⏸ no topo pausa depois desta etapa.'
    ];
  else if (!est) [titulo, texto] = ['Spec não iniciada', 'Clique em ▶ no topo para o Claude criar a spec.'];
  else if (abertas.length) {
    // Perguntas em pilha: um card por vez, as outras como bordas atrás. ‹ › passa sem responder; ▦ mostra todas em grade
    // (a navegação é só na página: script "Pilha de perguntas" em pagina()). Respondeu, o card sai e a pilha anda.
    const resto = Math.min(abertas.length - 1, 2);
    // Comentário do Jira que a triagem achou que responde a pergunta: só sugere, quem responde é você.
    const sugestaoDe = (id) => {
      const i = impactos.find((x) => x.pergunta?.id === id);
      return i
        ? `<div class="pctx">💬 Comentário de <b>${esc(i.autor)}</b> parece responder: ${esc(i.pergunta.motivo)} <a href="${esc(i.link)}">ver comentário</a></div>`
        : '';
    };
    const card = (q, i) => `<div class="pcard" data-pq="${i}" data-qid="${esc(q.id)}" ${i ? 'hidden' : ''}>
      <div class="pcab"><b>${esc(q.id)}</b>${q.passo !== undefined ? `<span>passo ${esc(q.passo)}</span>` : ''}</div>
      <div class="ptexto">${esc(q.pergunta)}</div>
      ${q.contexto ? `<div class="pctx">${esc(q.contexto)}</div>` : ''}
      ${sugestaoDe(q.id)}
      <div class="popcoes">${(q.opcoes || []).map((o, k) => `<button data-acao="responder" data-id="${esc(q.id)}" data-op="${k}">${esc(o)}</button>`).join('')}</div>
      <div class="prod"><button data-acao="responder" data-id="${esc(q.id)}" data-op="outra">Outra resposta…</button>
        <button class="duv" data-acao="responder" data-id="${esc(q.id)}" data-op="duvida">Tirar dúvida</button></div>
    </div>`;
    return `<div class="pilha-t"><span>Perguntas do Claude</span>${
      abertas.length > 1
        ? `<span class="pnav">
      <button data-pilha="ant" title="Pergunta anterior">‹</button><span id="pPos">1 de ${abertas.length}</span>
      <button data-pilha="prox" title="Próxima pergunta (sem responder esta)">›</button>
      <span class="ptam" hidden><button data-pilha="menor" title="Cards menores (mais por linha)">−</button><button data-pilha="maior" title="Cards maiores (menos por linha)">+</button></span>
      <button data-pilha="grade" title="Ver todas as perguntas">${IC.grade}</button></span>`
        : '<span>última</span>'
    }</div>
    <div class="pilha atras-${resto}" id="pilha">${abertas.map(card).join('')}</div>`;
  } else if (
    passo?.status === 'aguardando_revisao' &&
    [4, 6].includes(passo.n) &&
    semDecisaoDo(passo.n, tarefas).length
  ) {
    const n = semDecisaoDo(passo.n, tarefas).length;
    [titulo, texto, acoes] =
      passo.n === 4
        ? [
            `Revise as tarefas · ${n} sem decisão`,
            `Aprove (vira subtarefa no ${esc(nomeProvedor(t))}), reprove ou peça alteração em cada card. Depois aprove o passo 4 aqui.`,
            '<button class="primario" data-acao="aba" data-id="tarefas">Abrir Tarefas</button>'
          ]
        : [
            'Revise o plano de testes',
            `O card [QA] está na aba Tarefas: aprove (cria a subtarefa [QA] no ${esc(nomeProvedor(t))} com o plano), reprove ou peça alteração. Depois aprove o passo 6 aqui.`,
            '<button class="primario" data-acao="aba" data-id="tarefas">Abrir Tarefas</button>'
          ];
  } else if (passo?.status === 'aguardando_revisao')
    [titulo, texto] = [
      `Revise o passo ${passo.n} · ${passo.titulo}`,
      `Abra <b>${esc(path.basename(arquivoPasso(t, passo.n)))}</b> no cartão do passo, leia e clique em <b>Aprovar</b> ou <b>Pedir ajuste</b>.`
    ];
  else if (!passo)
    [titulo, texto, acoes] = [
      'Spec concluída',
      'Todos os passos aprovados. O <b>refinamento.md</b> reúne spec, plano, tarefas, testes, decisões e respostas para quem for implementar.',
      '<button class="primario" data-acao="refinamentoAbrir">Abrir refinamento.md</button>'
    ];
  else if (modo === 'aguardando_inicio')
    [titulo, texto, acoes] = [
      'Spec criada',
      `Próximo: passo ${passo.n} · ${passo.titulo}.`,
      '<button class="primario" data-acao="darInicio">Dar início</button>'
    ];
  else if (modo === 'pausado')
    [titulo, texto, acoes] = [
      'Refinamento pausado',
      `Para em: passo ${passo.n} · ${passo.titulo}.`,
      '<button class="primario" data-acao="retomar">▶ Retomar</button>'
    ];
  else if (duvidasAbertas)
    [titulo, texto, acoes] = [
      `Passo ${passo.n} · ${passo.titulo} bloqueado`,
      `Há ${duvidasAbertas} dúvida(s) em aberto. A spec só avança quando todas forem respondidas.`,
      '<button class="primario" data-acao="aba" data-id="duvidas">Ver dúvidas</button>'
    ];
  else
    [titulo, texto, acoes] = [
      `Pronto para o passo ${passo.n} · ${passo.titulo}`,
      'O Claude não está rodando agora.',
      '<button class="primario" data-acao="retomar">Continuar</button>'
    ];
  return `<div class="agora ${rodandoAgora ? 'trabalhando' : ''}"><div class="atitulo">${rodandoAgora ? '<span class="vivo-bola"></span>' : ''}${titulo}</div>
    ${texto ? `<div class="atexto">${texto}</div>` : ''}${acoes ? `<div class="aacoes">${acoes}</div>` : ''}</div>`;
}

module.exports = { semDecisaoDo, cartaoAgora };
