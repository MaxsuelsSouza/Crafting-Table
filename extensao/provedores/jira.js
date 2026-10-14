// @ts-check
const vscode = require('vscode');
const credenciaisLib = require('./credenciais');

// Adaptador do Jira (Cloud): REST v3, Agile 1.0, JQL e ADF. Cumpre provedores/contrato.js; o resto da extensão não vê
// JQL nem ADF: texto entra e sai em Markdown.

// Aceita .../browse/WMS-123 e ...?selectedIssue=WMS-123
function lerLink(link) {
  const url = new URL(link.trim());
  const key = (url.searchParams.get('selectedIssue') || url.pathname.match(/browse\/([A-Z][A-Z0-9]+-\d+)/i)?.[1] || '').toUpperCase();
  if (!key) throw new Error('Link sem chave do ticket (ex.: .../browse/WMS-123)');
  return { id: key, chave: key, projeto: key.split('-')[0], site: url.origin };
}

// Chave do Jira dentro de um texto (nome de branch: feature/WMS-13429-x → WMS-13429); null se não houver.
const chaveDaBranch = (texto) => String(texto || '').match(/[A-Z][A-Z0-9]+-\d+/i)?.[0].toUpperCase() || null;

// O que pedir para conectar: site (vira a variável "site"), e-mail e API token (segredos jira.email e jira.token).
const camposCredencial = [
  { id: 'site', rotulo: 'Site do Jira', segredo: false, variavel: 'site', exemplo: 'https://<org>.atlassian.net' },
  { id: 'email', rotulo: 'E-mail da conta Jira', segredo: true, visivel: true }, // guardado como segredo, mas aparece ao digitar
  { id: 'token', rotulo: 'API token do Jira (id.atlassian.com/manage-profile/security/api-tokens)', segredo: true }
];

// Cabeçalho Basic; se faltar e-mail ou token, pede (só os segredos: o site é pedido ao conectar).
async function credenciais(secrets) {
  let { email, token } = await credenciaisLib.lerSegredos(jira, secrets);
  if (!email || !token) {
    const v = await credenciaisLib.pedir(jira, secrets);
    if (!v) return null;
    ({ email, token } = v);
  }
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

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

// Link do ticket para abrir no navegador.
const linkDo = (site, key) => `${site}/browse/${key}`;

// Há conta guardada (sem pedir nada); sairConta esquece, e a próxima chamada pede de novo.
const conectado = (secrets) => credenciaisLib.completas(jira, secrets);
async function sairConta(secrets) {
  await credenciaisLib.esquecer(jira, secrets);
  for (const k of Object.keys(eus)) delete eus[k];
}

// Texto → documento ADF do Jira (um parágrafo por linha).
const adf = (texto) => ({ type: 'doc', version: 1, content: String(texto || '').split('\n')
  .map((l) => (l.trim() ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })) });

// Markdown → ADF, para a descrição chegar formatada no Jira: títulos, **negrito**, *itálico*, `código`, [link](url),
// listas (- e 1.), tabelas, blocos ``` , citação (>) e régua (---). Quebra de linha simples vira quebra no Jira.
function inlineAdf(texto) {
  const nos = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*([^*\s][^*]*?)\*(?!\w)|(?<!\w)_([^_\s][^_]*?)_(?!\w)/g;
  let ultimo = 0, m;
  const txt = (t, marks) => { if (t) nos.push(marks ? { type: 'text', text: t, marks } : { type: 'text', text: t }); };
  while ((m = re.exec(texto))) {
    txt(texto.slice(ultimo, m.index));
    if (m[1] !== undefined) txt(m[1], [{ type: 'strong' }]);
    else if (m[2] !== undefined) txt(m[2], [{ type: 'code' }]);
    else if (m[3] !== undefined) txt(m[3], [{ type: 'link', attrs: { href: m[4] } }]);
    else txt(m[5] ?? m[6], [{ type: 'em' }]);
    ultimo = re.lastIndex;
  }
  txt(texto.slice(ultimo));
  return nos;
}
const paragrafoAdf = (linhas) => {
  const content = [];
  linhas.forEach((l, i) => { if (i) content.push({ type: 'hardBreak' }); content.push(...inlineAdf(l)); });
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};
function mdParaAdf(md) {
  const linhas = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const doc = [];
  let i = 0;
  const celulas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }
    const cerca = l.match(/^\s*(```|~~~)\s*(\S*)/);
    if (cerca) {
      const corpo = [];
      for (i++; i < linhas.length && !linhas[i].trim().startsWith(cerca[1]); i++) corpo.push(linhas[i]);
      i++;
      doc.push({ type: 'codeBlock', attrs: cerca[2] ? { language: cerca[2] } : {}, content: corpo.join('\n') ? [{ type: 'text', text: corpo.join('\n') }] : [] });
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { doc.push({ type: 'heading', attrs: { level: h[1].length }, content: inlineAdf(h[2].trim()) }); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { doc.push({ type: 'rule' }); i++; continue; }
    if (/^\s*\|/.test(l) && i + 1 < linhas.length && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1])) {
      const cab = celulas(l);
      const rows = [{ type: 'tableRow', content: cab.map((c) => ({ type: 'tableHeader', attrs: {}, content: [paragrafoAdf([c])] })) }];
      for (i += 2; i < linhas.length && /^\s*\|/.test(linhas[i]); i++) {
        const cs = celulas(linhas[i]);
        rows.push({ type: 'tableRow', content: cab.map((_, k) => ({ type: 'tableCell', attrs: {}, content: [paragrafoAdf([cs[k] || ''])] })) });
      }
      doc.push({ type: 'table', attrs: { isNumberColumnEnabled: false, layout: 'default' }, content: rows });
      continue;
    }
    const item = (x) => x.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/);
    if (item(l)) {
      const ordenada = !!item(l)[2];
      const itens = [];
      for (; i < linhas.length && item(linhas[i]) && !!item(linhas[i])[2] === ordenada; i++) {
        const m = item(linhas[i]);
        const marca = m[3] === undefined ? '' : /x/i.test(m[3]) ? '☑ ' : '☐ ';
        itens.push({ type: 'listItem', content: [paragrafoAdf([marca + m[4]])] });
      }
      doc.push(ordenada ? { type: 'orderedList', attrs: { order: 1 }, content: itens } : { type: 'bulletList', content: itens });
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q = [];
      for (; i < linhas.length && /^\s*>/.test(linhas[i]); i++) q.push(linhas[i].replace(/^\s*>\s?/, ''));
      doc.push({ type: 'blockquote', content: [paragrafoAdf(q)] });
      continue;
    }
    const par = [];
    for (; i < linhas.length && linhas[i].trim() && !/^(#{1,6}\s|\s*```|\s*~~~|\s*>|\s*\|)/.test(linhas[i]) && !item(linhas[i]); i++) par.push(linhas[i].trim());
    if (!par.length) { par.push(l.trim()); i++; }
    doc.push(paragrafoAdf(par));
  }
  return { type: 'doc', version: 1, content: doc.length ? doc : [{ type: 'paragraph' }] };
}

// Chamada autenticada à API do Jira; erro traz a mensagem do próprio Jira.
async function api(secrets, site, rota, opcoes = {}) {
  const auth = await credenciais(secrets);
  if (!auth) throw new Error('Credenciais do Jira não informadas');
  const r = await fetch(rota.startsWith('/') ? `${site}${rota}` : `${site}/rest/api/3/${rota}`, { ...opcoes, headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' } });
  const txt = await r.text();
  if (!r.ok) {
    let msg = txt.slice(0, 200);
    try { const j = JSON.parse(txt); msg = [...(j.errorMessages || []), ...Object.entries(j.errors || {}).map(([k, v]) => `${k}: ${v}`)].join('; ') || msg; } catch {}
    throw new Error(`Jira respondeu ${r.status}: ${msg}`);
  }
  return txt ? JSON.parse(txt) : {};
}

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

// Pessoas que podem ser mencionadas no ticket: [{ id, nome }].
async function pessoas(secrets, { key, site }, busca) {
  const q = encodeURIComponent(busca || '');
  let r = await api(secrets, site, `user/assignable/search?issueKey=${key}&maxResults=20&query=${q}`);
  if (!r.length && busca) r = await api(secrets, site, `user/search?maxResults=20&query=${q}`); // quem não é atribuível ainda pode ser mencionado
  return r.filter((u) => (u.accountType || 'atlassian') === 'atlassian' && u.active !== false).map((u) => ({ id: u.accountId, nome: u.displayName }));
}

// ADF (descrição do Jira) → markdown, o bastante para o plano de QA: títulos, parágrafos, listas, tabelas, negrito/itálico/código.
function adfMd(n, lista) {
  if (!n) return '';
  const filhos = (sep = '') => (n.content || []).map((c) => adfMd(c, n.type === 'orderedList' || n.type === 'bulletList' ? n.type : lista)).join(sep);
  switch (n.type) {
    case 'text': return (n.marks || []).reduce((t, m) => (m.type === 'strong' ? `**${t}**` : m.type === 'em' ? `*${t}*` : m.type === 'code' ? `\`${t}\``
      : m.type === 'link' ? `[${t}](${m.attrs?.href})` : t), n.text || '');
    case 'hardBreak': return '  \n';
    case 'mention': case 'emoji': return n.attrs?.text || '';
    case 'heading': return `${'#'.repeat(n.attrs?.level || 2)} ${filhos()}\n\n`;
    case 'paragraph': return `${filhos()}\n\n`;
    case 'bulletList': case 'orderedList': return `${filhos()}\n`;
    case 'listItem': return `${lista === 'orderedList' ? '1.' : '-'} ${filhos().trim().replace(/\n+/g, '\n  ')}\n`;
    case 'codeBlock': return `\`\`\`\n${filhos()}\n\`\`\`\n\n`;
    case 'blockquote': return filhos().trim().split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
    case 'rule': return '---\n\n';
    case 'table': {
      const linhas = (n.content || []).map((r) => (r.content || []).map((c) => adfMd({ type: 'doc', content: c.content }).trim().replace(/\n+/g, ' ').replace(/\|/g, '\\|')));
      if (!linhas.length) return '';
      const larg = Math.max(...linhas.map((l) => l.length));
      return [linhas[0], Array(larg).fill('---'), ...linhas.slice(1)].map((l) => `| ${l.join(' | ')} |`).join('\n') + '\n\n';
    }
    default: return filhos();
  }
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

// ADF → texto simples (parágrafos e itens em linhas próprias), para o Claude ler o comentário.
function adfTexto(n) {
  if (!n) return '';
  if (n.type === 'text') return n.text || '';
  if (n.type === 'hardBreak') return '\n';
  if (n.type === 'mention') return n.attrs?.text || '@alguém';
  const filhos = (n.content || []).map(adfTexto).join('');
  return ['paragraph', 'heading', 'listItem', 'tableRow', 'codeBlock', 'blockquote'].includes(n.type) ? `${filhos}\n` : filhos;
}

// Comentários do ticket, mais antigos primeiro: { id, autor, autorId, data, texto, link }.
async function comentarios(secrets, { key, site }) {
  const r = await api(secrets, site, `issue/${key}/comment?orderBy=created&maxResults=100`);
  return (r.comments || []).map((c) => ({ id: String(c.id), autor: c.author?.displayName || 'alguém', autorId: c.author?.accountId || null,
    data: c.created, texto: adfTexto(c.body).trim(), link: `${linkDo(site, key)}?focusedCommentId=${c.id}` }));
}

// Quem é você no Jira (accountId e nome), guardado depois da primeira busca.
const eus = {};
async function eu(secrets, site) {
  if (!eus[site]) { const m = await api(secrets, site, 'myself'); eus[site] = { id: m.accountId, nome: m.displayName }; }
  return eus[site];
}

// Tickets em que você é o responsável (mais recentes primeiro). filtro.statusIds: os status de uma coluna do board;
// sem eles, só os não concluídos.
// tipos: em vez do responsável, todos os não concluídos desses tipos (Incidentes: "Incident, Incidente"); boardId limita ao board e projeto ao projeto.
// label: em vez do responsável, os tickets com essa label (QA não se vincula ao ticket, marca com label).
async function meus(secrets, site, { statusIds, label, tipos, boardId, projeto } = {}) {
  const filtro = statusIds?.length ? `status in (${statusIds.map((x) => Number(x)).filter(Boolean).join(',')})` : 'statusCategory != Done';
  const quem = tipos ? `${projeto ? `project = "${String(projeto).replace(/["\\]/g, '')}" AND ` : ''}issuetype in (${tipos})` : label ? `labels = "${String(label).replace(/["\\]/g, '')}"` : 'assignee = currentUser()';
  const jql = `${quem} AND ${filtro} ORDER BY updated DESC`;
  // boardId: só os tickets que o board enxerga (o filtro do board vale junto com o jql).
  const r = await api(secrets, site, `${boardId ? `/rest/agile/1.0/board/${boardId}/issue` : 'search/jql'}?jql=${encodeURIComponent(jql)}&fields=summary,status,issuetype,parent&maxResults=${tipos ? 100 : 50}`);
  return (r.issues || []).map((i) => ({ key: i.key, resumo: i.fields.summary, status: i.fields.status?.name, tipo: i.fields.issuetype?.name,
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

// Etapas = colunas do board (na ordem do board), cada uma com os status que ela agrupa.
// O board é achado pelo nome dentro do projeto (ex.: "Downstream" no WMS).
// extras: status que não são coluna do board mas valem como etapa (ex.: "Pronto p/ Dev"); entram antes das colunas,
// achados pelo nome nos status do projeto (sem diferença de maiúsculas e espaços).
async function boardPorNome(secrets, site, projeto, nomeBoard) {
  const r = await api(secrets, site, `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projeto)}&maxResults=100`);
  const board = (r.values || []).find((b) => b.name.toLowerCase().includes(nomeBoard.toLowerCase()));
  if (!board) throw new Error(`Board "${nomeBoard}" não encontrado no projeto ${projeto}`);
  return board;
}
async function etapas(secrets, site, projeto, nomeBoard, extras = []) {
  const board = await boardPorNome(secrets, site, projeto, nomeBoard);
  const cfg = await api(secrets, site, `/rest/agile/1.0/board/${board.id}/configuration`);
  const colunas = (cfg.columnConfig?.columns || []).map((c) => ({ nome: c.name, ids: (c.statuses || []).map((x) => x.id) })).filter((c) => c.ids.length);
  if (!extras.length) return colunas;
  const norm = (x) => String(x).toLowerCase().replace(/\s+/g, '');
  const status = new Map();
  for (const tipo of await api(secrets, site, `project/${projeto}/statuses`)) for (const st of tipo.statuses || []) status.set(norm(st.name), st.id);
  const achados = extras.filter((e) => status.has(norm(e)) && !colunas.some((c) => norm(c.nome) === norm(e))).map((e) => ({ nome: e, ids: [status.get(norm(e))] }));
  return [...achados, ...colunas];
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

// Para a tela de configurações: o projeto, os boards dele e os status (nome) do projeto.
async function projetoInfo(secrets, site, chave) {
  const p = await api(secrets, site, `project/${encodeURIComponent(chave)}`);
  return { chave: p.key, nome: p.name };
}
async function boards(secrets, site, projeto) {
  const r = await api(secrets, site, `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projeto)}&maxResults=100`);
  return (r.values || []).map((b) => ({ id: b.id, nome: b.name, tipo: b.type }));
}
async function statusDoProjeto(secrets, site, projeto) {
  const nomes = new Set();
  for (const tipo of await api(secrets, site, `project/${encodeURIComponent(projeto)}/statuses`)) for (const st of tipo.statuses || []) nomes.add(st.name);
  return [...nomes].sort((a, b) => a.localeCompare(b));
}

// Descoberta para o mapeamento por IA: só metadados da conta, com limites (projetos, boards com colunas, status, tipos de item, labels).
// O projeto atual e os projetos da lista entram primeiro; nada de conteúdo de ticket nem de credencial.
async function projetos(secrets, site) {
  const r = await api(secrets, site, 'project/search?maxResults=100&orderBy=key');
  return (r.values || []).map((p) => ({ chave: p.key, nome: p.name }));
}
const LIMITES = { projetos: 50, projetosDetalhados: 3, boards: 10, status: 150, labels: 200 };
async function descobrir(secrets, site, projetoAtual = '') {
  const ps = await api(secrets, site, `project/search?maxResults=${LIMITES.projetos}&orderBy=key`).catch(() => ({ values: [] }));
  const projetos = (ps.values || []).map((p) => ({ chave: p.key, nome: p.name }));
  if (projetoAtual && !projetos.some((p) => p.chave === projetoAtual)) projetos.unshift({ chave: projetoAtual, nome: projetoAtual });
  const detalhar = [...projetos].sort((a, b) => (b.chave === projetoAtual) - (a.chave === projetoAtual)).slice(0, LIMITES.projetosDetalhados);
  const lista = [], status = new Set();
  for (const p of detalhar) {
    for (const b of (await boards(secrets, site, p.chave).catch(() => [])).slice(0, LIMITES.boards - lista.length)) {
      const cfg = await api(secrets, site, `/rest/agile/1.0/board/${b.id}/configuration`).catch(() => null);
      const etapas = (cfg?.columnConfig?.columns || []).map((c) => ({ nome: c.name, ids: (c.statuses || []).map((x) => String(x.id)) })).filter((c) => c.ids.length);
      lista.push({ id: b.id, nome: b.nome, tipo: b.tipo, projeto: p.chave, etapas });
    }
    (await statusDoProjeto(secrets, site, p.chave).catch(() => [])).forEach((n) => status.add(n));
  }
  const tipos = await api(secrets, site, 'issuetype').catch(() => []);
  const tiposItem = [...new Map((Array.isArray(tipos) ? tipos : []).map((t) => [t.name, { nome: t.name, subtarefa: !!t.subtask }])).values()];
  const labs = await labels(secrets, site, '').catch(() => []);
  return { site, projetos, boards: lista, status: [...status].sort((a, b) => a.localeCompare(b)).slice(0, LIMITES.status), tiposItem, labels: labs.slice(0, LIMITES.labels) };
}

// Subtarefa no ticket pai: tipo de subtarefa do projeto, você como responsável (opcional) e estimativa original.
// A estimativa vai num segundo passo: muitas telas de criação não têm o campo de tempo.
async function criarSubtarefa(secrets, { key, site }, { resumo, descricao, estimativa, atribuirAMim }) {
  const projeto = key.split('-')[0];
  const tipos = await api(secrets, site, `issue/createmeta/${projeto}/issuetypes`);
  const tipo = (tipos.issueTypes || tipos.values || []).find((t) => t.subtask);
  if (!tipo) throw new Error(`O projeto ${projeto} não tem tipo de subtarefa`);
  const fields = { project: { key: projeto }, parent: { key }, issuetype: { id: tipo.id }, summary: String(resumo).slice(0, 250), description: mdParaAdf(descricao) };
  if (atribuirAMim) fields.assignee = { accountId: (await api(secrets, site, 'myself')).accountId };
  const novo = await api(secrets, site, 'issue', { method: 'POST', body: JSON.stringify({ fields }) });
  if (estimativa) {
    try { await api(secrets, site, `issue/${novo.key}`, { method: 'PUT', body: JSON.stringify({ fields: { timetracking: { originalEstimate: estimativa } } }) }); }
    catch (e) { return { key: novo.key, aviso: `estimativa não gravada (${e.message})` }; }
  }
  return { key: novo.key };
}

/** @type {import('./contrato').Provedor} */
const jira = {
  id: 'jira', nome: 'Jira', camposCredencial,
  capacidades: { subtarefas: true, anexos: true, comentarios: true, mencoes: true, labels: true, board: true, estimativa: true },
  lerLink, chaveDaBranch, linkDo, credenciais, conectado, sairConta, buscar, filhos, comentar, comentarios, anexar, baixarAnexo, pessoas, eu, meus, labels,
  etapas, boardPorNome, boards, projetos, projetoInfo, statusDoProjeto, descobrir, criarSubtarefa, atualizarDescricao
};
module.exports = { ...jira, _teste: { mdParaAdf, adfTexto, adfMd } };
