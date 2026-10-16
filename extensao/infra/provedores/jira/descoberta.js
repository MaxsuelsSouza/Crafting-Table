// @ts-check
// Descoberta para o mapeamento por IA (configuracao/conexao.js): só metadados da conta, com limites; nada de conteúdo de ticket nem credencial.
const { api } = require('./api');
const { varios, labels } = require('./busca');
const { etapas, boards, statusDoProjeto } = require('./board');

// Descoberta para o mapeamento por IA: só metadados da conta, com limites (projetos, boards com colunas, status, tipos de item, labels).
// O projeto atual e os projetos da lista entram primeiro; nada de conteúdo de ticket nem de credencial.
async function projetos(secrets, site) {
  const r = await api(secrets, site, 'project/search?maxResults=100&orderBy=key');
  return (r.values || []).map((p) => ({ chave: p.key, nome: p.name }));
}
const LIMITES = { projetos: 50, projetosDetalhados: 3, boards: 20, status: 150, labels: 200 };
// projetoAtual: os projetos escolhidos (um ou vários); só eles são detalhados (boards, etapas, status), o resto da conta não interessa.
async function descobrir(secrets, site, projetoAtual = '') {
  const escolhidos = varios(projetoAtual);
  const ps = await api(secrets, site, `project/search?maxResults=${LIMITES.projetos}&orderBy=key`).catch(() => ({ values: [] }));
  const projetos = (ps.values || []).map((p) => ({ chave: p.key, nome: p.name }));
  for (const c of escolhidos) if (!projetos.some((p) => p.chave === c)) projetos.unshift({ chave: c, nome: c });
  const detalhar = escolhidos.length ? projetos.filter((p) => escolhidos.includes(p.chave)) : projetos.slice(0, LIMITES.projetosDetalhados);
  const lista = [], status = new Set();
  for (const p of detalhar) {
    for (const b of (await boards(secrets, site, p.chave).catch(() => [])).slice(0, Math.max(0, LIMITES.boards - lista.length))) {
      const cfg = await api(secrets, site, `/rest/agile/1.0/board/${b.id}/configuration`).catch(() => null);
      const etapas = (cfg?.columnConfig?.columns || []).map((c) => ({ nome: c.name, ids: (c.statuses || []).map((x) => String(x.id)) })).filter((c) => c.ids.length);
      lista.push({ id: b.id, nome: b.nome, tipo: b.tipo, projeto: p.chave, etapas });
    }
    (await statusDoProjeto(secrets, site, p.chave).catch(() => [])).forEach((n) => status.add(n));
  }
  const tipos = await api(secrets, site, 'issuetype').catch(() => []);
  const tiposItem = [...new Map((Array.isArray(tipos) ? tipos : []).map((t) => [t.name, { nome: t.name, subtarefa: !!t.subtask, nivel: t.hierarchyLevel }])).values()];
  const labs = await labels(secrets, site, '').catch(() => []);
  return { site, projetos, boards: lista, status: [...status].sort((a, b) => a.localeCompare(b)).slice(0, LIMITES.status), tiposItem, labels: labs.slice(0, LIMITES.labels) };
}

module.exports = { projetos, LIMITES, descobrir };
