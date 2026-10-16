// @ts-check

// Módulo Implementações: tickets em implementação. Pasta do ticket: ~/.claude/tickets/<CHAVE>/impl/ (tickets.js).
// Registro do módulo (formato de modelo-modulo/modulo.js): tudo que os pontos comuns (lista, moldura, painel, conversas, configuração) precisam saber
// da Implementação vem daqui. Sem require no topo: infra/ticket/tickets.js e o menu carregam este arquivo cedo; a lógica é carregada na hora do uso.
//
// Estrutura da pasta:
//   implementacoes.js  este registro
//   esteira.js         só reexporta a API antiga da esteira (testes e _teste)
//   estado.js          .esteira.json, situação da tela, pausa e os textos das opções
//   dependencias.js    VS Code, git, comandos e provedor (os testes trocam por _teste.deps)
//   prompts.js         cabeçalho, regras comuns e ajuste dos prompts das etapas com IA; o bin implementacao-gravar
//   orquestrador/      roda as etapas, pausa, aprova e retoma (comum a todas; um arquivo por regra)
//   etapas/            index.js (lista das etapas, artefatos e vaga) + 01-dossie/ (com a Reprodução do bug) … 07-resumo.js
//                      (a 5 é a pasta 05-implementacao/: prompt.js e regras/)
//   abas/              esteira.js (aba Esteira, ▶/⏸, script), dossie.js, reproducao.js, acoes.js, css.js
//   bin/               implementacao-gravar e reproducao-fluxo (o Claude grava por eles)
//   testes/            teste-*.js (node extensao/janelas/implementacoes/testes/teste-x.js)
// O dossiê do ticket (comum à Implementação e ao QA) mora em infra/dossie/.

//   ID, ROTULO, DICA  menu de módulos (componentes/menu-modulos.js)
//   VINCULADOS        caixa de vinculados (componentes/vinculados.js): os status vêm da variável etapasImplementacao (infra/provedores/variaveis.js)
//   ETAPA             texto do pedido ao Claude e do título da conversa (conversas.js)
const ID = 'impl';
const ROTULO = 'Implementações';
const DICA = 'Tickets em implementação';
const VINCULADOS = { titulo: 'Vinculados a você', variavel: 'etapasImplementacao' }; // status: variável do provedor, resolvida em painel/lista.js
const ETAPA = 'Implementação';

// Abas do menu do ticket (painel/moldura.js). Esteira é a aba central do módulo (ainda com id próprio: ver FAZER-QUANDO-DER.md).
const ABAS = [
  { id: 'docs', nome: 'Docs' },
  { id: 'esteira', nome: 'Esteira' },
  { id: 'dossie', nome: 'Dossiê' },
  { id: 'reproducao', nome: 'Reprodução' },
  { id: 'ticket', nome: 'Ticket' },
  { id: 'decisoes', nome: 'Decisões' }
];
// Abas que mostram arquivos da pasta da aba (evidências da Reprodução): a webview precisa liberar a pasta (painel.js, localResourceRoots).
const ABAS_MIDIA = ['reproducao'];

// Variável do provedor que o módulo exige além das comuns (configuracao.js, pendências da caixa de vinculados).
const EXIGE = ['etapasImplementacao'];
// Artefatos da esteira que a conversa aberta pelo ticket lê antes de começar (conversas.js), para começar de onde a esteira parou.
const ARQUIVOS_CONVERSA = {
  rotulo: 'Esteira de implementação',
  nomes: [
    'dossie.md',
    '.contexto-ticket.md',
    '.briefing.md',
    'entendimento.md',
    'varredura.md',
    'plano-mudanca.md',
    'implementacao.log.md',
    'verificacao.json'
  ]
};
// Pill do card na lista (infra/ticket/situacao.js): estado lido de .esteira.json.
const SITUACAO = { arquivo: '.esteira.json', rotulo: 'Implementando' };

// Corpo das abas próprias (painel.js corpoAba); undefined = a aba não é da Implementação.
const corpoAba = (aba, t, d, dir) => {
  if (aba === 'esteira') return require('./abas/esteira').corpo(t, d, dir);
  if (aba === 'dossie') return require('./abas/dossie').corpoDossie(t, d, dir);
  if (aba === 'reproducao') return require('./abas/reproducao').corpo(t, d, dir);
  return undefined;
};
// ▶/⏸ no cabeçalho do ticket (moldura.js).
const botaoPlay = (dir, b) => require('./abas/esteira').botaoPlay(dir, b);
// Cliques do módulo (data-acao), juntados pelo painel.js.
const acoes = (s) => require('./abas/acoes').acoes(s);
// Script da webview (moldura.js).
const script = () => require('./abas/esteira').script();

module.exports = {
  ID,
  ROTULO,
  DICA,
  VINCULADOS,
  ETAPA,
  ABAS,
  ABAS_MIDIA,
  EXIGE,
  ARQUIVOS_CONVERSA,
  SITUACAO,
  corpoAba,
  botaoPlay,
  acoes,
  script
};
