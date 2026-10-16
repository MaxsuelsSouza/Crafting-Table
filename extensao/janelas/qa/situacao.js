// @ts-check
// Pill do card do QA na lista (infra/ticket/situacao.js chama pelo registro, qa.situacao): fase do planejamento e a execução, lidas do .qa.json.
// Devolve { texto, cor, dica } ou null (QA ainda não iniciado para o ticket).
const fs = require('fs');
const path = require('path');
const tickets = require('../../infra/ticket/tickets');

const lerJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const QA = {
  procurando: ['Procurando plano', 'ia'],
  criando: ['Criando plano', 'ia'],
  alterando: ['Ajustando plano', 'ia'],
  erro: ['Erro', 'pausada'],
  sem_plano: ['Sem plano', 'novo'],
  plano_encontrado: ['Plano aguardando aprovação', 'andando'],
  plano_aprovado: ['Plano aprovado', 'ok']
};

/** @param {any} t ticket local */
function situacao(t) {
  const dir = (l) => tickets.pasta(t.chave, l);
  const q = lerJson(path.join(dir('qa'), '.qa.json'));
  if (!q) return null;
  if (q.execucao === 'rodando') return { texto: 'Executando cenários', cor: 'ia', dica: '' };
  const [texto, cor] = QA[q.fase] || [];
  return texto ? { texto, cor, dica: '' } : null;
}

module.exports = { situacao };
