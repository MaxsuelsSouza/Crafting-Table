// @ts-check

// Módulo Refinamento: a spec SDD do ticket (passos 0 a 6), dirigida pela extensão. É a pasta raiz do ticket (~/.claude/tickets/<CHAVE>/,
// tickets.REFINAMENTO); a spec mora no repositório de specs (infra/ticket/spec.js).
// Registro do módulo (formato de modelo-modulo/modulo.js): tudo que os pontos comuns (lista, moldura, painel, conversas, situação, menu)
// precisam saber do Refinamento vem daqui. Sem require no topo: o menu, a situação e a lista carregam este arquivo cedo; a lógica é
// carregada na hora do uso.
//
// Estrutura da pasta:
//   refinamento.js     este registro
//   ganchos-painel.js  o que o painel comum pede ao Refinamento (dados das abas, conferência, observar a spec, cabeçalho)
//   estado.js          modo e papel em .ticket.json (refinamento.*) e a pill do card
//   locais.js          nomes e leitores do módulo; repassa infra/ticket/pasta-ticket.js e infra/ticket/spec.js
//   conversa.js        pedido da conversa aberta pelo ✦
//   hierarquia.js      papel do tipo de ticket (quebrar, desenvolver, executar)
//   pacote.js          monta o refinamento.md
//   orquestrador/      roda as etapas (claude -p), segue, confere, pausa (um arquivo por regra)
//   etapas/            index.js (lista das etapas e vagas) + 03-plano-tecnico/, 06-plano-testes.js e comentarios/
//   abas/              spec/, tarefas/, duvidas/ e analise.js
//   bin/               refinamento-gravar (o Claude grava a spec por ele)
//   testes/            teste-*.js (node extensao/janelas/refinamento/testes/teste-x.js)

//   ID, ROTULO, DICA  menu de módulos (componentes/menu-modulos.js)
//   VINCULADOS        caixa de vinculados (componentes/vinculados.js): seletor de etapa (colunas do board)
const ID = 'refinamento';
const ROTULO = 'Refinamento';
const DICA = 'Tickets em refinamento (spec SDD)';
const VINCULADOS = { titulo: 'Vinculados a você', seletor: 'etapa' };

// Abas do menu do ticket (painel/moldura.js). Spec é a aba central do módulo (ainda com id próprio: ver FAZER-QUANDO-DER.md).
const ABAS = [
  { id: 'docs', nome: 'Docs' },
  { id: 'spec', nome: 'Spec' },
  { id: 'ticket', nome: 'Ticket' },
  { id: 'analise', nome: 'Análise' },
  { id: 'tarefas', nome: 'Tarefas' },
  { id: 'decisoes', nome: 'Decisões' },
  { id: 'duvidas', nome: 'Dúvidas' }
];

// Modo refinamento ligado (card da lista e cabeçalho).
const emRefino = (t) => require('./estado').emRefino(t);
// Pill do card na lista (infra/ticket/situacao.js): o modo em .ticket.json.
const situacao = (t) => require('./estado').situacaoCard(t);
// Pedido da conversa aberta pelo ticket (modulos/conversas.js).
const pedidoConversa = (s, t) => require('./conversa').pedidoConversa(s, t);

// Corpo das abas próprias (painel.js corpoAba); undefined = a aba não é do Refinamento.
const corpoAba = (aba, t, d) => {
  if (aba === 'spec') return require('./abas/spec').corpoAba(t, d);
  if (aba === 'analise') return require('./abas/analise').corpoAba(d);
  if (aba === 'tarefas') return require('./abas/tarefas').telaTarefas(t, d.tarefas, d.impactos);
  if (aba === 'duvidas') return require('./abas/duvidas').corpo(d);
  return undefined;
};
// Dados que as abas próprias leem (entram no `d` do painel.js).
const dadosAba = (t, dir) => require('./ganchos-painel').dadosAba(t, dir);
// Antes de desenhar a aba (painel.js) e ao desenhar o ticket (o modo termina sozinho com todos os passos aprovados).
const antesDaAba = (aba, t) => require('./ganchos-painel').antesDaAba(aba, t);
const aoDesenhar = (t) => require('./ganchos-painel').aoDesenhar(t);
// Arquivos de fora da pasta do ticket que redesenham a tela quando mudam (a pasta da spec e a constituição).
const observar = (t, depois, obs) => require('./ganchos-painel').observar(t, depois, obs);

// Cabeçalho do ticket (moldura.js): ▶/⏸, pill do modo, faixa roxa e o contador das abas Dúvidas e Tarefas.
const botaoPlay = (dir, b, t) => require('./abas/spec').botaoRefino(t, b);
const pill = (t) => require('./ganchos-painel').pill(t);
const faixa = (t) => require('./ganchos-painel').faixa(t);
const contadorAba = (id, t) => require('./ganchos-painel').contadorAba(id, t);

// O orquestrador (servicos.orq do painel.js), ligado ao abrir o painel (vigia de comentários) e chamado no ⟳.
const orq = () => require('./orquestrador');
const iniciar = (servicos, ctx) => require('./orquestrador').iniciar(servicos, ctx);
const aoAtualizar = () => require('./orquestrador').vigiarComentarios();

// Cliques do módulo (data-acao), juntados pelo painel.js.
const acoes = (s) => ({
  ...require('./abas/analise').acoes(s),
  ...require('./abas/spec').acoes(s),
  ...require('./abas/duvidas').acoes(s),
  ...require('./etapas/comentarios').acoes(s),
  ...require('./abas/tarefas').acoes(s),
  vigiarAgora() {
    return require('./orquestrador').vigiarComentarios();
  } // ⟳ e testes: olha os comentários agora
});
// CSS e script da webview (moldura.js).
const CSS = () =>
  [
    require('./abas/spec').CSS,
    require('./abas/tarefas').CSS,
    require('./etapas/comentarios').CSS,
    require('./abas/duvidas').CSS,
    require('./abas/analise').CSS
  ].join('\n  ');
const script = () => `${require('./abas/spec').scriptPilha()}\n\n  ${require('./abas/tarefas').script()}`;

module.exports = {
  ID,
  ROTULO,
  DICA,
  VINCULADOS,
  ABAS,
  emRefino,
  situacao,
  pedidoConversa,
  corpoAba,
  dadosAba,
  antesDaAba,
  aoDesenhar,
  observar,
  botaoPlay,
  pill,
  faixa,
  contadorAba,
  orq,
  iniciar,
  aoAtualizar,
  acoes,
  CSS,
  script
};
