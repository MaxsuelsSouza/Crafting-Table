// @ts-check

// Módulo Implementações: tickets em implementação. Pasta do ticket: ~/.claude/tickets/<CHAVE>/impl/ (tickets.js).
// Tudo que é só dele mora aqui; o resto (lista, abas, cards) é comum aos módulos e vem de componentes/.
//   ID, ROTULO, DICA  menu de módulos (componentes/menu-modulos.js)
//   VINCULADOS        caixa de vinculados (componentes/vinculados.js): só entram Buffer, Não iniciado e Em andamento
//   ETAPA             texto do pedido ao Claude e do título da conversa (painel.js)
const ID = 'impl';
const ROTULO = 'Implementações';
const DICA = 'Tickets em implementação';
const VINCULADOS = { titulo: 'Vinculados a você', status: ['Buffer', 'Não iniciado', 'Em andamento|In progress'] };
const ETAPA = 'Implementação';

module.exports = { ID, ROTULO, DICA, VINCULADOS, ETAPA };
