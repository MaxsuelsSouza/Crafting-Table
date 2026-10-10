// @ts-check
// Pastas do ticket (infra usada por todos os módulos via servicos do painel.js).
const fs = require('fs');
const path = require('path');
const sessao = require('./sessao');
const tickets = require('./tickets');
const { SEM_TICKET } = require('./componentes/card-ticket');
const pasta = (id) => tickets.pasta(id);
const pastaDe = (id) => (id === SEM_TICKET ? (sessao.conversaAtual() ? sessao.pasta(sessao.conversaAtual()) : null) : pasta(id));
// Pasta da aba em que o ticket está aberto (Refinamento = raiz; Implementações e QA = impl/ e qa/, tickets.js): documentos,
// notas, decisões e notificações das conversas daquela aba. Refinamento (spec, tarefas, dúvidas, impactos) segue na raiz.
// id pode vir como CHAVE/aba (nota salva depois de trocar de aba não cai na aba errada).
const pastaAba = (id) => {
  if (!id || id === SEM_TICKET) return pastaDe(SEM_TICKET);
  const [chave, lista] = id.split('/');
  return lista ? tickets.pasta(chave, lista) : sessao.pasta(chave);
};
const naRaiz = () => sessao.focoLista() === tickets.REFINAMENTO; // ticket aberto no módulo Refinamento
const idAba = (id) => (id === SEM_TICKET || naRaiz() ? id : `${id}/${sessao.focoLista()}`);
const gravar = (id, nome, dado) => {
  const dir = pastaDe(id);
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, nome), typeof dado === 'string' ? dado : JSON.stringify(dado, null, 2));
};

module.exports = { pasta, pastaDe, pastaAba, naRaiz, idAba, gravar };
