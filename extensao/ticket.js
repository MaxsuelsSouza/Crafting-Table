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

// Comentário no ticket (corpo ADF: um parágrafo por linha).
async function comentar(secrets, { key, site }, texto) {
  const auth = await credenciais(secrets);
  if (!auth) throw new Error('Credenciais do Jira não informadas');
  const content = texto.split('\n').map((l) => (l.trim() ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' }));
  const r = await fetch(`${site}/rest/api/3/issue/${key}/comment`, {
    method: 'POST', headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: { type: 'doc', version: 1, content } })
  });
  if (!r.ok) throw new Error(`Jira respondeu ${r.status} ao comentar em ${key}`);
}

// Estilo da folha do ticket (aba Ticket do painel).
const estiloDetalhe = `
  /* ── Detalhe: o conteúdo fica numa folha, como a nota ── */
  .folha { margin: 0 12px 12px; padding: 12px 14px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--sombra); }
  .folha h3 { margin: 0 0 8px; font-size: 14px; line-height: 1.35; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
  .meta span { font-size: 10.5px; padding: 1px 8px; border-radius: 10px; color: var(--text-dim); border: 1px solid var(--border); }
  .meta span.status { color: var(--cor); border-color: color-mix(in srgb, var(--cor) 40%, transparent); background: color-mix(in srgb, var(--cor) 12%, transparent); }
  .horas { display: flex; gap: 6px; margin: 0 0 4px; }
  .horas div { flex: 1; border-radius: var(--r-md); padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; background: var(--surface-2); }
  .horas small { color: var(--text-dim); font-size: 10px; }
  .horas b { font-size: 13px; }
  details { margin-top: 14px; }
  summary { cursor: pointer; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); margin-bottom: 8px; }
  details ul li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--r-md); cursor: pointer; }
  details ul li:hover { background: var(--surface-2); }
  details ul .key { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; font-weight: 600; color: var(--accent); white-space: nowrap; }
  details ul .resumo { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  details ul .status { font-size: 10px; color: var(--text-dim); white-space: nowrap; }
  .descricao { font-size: 12.5px; line-height: 1.55; }
  .descricao img { max-width: 100%; }
  .descricao table { display: block; overflow-x: auto; max-width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  .descricao th, .descricao td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; vertical-align: top; min-width: 60px; }
  .descricao th { background: var(--surface-2); font-weight: 600; }
  .descricao pre, .descricao code { white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
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

exports.jira = { lerLink, buscar, comentar, credenciais, folhaTicket, corStatus, estiloDetalhe };
exports._teste = { lerLink, esc };
