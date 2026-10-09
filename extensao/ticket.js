const vscode = require('vscode');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Aceita .../browse/WMS-123 e ...?selectedIssue=WMS-123
function lerLink(link) {
  const url = new URL(link.trim());
  const key = (url.searchParams.get('selectedIssue') || url.pathname.match(/browse\/([A-Z][A-Z0-9]+-\d+)/i)?.[1] || '').toUpperCase();
  if (!key) throw new Error('Link sem chave do ticket (ex.: .../browse/WMS-123)');
  return { key, site: url.origin };
}

async function credenciais(secrets) {
  let email = await secrets.get('jira.email');
  let token = await secrets.get('jira.token');
  if (!email || !token) {
    email = await vscode.window.showInputBox({ prompt: 'E-mail da conta Jira', ignoreFocusOut: true });
    if (!email) return null;
    token = await vscode.window.showInputBox({
      prompt: 'API token do Jira (id.atlassian.com/manage-profile/security/api-tokens)',
      password: true, ignoreFocusOut: true
    });
    if (!token) return null;
    await secrets.store('jira.email', email);
    await secrets.store('jira.token', token);
  }
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

async function buscar(secrets, { key, site }) {
  const auth = await credenciais(secrets);
  if (!auth) throw new Error('Credenciais do Jira não informadas');
  const jira = async (rota) => {
    const r = await fetch(`${site}/rest/api/3/${rota}`, { headers: { Authorization: auth, Accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) {
      await secrets.delete('jira.email');
      await secrets.delete('jira.token');
      throw new Error('Jira recusou as credenciais. Tente de novo para informar outras.');
    }
    if (!r.ok) throw new Error(`Jira respondeu ${r.status} para ${key}`);
    return r.json();
  };
  // Filhos pela JQL `parent`: cobre subtarefas de história e histórias de Feature/Épico (o campo `subtasks` só traz as primeiras).
  const [j, filhos] = await Promise.all([
    jira(`issue/${key}?fields=summary,status,assignee,issuetype,priority,description,timetracking,comment,attachment&expand=renderedFields`),
    jira(`search/jql?jql=${encodeURIComponent(`parent = ${key} ORDER BY created ASC`)}&fields=summary,status,issuetype,assignee&maxResults=100`)
  ]);
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
    anexos: (j.fields.attachment || []).map((a) => ({ id: String(a.id), nome: a.filename, tamanho: a.size, url: a.content, criado: a.created })),
    comentarios: comentarios.map((c, n) => ({
      autor: c.author?.displayName, data: c.created, corpo: renderizados[n]?.body || ''
    })).reverse() // mais recente primeiro
  };
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

// Comentário no ticket.
async function comentar(secrets, { key, site }, texto) {
  return api(secrets, site, `issue/${key}/comment`, { method: 'POST', body: JSON.stringify({ body: mdParaAdf(texto) }) });
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
    data: c.created, texto: adfTexto(c.body).trim(), link: `${site}/browse/${key}?focusedCommentId=${c.id}` }));
}

// Quem é você no Jira (accountId e nome), guardado depois da primeira busca.
const eus = {};
async function eu(secrets, site) {
  if (!eus[site]) { const m = await api(secrets, site, 'myself'); eus[site] = { id: m.accountId, nome: m.displayName }; }
  return eus[site];
}

// Tickets em que você é o responsável (mais recentes primeiro). statusIds: os status de uma coluna do board;
// sem eles, só os não concluídos.
async function meus(secrets, site, statusIds) {
  const filtro = statusIds?.length ? `status in (${statusIds.map((x) => Number(x)).filter(Boolean).join(',')})` : 'statusCategory != Done';
  const jql = `assignee = currentUser() AND ${filtro} ORDER BY updated DESC`;
  const r = await api(secrets, site, `search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status,issuetype,parent&maxResults=50`);
  return (r.issues || []).map((i) => ({ key: i.key, resumo: i.fields.summary, status: i.fields.status?.name, tipo: i.fields.issuetype?.name,
    subtarefa: !!i.fields.issuetype?.subtask, pai: i.fields.parent?.key || null }));
}

// Etapas = colunas do board (na ordem do board), cada uma com os status que ela agrupa.
// O board é achado pelo nome dentro do projeto (ex.: "Downstream" no WMS).
// extras: status que não são coluna do board mas valem como etapa (ex.: "Pronto p/ Dev"); entram antes das colunas,
// achados pelo nome nos status do projeto (sem diferença de maiúsculas e espaços).
async function etapas(secrets, site, projeto, nomeBoard, extras = []) {
  const r = await api(secrets, site, `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projeto)}&maxResults=100`);
  const board = (r.values || []).find((b) => b.name.toLowerCase().includes(nomeBoard.toLowerCase()));
  if (!board) throw new Error(`Board "${nomeBoard}" não encontrado no projeto ${projeto}`);
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
async function atualizarDescricao(secrets, { site }, key, md, { titulo, estimativa } = {}) {
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

// Estilo da folha do ticket (aba Ticket do painel).
const estiloDetalhe = `
  /* ── Detalhe: o conteúdo fica numa folha, como a nota ── */
  .folha { margin: 0 12px 12px; padding: 12px 14px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--sombra); }
  .folha h3 { margin: 0 0 8px; font-size: 14px; line-height: 1.35; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
  .meta span { font-size: 10.5px; padding: 1px 8px; border-radius: var(--r-pill); color: var(--text-dim); border: 1px solid var(--border); }
  .meta span.status { color: var(--cor); border-color: color-mix(in srgb, var(--cor) 40%, transparent); background: color-mix(in srgb, var(--cor) 12%, transparent); }
  .horas { display: flex; gap: 6px; margin: 0 0 4px; }
  .horas div { flex: 1; border-radius: var(--r-md); padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; background: var(--surface-2); }
  .horas small { color: var(--text-dim); font-size: 10px; }
  .horas b { font-size: 13px; }
  details { margin-top: 14px; }
  summary { cursor: pointer; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); margin-bottom: 8px; }
  details ul li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--r-md); cursor: pointer; }
  details ul li:hover { background: var(--surface-2); }
  details ul .key { font-family: var(--fc-font); font-size: 11.5px; font-weight: 600; color: var(--accent); white-space: nowrap; }
  details ul .resumo { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  details ul .status { font-size: 10px; color: var(--text-dim); white-space: nowrap; }
  .descricao { font-size: 12.5px; line-height: 1.55; }
  .descricao img { max-width: 100%; }
  .descricao table { display: block; overflow-x: auto; max-width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  .descricao th, .descricao td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; vertical-align: top; min-width: 60px; }
  .descricao th { background: var(--surface-2); font-weight: 600; }
  .descricao pre, .descricao code { white-space: pre-wrap; word-break: break-word; font-family: var(--fc-mono); }
  .descricao .confluence-information-macro, .descricao .panel { border-left: 3px solid var(--accent); padding: 4px 10px; margin: 8px 0; }
  .comentario { padding: 8px 0; border-top: 1px solid var(--border); }
  .comentario:first-of-type { border-top: none; padding-top: 0; }
  .comentario .autor { font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
`;

const corStatus = (st = '') => /conclu|done|fechad|resolv|pronto p\/ ?qa|homolog/i.test(st) ? 'ok'
  : /andamento|progress|desenv|review|revis|teste|qa/i.test(st) ? 'andando' : 'novo';

// A descrição vem como HTML do próprio Jira; a CSP acima impede que scripts dela rodem.
const dataBr = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Só o conteúdo do ticket (sem topo e botões): também usado na aba Ticket do painel.
const folhaTicket = (t) => `
  <div class="folha st-${corStatus(t.status)}">
    <h3>${esc(t.resumo)}</h3>
    <div class="meta"><span class="status">${esc(t.status)}</span><span>${esc(t.prioridade)}</span><span>${esc(t.responsavel)}</span></div>
    <div class="horas">
      <div><small>Estimativa original</small><b>${esc(t.horas.original || '—')}</b></div>
      <div><small>Restante</small><b>${esc(t.horas.restante || '—')}</b></div>
      <div><small>Registrado</small><b>${esc(t.horas.registrado || '—')}</b></div>
    </div>
    ${t.subtarefas.length ? `<details open><summary>Subtarefas (${t.subtarefas.length})</summary><ul>${t.subtarefas.map((s) => `
      <li data-acao="abrir" data-key="${esc(s.key)}" title="${esc(s.tipo)}${s.responsavel ? ' · ' + esc(s.responsavel) : ''}">
        <span class="key">${esc(s.key)}</span><span class="resumo">${esc(s.resumo)}</span><span class="status">${esc(s.status)}</span>
      </li>`).join('')}</ul></details>` : ''}
    <details open><summary>Descrição</summary><div class="descricao">${t.descricao}</div></details>
    <details open><summary>Comentários (${t.comentarios.length})</summary>
      ${t.comentarios.length ? t.comentarios.map((c) => `<div class="comentario">
        <div class="autor"><b>${esc(c.autor)}</b> · ${esc(dataBr(c.data))}</div>
        <div class="descricao">${c.corpo}</div>
      </div>`).join('') : '<p class="vazio">Nenhum comentário.</p>'}
    </details>
  </div>`;

exports.jira = { lerLink, buscar, comentar, criarSubtarefa, atualizarDescricao, comentarios, eu, meus, etapas, projetoInfo, boards, statusDoProjeto, credenciais, folhaTicket, corStatus, estiloDetalhe };
exports._teste = { lerLink, esc, mdParaAdf, adfTexto };
