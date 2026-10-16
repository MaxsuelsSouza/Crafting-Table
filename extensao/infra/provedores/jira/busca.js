// @ts-check
// Buscas: pessoas que podem ser mencionadas, os seus tickets (JQL) e as labels do site.
const { api } = require('./api');

// Pessoas que podem ser mencionadas no ticket: [{ id, nome }].
async function pessoas(secrets, { key, site }, busca) {
  const q = encodeURIComponent(busca || '');
  let r = await api(secrets, site, `user/assignable/search?issueKey=${key}&maxResults=20&query=${q}`);
  if (!r.length && busca) r = await api(secrets, site, `user/search?maxResults=20&query=${q}`); // quem não é atribuível ainda pode ser mencionado
  return r.filter((u) => (u.accountType || 'atlassian') === 'atlassian' && u.active !== false).map((u) => ({ id: u.accountId, nome: u.displayName }));
}

// Projetos e boards podem ser um ou vários (a pessoa trabalha em mais de um): texto ou lista, vazios fora.
const varios = (x) => [].concat(x ?? []).map((v) => String(v).trim()).filter(Boolean);
const aspas = (x) => `"${String(x).replace(/["\\]/g, '')}"`;

// Tickets em que você é o responsável (mais recentes primeiro). filtro.statusIds: os status de uma coluna do board;
// sem eles, só os não concluídos.
// tipos: em vez do responsável, todos os não concluídos desses tipos (Incidentes: "Incident, Incidente"); boardId limita ao(s) board(s) e projeto ao(s) projeto(s).
// label: em vez do responsável, os tickets com essa label (QA não se vincula ao ticket, marca com label).
async function meus(secrets, site, { statusIds, label, tipos, boardId, projeto } = {}) {
  const filtro = statusIds?.length ? `status in (${statusIds.map((x) => Number(x)).filter(Boolean).join(',')})` : 'statusCategory != Done';
  const ps = varios(projeto);
  const quem = tipos ? `${ps.length ? `project in (${ps.map(aspas).join(',')}) AND ` : ''}issuetype in (${tipos})` : label ? `labels = ${aspas(label)}` : 'assignee = currentUser()';
  const jql = `${quem} AND ${filtro} ORDER BY updated DESC`;
  const campos = `jql=${encodeURIComponent(jql)}&fields=summary,status,issuetype,parent,updated&maxResults=${tipos ? 100 : 50}`;
  // boardId: só os tickets que o(s) board(s) enxerga(m) (o filtro do board vale junto com o jql); vários boards somam, sem repetir.
  const bs = [].concat(boardId ?? []).filter(Boolean);
  const issues = bs.length ? (await Promise.all(bs.map((b) => api(secrets, site, `/rest/agile/1.0/board/${b}/issue?${campos}`)))).flatMap((r) => r.issues || [])
    : (await api(secrets, site, `search/jql?${campos}`)).issues || [];
  const unicos = [...new Map(issues.map((i) => [i.key, i])).values()].sort((a, b) => String(b.fields.updated || '').localeCompare(String(a.fields.updated || '')));
  return unicos.map((i) => ({ key: i.key, resumo: i.fields.summary, status: i.fields.status?.name, tipo: i.fields.issuetype?.name,
    subtarefa: !!i.fields.issuetype?.subtask, pai: i.fields.parent?.key || null }));
}

// Labels do site que contêm o texto (sem diferença de maiúsculas), em ordem alfabética. Ex.: as de QA (MAXSUEL_QA…).
async function labels(secrets, site, contem) {
  const todas = [];
  for (let ini = 0; ; ini += 1000) {
    const r = await api(secrets, site, `label?startAt=${ini}&maxResults=1000`);
    todas.push(...(r.values || []));
    if (r.isLast !== false || !(r.values || []).length) break;
  }
  return todas.filter((l) => l.toLowerCase().includes(contem.toLowerCase())).sort();
}

module.exports = { pessoas, varios, aspas, meus, labels };
