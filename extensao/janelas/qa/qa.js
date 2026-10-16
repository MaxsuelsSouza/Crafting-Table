// @ts-check

// Módulo QA: tickets para testar (pela label de QA). Pasta do ticket: ~/.claude/tickets/<CHAVE>/qa/ (tickets.js).
// Registro do módulo (formato de modelo-modulo/modulo.js): tudo que os pontos comuns (menu, lista, moldura, painel, rodapé, Evidências,
// conversas, configuração, situação) precisam saber do QA vem daqui. Sem require no topo: infra/ticket/tickets.js e o menu carregam este arquivo
// cedo; a lógica é carregada na hora do uso.
//
// Estrutura da pasta:
//   qa.js             este registro
//   motor.js          API do QA (o que o antigo qa.js exportava) para o bin, as ações e os testes; só encadeia
//   estado.js         .qa.json e a leitura/gravação de JSON
//   situacao.js       pill do card na lista
//   entrada.js        dossiê de entrada do QA e o briefing do dev
//   orquestrador/     ▶ Dar início (ordem das etapas), claude -p, pausa, resposta, zero skip, ⏸ (um arquivo por regra)
//   etapas/           index.js (lista das etapas e vagas) + uma pasta por etapa: 01-planejamento … 06-execucao, e 07-publicar.js
//   abas/             evidencias/ (bloco do QA na seção Evidências), roteiro.js (aba Roteiro: roteiros + massa), conhecimentos.js (aba Conhecimentos),
//                     acoes/ (cliques), botao-play.js, rodape.js
//   conhecimentos/    o que a IA já descobriu (vale para todos os tickets): guardar, buscar, índice para o prompt
//   bin/              qa-state (o Claude grava por ele)
//   testes/           teste-*.js (node extensao/janelas/qa/testes/teste-x.js)

//   ID, ROTULO, DICA  menu de módulos (componentes/menu-modulos.js)
//   VINCULADOS        caixa de vinculados (componentes/vinculados.js): os tickets com a label de QA (seletor de label), status de etapasQA
//   ETAPA             título da conversa (conversas.js); ETAPA_PEDIDO: o mesmo módulo no pedido da conversa
const ID = 'qa';
const ROTULO = 'QA';
const DICA = 'Tickets para testar (pela label de QA)';
const VINCULADOS = { titulo: 'Com a label', seletor: 'label', variavel: 'etapasQA' };
const ETAPA = 'QA';
const ETAPA_PEDIDO = 'QA (testes)';

// Abas do menu do ticket (painel/moldura.js). Evidências é a seção global (modulos/evidencias.js), onde o QA mostra o bloco dele (evidencias abaixo).
const ABAS = [
  { id: 'docs', nome: 'Docs' },
  { secao: 'claudeAbas.evidencias', nome: 'Evidências' },
  { id: 'ticket', nome: 'Ticket' },
  { id: 'decisoes', nome: 'Decisões' },
  { id: 'roteiro', nome: 'Roteiro' },
  { id: 'conhecimentos', nome: 'Conhecimentos' }
];

// Variável do provedor que o módulo exige além das comuns (configuracao.js, pendências da caixa de vinculados).
const EXIGE = ['etapasQA'];

// Pill do card na lista (infra/ticket/situacao.js).
const situacao = (t) => require('./situacao').situacao(t);
// Corpo das abas próprias (painel.js corpoAba); undefined = a aba não é do QA.
const corpoAba = (aba, t, d, dir) =>
  aba === 'roteiro'
    ? require('./abas/roteiro').roteiroHtml(
        dir,
        require('vscode').workspace.getConfiguration('craftingTable').get('qaHoraRefresh') || '06:00'
      )
    : aba === 'conhecimentos'
      ? require('./abas/conhecimentos').conhecimentosHtml()
      : undefined;
// ▶/⏸ no cabeçalho do ticket (moldura.js).
const botaoPlay = (dir, b) => require('./abas/botao-play').botaoPlay(dir, b);
// Cliques do módulo (data-acao/data-painel), juntados pelo painel.js.
const acoes = (s) => require('./abas/acoes').acoes(s);
// Caixa do ambiente no rodapé, depois de Comandos (componentes/rodape.js).
const rodape = (dir, acao) => require('./abas/rodape').caixaAmbiente(dir, acao);
// Bloco do QA na seção Evidências (modulos/evidencias.js): arquivos da pasta qa/ que redesenham, o corpo e as evidências por cenário.
const evidencias = {
  VIGIAR: ['.qa.json', '.planejamento.json', '.cenarios.json', '.ambiente.json'],
  corpo: (dir, uri) => require('./abas/evidencias').html(dir, uri),
  arquivos: (dir) => {
    const qa = require('./motor');
    return qa.cenarios(dir).cenarios.flatMap((c) => (c.execucoes || []).flatMap((x) => qa.arquivosDe(dir, x)));
  }
};

module.exports = {
  ID,
  ROTULO,
  DICA,
  VINCULADOS,
  ETAPA,
  ETAPA_PEDIDO,
  ABAS,
  EXIGE,
  situacao,
  corpoAba,
  botaoPlay,
  acoes,
  rodape,
  evidencias
};
