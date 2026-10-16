// @ts-check
// Rótulos e constantes das tarefas usados na tela e nas ações.
const jira = require('../../../infra/ticket').jira;

// Onde a subtarefa mora: no documento (ticket-documento, tudo local) ou na ferramenta de gestão.
const ondeNome = (t) => (jira.ehDocumento(t) ? 'documento' : jira.nome);
// Ticket que se quebra (Épico, Feature…): o card vira um item do tipo abaixo (refinamento.filho), não uma subtarefa.
const filhoDe = (t) => {
  const r = require('../../../infra/tickets').ler(t.chave)?.refinamento || {};
  return r.papel === 'quebrar' ? r.filho || '' : '';
};
// Responsável da tarefa: UMA pessoa ({ id, nome }, escolhida na lista de pessoas do ticket). `vinculado` (boolean) é o formato antigo: "eu".
const respNome = (c) => c.responsavel?.nome || (c.vinculado ? 'você' : '');
const siglas = (nome) =>
  (
    String(nome)
      .split(/\s+/)
      .filter(Boolean)
      .map((x) => x[0])
      .join('')
      .slice(0, 2) || '?'
  ).toUpperCase();
const linkSub = (t, k) => {
  try {
    return jira.linkDo(t.site, k) || '';
  } catch {
    return '';
  }
};
const STATUS_T = {
  pendente: 'Pendente',
  em_alteracao: 'Claude alterando',
  aprovada: 'Aprovada',
  reprovada: 'Reprovada'
};
const COLUNAS_T = [
  ['Pendentes', ['pendente', 'em_alteracao']],
  ['Aprovadas', ['aprovada']],
  ['Reprovadas', ['reprovada']]
];

module.exports = { ondeNome, filhoDe, respNome, siglas, linkSub, STATUS_T, COLUNAS_T };
