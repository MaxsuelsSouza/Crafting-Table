// @ts-check
// Board e etapas: o board pelo nome, as colunas (etapas) com os status de cada uma, e projeto, boards e status para as Configurações.
const { api } = require('./api');
const { varios } = require('./busca');

// Etapas = colunas do board (na ordem do board), cada uma com os status que ela agrupa.
// O board é achado pelo nome dentro do projeto (ex.: "Downstream" no WMS).
// extras: status que não são coluna do board mas valem como etapa (ex.: "Pronto p/ Dev"); entram antes das colunas,
// achados pelo nome nos status do projeto (sem diferença de maiúsculas e espaços).
// Projetos e boards podem ser vários: boardPorNome devolve o primeiro board com o nome em algum dos projetos.
async function boardPorNome(secrets, site, projeto, nomeBoard) {
  const lista = await boards(secrets, site, projeto);
  const board = lista.find((b) => b.nome.toLowerCase() === String(nomeBoard).toLowerCase()) || lista.find((b) => b.nome.toLowerCase().includes(String(nomeBoard).toLowerCase()));
  if (!board) throw new Error(`Board "${nomeBoard}" não encontrado em ${varios(projeto).join(', ')}`);
  return board;
}
// Ids dos boards escolhidos (vários nomes), na ordem dos nomes.
async function boardsPorNome(secrets, site, projeto, nomes) {
  return Promise.all(varios(nomes).map((n) => boardPorNome(secrets, site, projeto, n)));
}
// Vários boards: colunas com o mesmo nome viram uma etapa só (os status se somam), na ordem em que aparecem.
async function etapas(secrets, site, projeto, nomeBoard, extras = []) {
  const porNome = new Map();
  for (const board of await boardsPorNome(secrets, site, projeto, nomeBoard)) {
    const cfg = await api(secrets, site, `/rest/agile/1.0/board/${board.id}/configuration`);
    for (const c of cfg.columnConfig?.columns || []) {
      const ids = (c.statuses || []).map((x) => x.id);
      if (!ids.length) continue;
      const e = porNome.get(c.name.toLowerCase()) || porNome.set(c.name.toLowerCase(), { nome: c.name, ids: [] }).get(c.name.toLowerCase());
      e.ids = [...new Set([...e.ids, ...ids])];
    }
  }
  const colunas = [...porNome.values()];
  if (!extras.length) return colunas;
  const norm = (x) => String(x).toLowerCase().replace(/\s+/g, '');
  const status = new Map();
  for (const p of varios(projeto)) for (const tipo of await api(secrets, site, `project/${encodeURIComponent(p)}/statuses`)) for (const st of tipo.statuses || []) status.set(norm(st.name), st.id);
  const achados = extras.filter((e) => status.has(norm(e)) && !colunas.some((c) => norm(c.nome) === norm(e))).map((e) => ({ nome: e, ids: [status.get(norm(e))] }));
  return [...achados, ...colunas];
}

// Para a tela de configurações: o projeto, os boards dele e os status (nome) do projeto.
async function projetoInfo(secrets, site, chave) {
  const p = await api(secrets, site, `project/${encodeURIComponent(chave)}`);
  return { chave: p.key, nome: p.name };
}
async function boards(secrets, site, projeto) {
  const todos = [];
  for (const p of varios(projeto)) {
    const r = await api(secrets, site, `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(p)}&maxResults=100`);
    todos.push(...(r.values || []).map((b) => ({ id: b.id, nome: b.name, tipo: b.type, projeto: p })));
  }
  return [...new Map(todos.map((b) => [b.id, b])).values()];
}
async function statusDoProjeto(secrets, site, projeto) {
  const nomes = new Set();
  for (const p of varios(projeto)) for (const tipo of await api(secrets, site, `project/${encodeURIComponent(p)}/statuses`)) for (const st of tipo.statuses || []) nomes.add(st.name);
  return [...nomes].sort((a, b) => a.localeCompare(b));
}

module.exports = { boardPorNome, boardsPorNome, etapas, projetoInfo, boards, statusDoProjeto };
