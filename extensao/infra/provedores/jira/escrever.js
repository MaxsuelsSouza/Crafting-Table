// @ts-check
// Escrever no ticket: anexar arquivos, comentar (com menções), trocar a descrição e criar subtarefa.
const { credenciais } = require('./conta');
const { api } = require('./api');
const { mdParaAdf } = require('./adf');

// Anexos no ticket: [{ arquivo, nome }] (multipart; o Jira exige X-Atlassian-Token). Um por vez: um arquivo grande não derruba os outros.
async function anexar(secrets, site, key, arquivos) {
  const auth = await credenciais(secrets);
  if (!auth) throw new Error('Credenciais do Jira não informadas');
  const falhas = [];
  for (const a of arquivos) {
    const fd = new FormData();
    fd.append('file', new Blob([require('fs').readFileSync(a.arquivo)]), a.nome);
    const r = await fetch(`${site}/rest/api/3/issue/${key}/attachments`, { method: 'POST', headers: { Authorization: auth, 'X-Atlassian-Token': 'no-check' }, body: fd });
    if (!r.ok) falhas.push(`${a.nome} (${r.status})`);
  }
  if (falhas.length) throw new Error(`anexos recusados: ${falhas.join(', ')}`);
}

// Comentário no ticket.
// mencoes: [{ id, nome }] viram menções reais (notificam) numa linha no começo do comentário.
async function comentar(secrets, { key, site }, texto, mencoes = []) {
  const body = mdParaAdf(texto);
  if (mencoes.length) body.content.unshift({ type: 'paragraph', content: mencoes.flatMap((m) => [{ type: 'mention', attrs: { id: m.id, text: `@${m.nome}` } }, { type: 'text', text: ' ' }]) });
  return api(secrets, site, `issue/${key}/comment`, { method: 'POST', body: JSON.stringify({ body }) });
}

// Troca a descrição de um ticket (ex.: subtarefa [QA] que já existia: o plano novo entra no lugar).
async function atualizarDescricao(secrets, { site }, key, md, { titulo, estimativa } = /** @type {{ titulo?: string, estimativa?: number }} */ ({})) {
  await api(secrets, site, `issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields: { description: mdParaAdf(md), ...(titulo ? { summary: String(titulo).slice(0, 250) } : {}) } }) });
  if (estimativa) {
    try { await api(secrets, site, `issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields: { timetracking: { originalEstimate: estimativa } } }) }); }
    catch (e) { return { aviso: `estimativa não gravada (${e.message})` }; }
  }
  return {};
}

// Subtarefa no ticket pai: tipo de subtarefa do projeto, você como responsável (opcional) e estimativa original.
// A estimativa vai num segundo passo: muitas telas de criação não têm o campo de tempo.
// `tipoNome`: cria um item deste tipo sob o ticket (Feature sob Épico, História sob Feature…) em vez da subtarefa.
async function criarSubtarefa(secrets, { key, site }, { resumo, descricao, estimativa, atribuirAMim, responsavelId, tipoNome }) {
  const projeto = key.split('-')[0];
  const tipos = await api(secrets, site, `issue/createmeta/${projeto}/issuetypes`);
  const lista = tipos.issueTypes || tipos.values || [];
  const tipo = tipoNome ? lista.find((t) => String(t.name).trim().toLowerCase() === String(tipoNome).trim().toLowerCase()) : lista.find((t) => t.subtask);
  if (!tipo) throw new Error(tipoNome ? `O projeto ${projeto} não tem o tipo ${tipoNome}` : `O projeto ${projeto} não tem tipo de subtarefa`);
  const fields = { project: { key: projeto }, parent: { key }, issuetype: { id: tipo.id }, summary: String(resumo).slice(0, 250), description: mdParaAdf(descricao) };
  if (responsavelId) fields.assignee = { accountId: responsavelId };
  else if (atribuirAMim) fields.assignee = { accountId: (await api(secrets, site, 'myself')).accountId };
  const novo = await api(secrets, site, 'issue', { method: 'POST', body: JSON.stringify({ fields }) });
  if (estimativa) {
    try { await api(secrets, site, `issue/${novo.key}`, { method: 'PUT', body: JSON.stringify({ fields: { timetracking: { originalEstimate: estimativa } } }) }); }
    catch (e) { return { key: novo.key, aviso: `estimativa não gravada (${e.message})` }; }
  }
  return { key: novo.key };
}

module.exports = { anexar, comentar, atualizarDescricao, criarSubtarefa };
