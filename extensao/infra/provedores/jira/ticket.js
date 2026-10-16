// @ts-check
// Ler o ticket: buscar (o ticket normalizado da aba Ticket), filhos (subtarefas), comentários e o conteúdo de um anexo.
const { linkDo } = require('./link');
const { credenciais, sairConta } = require('./conta');
const { api } = require('./api');
const { adfMd, adfTexto } = require('./adf');

async function buscar(secrets, { key, site }) {
  const auth = await credenciais(secrets);
  if (!auth) throw new Error('Credenciais do Jira não informadas');
  const jira = async (rota) => {
    const r = await fetch(`${site}/rest/api/3/${rota}`, { headers: { Authorization: auth, Accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) {
      await sairConta(secrets);
      throw new Error('Jira recusou as credenciais. Tente de novo para informar outras.');
    }
    if (!r.ok) throw new Error(`Jira respondeu ${r.status} para ${key}`);
    return r.json();
  };
  // Filhos pela JQL `parent`: cobre subtarefas de história e histórias de Feature/Épico (o campo `subtasks` só traz as primeiras).
  const [j, filhos] = await Promise.all([
    jira(`issue/${key}?fields=summary,status,assignee,issuetype,priority,description,timetracking,comment,attachment,parent&expand=renderedFields`),
    jira(`search/jql?jql=${encodeURIComponent(`parent = ${key} ORDER BY created ASC`)}&fields=summary,status,issuetype,assignee&maxResults=100`)
  ]);
  // Anexos do pai e das histórias irmãs (os arquivos da feature costumam estar em outra história dela); falha aqui não derruba o ticket.
  const pai = j.fields.parent?.key;
  const [apai, irmas] = pai ? await Promise.all([
    jira(`issue/${pai}?fields=attachment`).then((p) => p.fields.attachment || []),
    jira(`search/jql?jql=${encodeURIComponent(`parent = ${pai} AND key != ${key} ORDER BY created ASC`)}&fields=attachment&maxResults=100`).then((r) => r.issues || [])
  ]).catch(() => [[], []]) : [[], []];
  const doPai = [...apai.map((a) => [a, pai]), ...irmas.flatMap((i) => (i.fields.attachment || []).map((a) => [a, i.key]))];
  const tt = j.fields.timetracking || {};
  const comentarios = j.fields.comment?.comments || [];
  const renderizados = j.renderedFields?.comment?.comments || [];
  return {
    key, site,
    resumo: j.fields.summary,
    status: j.fields.status?.name,
    tipo: j.fields.issuetype?.name,
    pai: j.fields.parent?.key || null,
    prioridade: j.fields.priority?.name,
    responsavel: j.fields.assignee?.displayName || 'Sem responsável',
    horas: { original: tt.originalEstimate, restante: tt.remainingEstimate, registrado: tt.timeSpent },
    descricao: j.renderedFields?.description || '<em>Sem descrição</em>',
    subtarefas: (filhos.issues || []).map((f) => ({
      key: f.key, resumo: f.fields.summary, status: f.fields.status?.name, tipo: f.fields.issuetype?.name,
      responsavel: f.fields.assignee?.displayName
    })),
    // Anexos: o conteúdo baixa com a mesma autenticação (a URL redireciona para o armazenamento do Jira).
    anexos: [...(j.fields.attachment || []).map((a) => [a, null]), ...doPai]
      .map(([a, de]) => ({ id: String(a.id), nome: a.filename, tamanho: a.size, url: a.content, criado: a.created, de })),
    comentarios: comentarios.map((c, n) => ({
      autor: c.author?.displayName, data: c.created, corpo: renderizados[n]?.body || ''
    })).reverse() // mais recente primeiro
  };
}

// Subtarefas (filhos) do ticket com a descrição em Markdown: uma chamada só (JQL `parent`).
async function filhos(secrets, { key, site }) {
  const r = await api(secrets, site, `search/jql?jql=${encodeURIComponent(`parent = ${key} ORDER BY created ASC`)}&fields=summary,description,updated,status&maxResults=100`);
  return (r.issues || []).map((i) => ({ key: i.key, resumo: i.fields.summary || '', updated: i.fields.updated, status: i.fields.status?.name,
    md: adfMd(i.fields.description).replace(/\n{3,}/g, '\n\n').trim() }));
}

// Conteúdo de um anexo de buscar() (a URL redireciona para o armazenamento do Jira, com a mesma autenticação).
async function baixarAnexo(secrets, anexo) {
  const auth = await credenciais(secrets);
  if (!auth) throw new Error('credenciais do Jira não informadas');
  const r = await fetch(anexo.url, { headers: { Authorization: auth } });
  if (!r.ok) throw new Error(`Jira respondeu ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Comentários do ticket, mais antigos primeiro: { id, autor, autorId, data, texto, link }.
async function comentarios(secrets, { key, site }) {
  const r = await api(secrets, site, `issue/${key}/comment?orderBy=created&maxResults=100`);
  return (r.comments || []).map((c) => ({ id: String(c.id), autor: c.author?.displayName || 'alguém', autorId: c.author?.accountId || null,
    data: c.created, texto: adfTexto(c.body).trim(), link: `${linkDo(site, key)}?focusedCommentId=${c.id}` }));
}

module.exports = { buscar, filhos, baixarAnexo, comentarios };
