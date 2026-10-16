// @ts-check

// Módulo Incidentes: tickets do tipo de incidente abertos do board das configurações (de qualquer responsável). Pasta do ticket: ~/.claude/tickets/<CHAVE>/incidentes/ (tickets.js).
// Registro do módulo (formato de modelo-modulo/modulo.js): tudo que os pontos comuns (lista, moldura, painel, conversas, configuração) precisam saber
// do Incidente vem daqui. Sem require no topo: infra/tickets.js e o menu carregam este arquivo cedo; a lógica é carregada na hora do uso.
//
// Estrutura da pasta:
//   incidentes.js     este registro
//   CONTRATO.md       artefatos do Mergulho (quem grava o quê)
//   orquestrador/     roda as etapas, pausa, aprova e retoma (comum a todas; um arquivo por regra)
//   estado.js         .mergulho.json e a situação da tela
//   prompt.js         prompt das etapas 1 a 4, regras das 5 e 6, bins e ferramentas
//   entrada.js        entrada do incidente (entrada.json/md, confiança de cada fonte)
//   etapas/           index.js (lista das etapas e vagas) + um arquivo por etapa: 01-triagem … 06-evidencias
//                     (a 5 é a pasta 05-reproducao/: index.js, dependencias.js, subetapas/, regras/)
//   abas/             mergulho.js (aba Mergulho) e evidencias.js (aba Evidências)
//   bin/              mergulho-gravar e mergulho-fluxo (o Claude grava por eles)
//   testes/           teste-*.js (node extensao/incidentes/testes/teste-x.js)

//   ID, ROTULO, DICA  menu de módulos (componentes/menu-modulos.js)
//   VINCULADOS        caixa de vinculados (componentes/vinculados.js): sem filtro de status, todo incidente não concluído
//   ETAPA             texto do pedido ao Claude e do título da conversa (conversas.js)
const ID = 'incidentes';
const ROTULO = 'Incidentes';
const DICA = 'Incidentes abertos';
const VINCULADOS = { titulo: 'Vinculados a você' };
const ETAPA = 'Incidente';

// Abas do menu do ticket (painel/moldura.js). Mergulho é a aba central do módulo (ainda com id próprio: ver FAZER-QUANDO-DER.md).
const ABAS = [
  { id: 'docs', nome: 'Docs' },
  { id: 'mergulho', nome: 'Mergulho' },
  { id: 'evidenciasInc', nome: 'Evidências' },
  { id: 'ticket', nome: 'Ticket' },
  { id: 'decisoes', nome: 'Decisões' }
];
// Abas que mostram arquivos da pasta da aba (prints, vídeos): a webview precisa liberar a pasta (painel.js, localResourceRoots).
const ABAS_MIDIA = ['mergulho', 'evidenciasInc'];

// Variável do provedor que o módulo exige além das comuns (configuracao.js, pendências da caixa de vinculados).
const EXIGE = ['tipoIncidente'];
// Artefatos que a conversa aberta pelo ticket lê antes de começar (conversas.js).
const ARQUIVOS_CONVERSA = {
  rotulo: 'Mergulho do incidente',
  nomes: [
    'entrada.md',
    '1-triagem.md',
    '2-artefatos.md',
    '3-dados-logs.md',
    '4-diagnostico.md',
    'massa-real.sql',
    'massa-teste.sql',
    'fluxo.json',
    'reproducao.json',
    'resumo.md'
  ]
};
// Pill do card na lista (infra/situacao.js): estado lido de .mergulho.json.
const SITUACAO = { arquivo: '.mergulho.json', rotulo: 'Investigando' };

// Busca dos vinculados (painel/lista.js): só os boards das configurações e só os tipos de incidente (variável tipoIncidente).
const filtroBusca = async ({ jira, secrets, site, projeto, boards, variaveis }) => ({
  boardId: (await jira.boardsPorNome(secrets, site, projeto, boards)).map((b) => b.id),
  tipos: String(variaveis.ler('tipoIncidente'))
});

// Corpo das abas próprias (painel.js corpoAba); undefined = a aba não é do Incidente.
const corpoAba = (aba, t, d, dir) => {
  if (aba === 'mergulho') return require('./abas/mergulho').corpo(t, d, dir);
  if (aba === 'evidenciasInc') return require('./abas/evidencias').corpo(t, d, dir);
  return undefined;
};
// ▶/⏸ no cabeçalho do ticket (moldura.js).
const botaoPlay = (dir, b) => require('./abas/mergulho').botaoPlay(dir, b);
// Cliques do módulo (data-acao), juntados pelo painel.js.
const acoes = (s) => ({ ...require('./abas/mergulho').acoes(s), ...require('./abas/evidencias').acoes(s) });
// Script da webview (moldura.js).
const script = () => `${require('./abas/mergulho').script()}\n  ${require('./abas/evidencias').script()}`;

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
  filtroBusca,
  corpoAba,
  botaoPlay,
  acoes,
  script
};
