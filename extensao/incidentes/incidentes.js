// @ts-check

// Módulo Incidentes: tickets do tipo Incident abertos do board das configurações (de qualquer responsável). Pasta do ticket: ~/.claude/tickets/<CHAVE>/incidentes/ (tickets.js).
// Tudo que é só dele mora aqui; o resto (lista, abas, cards) é comum aos módulos e vem de componentes/.
//   ID, ROTULO, DICA  menu de módulos (componentes/menu-modulos.js)
//   VINCULADOS        caixa de vinculados (componentes/vinculados.js): sem filtro de status, todo incidente não concluído
//   TIPOS             tipos do Jira (JQL) que entram na caixa; nome exato no Jira (nome inexistente dá erro 400 na busca)
//   ETAPA             texto do pedido ao Claude e do título da conversa (conversas.js)
const ID = 'incidentes';
const ROTULO = 'Incidentes';
const DICA = 'Incidentes abertos';
const VINCULADOS = { titulo: 'Vinculados a você' };
const TIPOS = 'Incident';
const ETAPA = 'Incidente';

module.exports = { ID, ROTULO, DICA, VINCULADOS, TIPOS, ETAPA };
