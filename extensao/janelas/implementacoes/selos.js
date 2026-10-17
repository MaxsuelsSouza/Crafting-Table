// @ts-check
// Selo do card na lista de Implementações (gancho selos(t) do registro, painel/lista.js → componentes/card-ticket.js): "5 subtarefas" e, com
// os grupos rodando, "2/5 subtarefas" (concluídas antes + as dos grupos concluídos). Fora (QA, cancelada) não conta. O número vem do
// .ticket.json (gravado ao atualizar o ticket do Jira), então ticket nunca aberto não tem selo.
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

function selos(t) {
  const lista = (t.subtarefas || []).filter((x) => situacaoSub(x) !== 'fora');
  if (!lista.length) return '';
  const dir = tickets.pasta(t.chave, 'impl'),
    salvas = lerSubs(dir);
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
