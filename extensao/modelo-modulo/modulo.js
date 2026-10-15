// @ts-check
// MODELO DE MÓDULO. Copie esta pasta para extensao/<seu-modulo>/, renomeie modulo.js para <seu-modulo>.js,
// troque MODELO/modelo pelo nome do módulo e siga o LEIA-ME.md (registro nos 6 pontos comuns).
// Esta pasta não é carregada pela extensão: é só o molde.
//
// O que todo módulo tem por padrão (CLAUDE.md, "Padrão de módulo"):
//   Lista:   menu de módulos · pesquisa · ↑↓ · ＋ Ticket (com o contador de tickets acima) · cards · card "Sem ticket" · caixa Vinculados
//            (a caixa só existe com a ferramenta de gestão cadastrada: lista.js já cuida)
//   Ticket:  ← título … [✦ conversa fixa] [⚡ raio] [🎫 ticket] [🗑 excluir] · pill de status · ⟳ atualizar · menu Docs · Central · Ticket · Decisões | Conversas
//   Rodapé:  🔔 Notificações e ▶ Comandos (componentes/rodape.js, igual em todos)
// Botões do cabeçalho: componentes/botoes-ticket.js (flag por botão e botões extras).
// Tudo isso vem de componentes/ e da moldura: o módulo só declara ID, abas e o que é dele.
const aoVivo = require('../componentes/ao-vivo');
const abaCentral = require('../componentes/aba-central');

//   ID, ROTULO, DICA  menu de módulos (componentes/menu-modulos.js)
//   VINCULADOS        caixa de vinculados (componentes/vinculados.js): titulo, seletor ('etapa' | 'label'), variavel (status do provedor)
//   ETAPA             texto do pedido ao Claude e do título da conversa (conversas.js)
const ID = 'modelo';
const ROTULO = 'Modelo';
const DICA = 'Tickets do módulo Modelo';
const VINCULADOS = { titulo: 'Vinculados a você' };
const ETAPA = 'Modelo';

// Abas do menu do ticket (ABAS em painel/moldura.js). Conversas entra sozinha, depois do separador.
// Padrão: Docs · Central · Ticket · Decisões. Abas extras do módulo entram entre Central e Ticket.
// "Central" é o nome genérico da aba que todo módulo tem (a do Ao vivo): o id é 'central', o nome mostrado pode ser outro (Esteira, Mergulho…).
const CENTRAL = { id: 'central', nome: 'Central' };
const ABAS = [{ id: 'docs', nome: 'Docs' }, CENTRAL, { id: 'ticket', nome: 'Ticket' }, { id: 'decisoes', nome: 'Decisões' }];

// Estado da execução do módulo (o que rodar/pausar). Troque pela situação real do módulo.
const situacao = (_dir) => ({ rodando: false });
const controlesDe = (_sit) => ({ conversa: true, pausar: 'modeloPausar', retomar: 'modeloRetomar' });

// Aba Central: só o Ao vivo (abaCentral.corpo). Acrescente aqui o que for do módulo, sem tirar a caixa.
const corpoCentral = (_t, _d, dir) => abaCentral.corpo(dir, situacao(dir).rodando, ID, controlesDe(situacao(dir)));

// ▶/⏸ no cabeçalho do ticket. Se o módulo não roda nada, devolva ''.
const botaoPlay = (dir, b) => aoVivo.controle(situacao(dir).rodando, controlesDe(situacao(dir)), b);

// Cliques do módulo (data-acao). s = serviços do painel (ticketAberto, pastaAba, render…).
const acoes = (_s) => ({
  modeloPausar() {},
  modeloRetomar() {}
});

module.exports = { ID, ROTULO, DICA, VINCULADOS, ETAPA, ABAS, corpoCentral, botaoPlay, acoes };
