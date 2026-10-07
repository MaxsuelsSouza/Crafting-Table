const vscode = require('vscode');
const crypto = require('crypto');

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
    jira(`issue/${key}?fields=summary,status,assignee,issuetype,priority,description,timetracking,comment&expand=renderedFields`),
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
    comentarios: comentarios.map((c, n) => ({
      autor: c.author?.displayName, data: c.created, corpo: renderizados[n]?.body || ''
    })).reverse() // mais recente primeiro
  };
}

const estilo = `
  /* Mesmos tokens e peças das Notas (Atelier: tokens.css + format-bar.css). */
  :root { --surface: var(--vscode-editorWidget-background, #232328); --surface-2: var(--vscode-toolbar-hoverBackground, #2a2a30);
    --border: var(--vscode-widget-border, #3a3a42); --text: var(--vscode-foreground, #ececf0); --text-dim: var(--vscode-descriptionForeground, #9a9aa4);
    --accent: #007aff; --r-sm: 4px; --r-md: 6px; --r-lg: 10px; --r-pill: 999px; --fs-xs: 10px; --fs-sm: 11px; --fs-md: 12px; --sombra: 0 4px 16px rgb(0 0 0 / 16%); }
  body { font-family: var(--vscode-font-family); color: var(--text); padding: 0; margin: 0; }
  button { font: inherit; cursor: pointer; }
  .topo { padding: 10px 12px 8px; display: flex; align-items: baseline; gap: 8px; }
  .topo .rotulo { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-dim); flex: none; }
  .topo .titulo { flex: 1; min-width: 0; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .topo .extra { flex: none; font-size: 10.5px; color: var(--text-dim); }
  .barras { display: flex; align-items: center; gap: 6px; padding: 0 12px 10px; }
  .format-bar { display: flex; align-items: center; gap: 2px; padding: 4px; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); box-shadow: var(--sombra); white-space: nowrap; }
  .fb-sep { width: 1px; height: 18px; background: var(--border); margin: 0 3px; flex-shrink: 0; }
  .fb-btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 24px; height: 24px; padding: 0 7px;
    border: 0; border-radius: var(--r-md); background: transparent; color: var(--text); font-size: var(--fs-md); line-height: 1; }
  .fb-btn:hover { background: var(--surface-2); }
  .fb-btn svg { width: 13px; height: 13px; }
  .busca { flex: 1; min-width: 0; padding: 4px 8px; gap: 6px; color: var(--text-dim); }
  .busca:focus-within { border-color: var(--accent); }
  .busca svg { width: 13px; height: 13px; flex: none; }
  #filtro { flex: 1; min-width: 0; height: 24px; border: none; outline: none; background: transparent; color: var(--text); font: inherit; font-size: var(--fs-md); }
  .primario { flex: none; height: 34px; padding: 0 12px; border: none; border-radius: var(--r-md); font-size: var(--fs-md); font-weight: 600;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground); box-shadow: var(--sombra); }
  .primario:hover { background: var(--vscode-button-hoverBackground, var(--vscode-button-background)); }
  .espaco { flex: 1; }
  .erro { color: var(--vscode-errorForeground); font-size: 12px; margin: 0 12px 8px; }
  .vazio { color: var(--text-dim); }
  .centro { text-align: center; margin-top: 24px; line-height: 1.6; font-size: 12.5px; }
  .centro .icone { font-size: 28px; opacity: .6; }

  /* ── Lista: cada ticket é uma folha, como a nota ── */
  ul { list-style: none; padding: 0; margin: 0; }
  ul.tickets { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 12px; }
  ul.tickets li { padding: 9px 10px 10px 12px; border-radius: var(--r-lg); cursor: pointer; background: var(--surface);
    border: 1px solid var(--border); border-left: 3px solid var(--cor); box-shadow: var(--sombra); transition: border-color 140ms, transform 140ms; }
  ul.tickets li:hover { border-color: var(--accent); border-left-color: var(--cor); transform: translateY(-1px); }
  li[hidden], ul.tickets li[hidden] { display: none; }
  ul.tickets .cab { display: flex; align-items: center; gap: 8px; }
  ul.tickets .key { font-family: var(--vscode-editor-font-family); font-size: 12px; font-weight: 600; color: var(--accent); }
  .pill { font-size: 10px; padding: 1px 7px; border-radius: 9px; color: var(--cor); background: color-mix(in srgb, var(--cor) 16%, transparent); white-space: nowrap; }
  ul.tickets .botoes { margin-left: auto; display: flex; gap: 1px; opacity: 0; transition: opacity 140ms; }
  ul.tickets li:hover .botoes { opacity: 1; }
  .x { height: 22px; min-width: 22px; padding: 0 5px; border: 0; border-radius: var(--r-md); background: transparent; color: var(--text-dim); font-size: 12px; }
  .x:hover { background: var(--surface-2); color: var(--text); }
  ul.tickets .titulo { margin-top: 4px; font-size: 12.5px; line-height: 1.45; color: var(--text); opacity: .88;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .st-novo { --cor: #8b949e; } .st-andando { --cor: #e3a43b; } .st-ok { --cor: #4fb477; }
  #semResultado { margin: 0 12px; }

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
  details ul .key { font-family: var(--vscode-editor-font-family); font-size: 11.5px; font-weight: 600; color: var(--accent); white-space: nowrap; }
  details ul .resumo { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  details ul .status { font-size: 10px; color: var(--text-dim); white-space: nowrap; }
  .descricao { font-size: 12.5px; line-height: 1.55; }
  .descricao img { max-width: 100%; }
  .descricao table { display: block; overflow-x: auto; max-width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  .descricao th, .descricao td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; vertical-align: top; min-width: 60px; }
  .descricao th { background: var(--surface-2); font-weight: 600; }
  .descricao pre, .descricao code { white-space: pre-wrap; word-break: break-word; font-family: var(--vscode-editor-font-family); }
  .descricao .confluence-information-macro, .descricao .panel { border-left: 3px solid var(--accent); padding: 4px 10px; margin: 8px 0; }
  .comentario { padding: 8px 0; border-top: 1px solid var(--border); }
  .comentario:first-of-type { border-top: none; padding-top: 0; }
  .comentario .autor { font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
`;

function pagina(nonce, corpo) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>${estilo}</style></head><body>${corpo}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-acao]');
    if (!el) return;
    e.stopPropagation();
    vscode.postMessage({ acao: el.dataset.acao, key: el.dataset.key });
  });
  // Filtro da lista por chave/título; o termo sobrevive ao redesenho da tela.
  const filtro = document.getElementById('filtro');
  if (filtro) {
    const filtrar = () => {
      const termos = filtro.value.toLowerCase().split(/\s+/).filter(Boolean);
      let visiveis = 0;
      document.querySelectorAll('li[data-key]').forEach((li) => {
        li.hidden = !termos.every((t) => li.textContent.toLowerCase().includes(t));
        if (!li.hidden) visiveis++;
      });
      document.getElementById('semResultado').hidden = visiveis > 0;
      vscode.setState({ filtro: filtro.value });
    };
    filtro.value = vscode.getState()?.filtro || '';
    filtro.addEventListener('input', filtrar);
    filtrar();
  }
</script></body></html>`;
}

// Cor do status pela categoria do nome (o Jira não manda a categoria na lista salva).
const corStatus = (st = '') => /conclu|done|fechad|resolv|pronto p\/qa|homolog/i.test(st) ? 'ok'
  : /andamento|progress|desenv|review|revis|teste|qa/i.test(st) ? 'andando' : 'novo';

const LUPA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

const telaLista = (tickets, erro) => `
  <div class="topo"><span class="rotulo">Tickets</span><span class="titulo"></span>
    <span class="extra">${tickets.length ? `${tickets.length} ticket${tickets.length === 1 ? '' : 's'}` : ''}</span></div>
  <div class="barras">
    ${tickets.length ? `<div class="format-bar busca">${LUPA}<input id="filtro" type="search" placeholder="Buscar por chave ou título" spellcheck="false"></div>` : '<span class="espaco"></span>'}
    <button class="primario" data-acao="adicionar" title="Adicionar ticket pelo link do Jira">＋ Ticket</button>
  </div>
  ${erro ? `<p class="erro">${esc(erro)}</p>` : ''}
  ${tickets.length ? `<ul class="tickets">${tickets.map((t) => `
    <li data-acao="abrir" data-key="${esc(t.key)}" class="st-${corStatus(t.status)}">
      <div class="cab">
        <span class="key">${esc(t.key)}</span>
        ${t.status ? `<span class="pill">${esc(t.status)}</span>` : ''}
        <span class="botoes">
          <button class="x" data-acao="mencionar" data-key="${esc(t.key)}" title="Mencionar no Claude">@</button>
          <button class="x" data-acao="remover" data-key="${esc(t.key)}" title="Remover da lista">✕</button>
        </span>
      </div>
      <div class="titulo">${esc(t.resumo)}</div>
    </li>`).join('')}</ul>
  <p id="semResultado" class="vazio centro" hidden>Nenhum ticket encontrado.</p>`
  : `<div class="vazio centro"><div class="icone">🎫</div>Nenhum ticket ainda.<br>Clique em <b>＋ Ticket</b> e cole o link do Jira.</div>`}`;

// A descrição vem como HTML do próprio Jira; a CSP acima impede que scripts dela rodem.
const dataBr = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

const telaTicket = (t) => `
  <div class="topo"><span class="rotulo">Ticket</span><span class="titulo">${esc(t.key)}</span><span class="extra">${esc(t.tipo || '')}</span></div>
  <div class="barras">
    <div class="format-bar">
      <button class="fb-btn" data-acao="voltar" title="Voltar para a lista">← Tickets</button>
      <span class="fb-sep"></span>
      <button class="fb-btn" data-acao="navegador" data-key="${esc(t.key)}" title="Abrir no Jira">Jira ↗</button>
    </div>
    <span class="espaco"></span>
    <button class="primario" data-acao="claude" data-key="${esc(t.key)}" title="Colar o link na conversa do Claude">✳ Claude</button>
  </div>
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

exports.provider = (ctx) => {
  const lista = () => ctx.globalState.get('tickets', []);
  const salvar = (l) => ctx.globalState.update('tickets', l);
  let view;
  let atual;

  const mostrar = (corpo) => { view.webview.html = pagina(crypto.randomBytes(16).toString('hex'), corpo); };

  // novo = veio do "adicionar"; subtarefa aberta pela tela do ticket não entra na lista
  const abrir = async (ref, novo) => {
    mostrar(`<p class="vazio centro">Carregando ${esc(ref.key)}…</p>`);
    try {
      const t = atual = await buscar(ctx.secrets, ref);
      if (novo || lista().some((x) => x.key === t.key))
        salvar([{ key: t.key, site: t.site, resumo: t.resumo, status: t.status }, ...lista().filter((x) => x.key !== t.key)]);
      mostrar(telaTicket(t));
    } catch (e) {
      mostrar(telaLista(lista(), e.message));
    }
  };

  const acoes = {
    async adicionar() {
      const link = await vscode.window.showInputBox({ prompt: 'Link do ticket no Jira', placeHolder: 'https://empresa.atlassian.net/browse/WMS-123', ignoreFocusOut: true });
      if (!link) return;
      try { await abrir(lerLink(link), true); } catch (e) { mostrar(telaLista(lista(), e.message)); }
    },
    abrir: ({ key }) => abrir(lista().find((t) => t.key === key) || { key, site: atual.site }),
    remover: ({ key }) => { salvar(lista().filter((t) => t.key !== key)); mostrar(telaLista(lista())); },
    voltar: () => mostrar(telaLista(lista())),
    mencionar: ({ key }) => {
      const site = (lista().find((t) => t.key === key) || atual).site;
      require('./claude').mencionar(`${key} (${site}/browse/${key})`);
    },
    claude: ({ key }) => {
      const site = (lista().find((t) => t.key === key) || atual).site;
      require('./claude').enviar(`Leia esse ticket ${site}/browse/${key}`);
    },
    navegador: ({ key }) => vscode.env.openExternal(vscode.Uri.parse(`${atual.site}/browse/${key}`))
  };

  return vscode.window.registerWebviewViewProvider('claudeAbas.ticket', {
    resolveWebviewView(v) {
      view = v;
      view.webview.options = { enableScripts: true };
      view.webview.onDidReceiveMessage((m) => acoes[m.acao]?.(m));
      mostrar(telaLista(lista()));
    }
  }, { webviewOptions: { retainContextWhenHidden: true } });
};

exports._teste = { lerLink, esc };
