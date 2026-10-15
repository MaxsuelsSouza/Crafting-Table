// @ts-check
const { esc } = require('../infra/texto');
const { IC } = require('./icones');

// Componente "Botões do ticket": os botões de ícone do cabeçalho do ticket aberto (moldura.js), num lugar só:
// ← voltar · ▶/⏸ play · ✦ agente · ⚡ raio · 🎫 ticket · 🗑 excluir · ⟳ atualizar.
// Cada botão tem uma flag (visiveis) e dá para acrescentar outros (extras). O desenho e as regras são os de antes (moldura.js).
// Para usar: CSS do cabeçalho (.ct-ico, em moldura.js) e botoes(ctx, grupo, opcoes) no corpo. Sem script: cliques por data-acao
// (na página do painel) ou data-painel/data-secao (na moldura de outra seção), o que ctx.b e ctx.dentro decidem.
//   ctx: { b(cmd) → atributo do clique, dentro, principal, semTicket, ehDocumento, nomeFerramenta, podeInstruir, play (HTML do ▶/⏸ do módulo),
//          tituloAtualizar }
//   grupo: 'esquerda' (voltar) · 'direita' (play, agente, raio, ticket, excluir) · 'pills' (atualizar)
//   opcoes.visiveis: { voltar?, play?, claude?, raio?, jira?, excluir?, atualizar? } = false esconde (padrão: todos aparecem, respeitando as regras abaixo)
//   opcoes.extras: [{ grupo, id, icone (HTML), titulo, acao, classe?, desligado?, quando?(ctx) }] = botões a mais, depois dos padrão do grupo

const GRUPOS = { esquerda: ['voltar'], direita: ['play', 'claude', 'raio', 'jira', 'excluir'], pills: ['atualizar'] };

// Cada botão: quando(ctx) é a regra de aparecer (sem ticket, ticket-documento…); html(ctx) é o desenho.
const PADRAO = {
  voltar: {
    quando: () => true,
    html: (c) => `<button class="ct-ico" ${c.dentro ? 'data-acao="voltar"' : `data-secao="${c.principal}" data-cmd="voltar"`} title="Voltar para a lista de tickets">${IC.voltar}</button>`
  },
  // ▶/⏸ é do módulo (aoVivo.controle ou botaoRefino): chega pronto em ctx.play.
  play: { quando: (c) => !!c.play, html: (c) => c.play },
  claude: {
    quando: () => true,
    html: (c) => `<button class="ct-ico" ${c.b('claude')} title="Abrir a conversa do Claude${c.semTicket ? '' : ' deste ticket'}">${IC.claude}</button>`
  },
  raio: {
    quando: (c) => !c.semTicket,
    html: (c) => `<button class="ct-ico" ${c.podeInstruir ? c.b('raio') : 'disabled'} title="${c.podeInstruir ? 'Instrução direta: manda uma mensagem ao Claude que está no Ao vivo' : 'Nenhum Claude em segundo plano neste ticket para receber instrução'}">${IC.raio}</button>`
  },
  jira: {
    quando: (c) => !c.semTicket && !c.ehDocumento,
    html: (c) => `<button class="ct-ico" ${c.b('jira')} title="Ver o ticket no ${esc(c.nomeFerramenta)}">${IC.jira}</button>`
  },
  excluir: {
    quando: (c) => !c.semTicket,
    html: (c) => `<button class="ct-ico perigo" ${c.b('excluirTicket')} title="Excluir o ticket (ou o ticket e os registros dele neste módulo)">${IC.lixo}</button>`
  },
  atualizar: {
    quando: (c) => !c.semTicket,
    html: (c) => `<button class="ct-ico" ${c.b('atualizar')} title="${esc(c.tituloAtualizar)}">${IC.atualizar}</button>`
  }
};

const extra = (e, c) => `<button class="ct-ico${e.classe ? ` ${e.classe}` : ''}" ${e.desligado ? 'disabled' : c.b(e.acao)} title="${esc(e.titulo)}">${e.icone}</button>`;

/** @param {any} ctx @param {'esquerda'|'direita'|'pills'} grupo @param {{ visiveis?: Record<string, boolean>, extras?: any[] }} [o] */
const botoes = (ctx, grupo, { visiveis = {}, extras = [] } = {}) => [
  ...GRUPOS[grupo].filter((id) => visiveis[id] !== false && PADRAO[id].quando(ctx)).map((id) => PADRAO[id].html(ctx)),
  ...extras.filter((e) => e.grupo === grupo && (!e.quando || e.quando(ctx))).map((e) => extra(e, ctx))
].join('\n      ');

module.exports = { botoes, GRUPOS, PADRAO };
