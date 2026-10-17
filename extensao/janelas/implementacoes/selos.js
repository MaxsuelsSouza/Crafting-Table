// @ts-check
// Selo do card na lista de Implementações (gancho selos(t) do registro, painel/lista.js → componentes/card-ticket.js): "5 subtarefas" e, com
// os grupos rodando, "2/5 subtarefas" (concluídas antes + as dos grupos concluídos). Fora (QA, cancelada) não conta. O número vem do
// .ticket.json (gravado ao atualizar o ticket do Jira), então ticket nunca aberto não tem selo. E o "Score N/5" do teste na aplicação (teste.json).
const fs = require('fs');
const path = require('path');
const pill = require('../../componentes/pill');
const tickets = require('../../infra/ticket/tickets');
const { situacao: situacaoSub } = require('./etapas/00-subtarefas/regras/filtro');
const { lerSubs, dirGrupo } = require('./etapas/00-subtarefas/arquivos');
const ESTADO = '.esteira.json'; // estado.js (sem carregar o maestro só para a lista)

const fase = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, ESTADO), 'utf8')).fase;
  } catch {
    return '';
  }
};

// "Score N/5" do teste na aplicação (etapa 7, teste.json): verde no mínimo ou acima, amarelo abaixo.
function seloScore(dir) {
  let r = null;
  try {
    r = JSON.parse(fs.readFileSync(path.join(dir, 'teste.json'), 'utf8'));
  } catch {
    return '';
  }
  if (typeof r?.score !== 'number') return '';
  return pill.pill(`Score ${r.score}/5`, {
    cor: r.score >= r.minimo ? 'ok' : 'pausada',
    dica: `Teste na aplicação: mínimo ${r.minimo}/5${r.entregavel === false ? ' · entregue abaixo do mínimo' : ''}`
  });
}

const selos = (t) => {
  const dir = tickets.pasta(t.chave, 'impl');
  return seloSubtarefas(t, dir) + seloScore(dir);
};

function seloSubtarefas(t, dir) {
  const lista = (t.subtarefas || []).filter((x) => situacaoSub(x) !== 'fora');
  if (!lista.length) return '';
  const salvas = lerSubs(dir);
  const n = lista.length,
    rotulo = `${n} subtarefa${n === 1 ? '' : 's'}`;
  const dica = lista.map((x) => `${x.key} · ${x.status || ''} · ${x.resumo || ''}`).join('\n');
  if (!salvas.some((x) => x.grupo)) return pill.pill(rotulo, { cor: 'novo', dica });
  const feitos = new Set(
    salvas.filter((x) => x.grupo && fase(dirGrupo(dir, x.grupo)) === 'concluido').map((x) => x.key)
  );
  const prontas = lista.filter((x) => situacaoSub(x) === 'concluida' || feitos.has(x.key)).length;
  return pill.pill(`${prontas}/${rotulo}`, {
    cor: prontas === n ? 'ok' : 'andando',
    dica: salvas.map((x) => `${x.key} · ${x.grupo || x.situacao}${feitos.has(x.key) ? ' · feita' : ''}`).join('\n')
  });
}

module.exports = { selos };
