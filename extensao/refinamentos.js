const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { esc } = require('./ticket')._teste;
const { ESTILO_NOTAS } = require('./comandos').ui;
const sessao = require('./sessao');

// Um refinamento = pasta em ~/.claude/refinamentos/<id>/ com:
//   meta.json (título, tipo, ticket, conversa), notas.html, todo.json (quadro do Atelier),
//   handoff-backend.md e handoff-mobile.md (o que foi analisado em cada repositório).
// Os documentos são os da conversa vinculada (~/.claude/documentos/<sid>/).
const RAIZ = path.join(os.homedir(), '.claude', 'refinamentos');
const pasta = (id) => path.join(RAIZ, id);
const ler = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const lerTexto = (arq) => { try { return fs.readFileSync(arq, 'utf8'); } catch { return null; } };
const gravar = (id, nome, dado) => {
  fs.mkdirSync(pasta(id), { recursive: true });
  fs.writeFileSync(path.join(pasta(id), nome), typeof dado === 'string' ? dado : JSON.stringify(dado, null, 2));
};
const meta = (id) => ler(path.join(pasta(id), 'meta.json'), null);
const HANDOFF = { backend: 'handoff-backend.md', mobile: 'handoff-mobile.md' };
const TIPOS = { tecnico: 'Técnico', funcional: 'Funcional', spec: 'Spec' };

// ── Spec (plugin sdd do Claude Code) ──
// O plugin guarda o estado em <repo>/<spec.dir>/sdd-state.json; aprovar um passo é só por aqui (o hook dele bloqueia o Claude).
function sddState() {
  const reg = ler(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'), {});
  const lista = reg.plugins || reg;
  const chave = Object.keys(lista).find((k) => k.startsWith('sdd@'));
  const info = chave && (Array.isArray(lista[chave]) ? lista[chave][0] : lista[chave]);
  return info?.installPath ? path.join(info.installPath, 'bin', 'sdd-state') : null;
}
const copiaAprovada = (r, n) => path.join(pasta(r.id), 'aprovados', `${n}-${path.basename(arquivoPasso(r, n))}`); // gravada pelo sdd-state aprovar
// O hook Stop do plugin sdd grava .vigia enquanto espera a aprovação; reload/fechar o VS Code mata o processo.
const vigiando = (r) => {
  try { return fs.readFileSync(`/proc/${JSON.parse(fs.readFileSync(path.join(pasta(r.id), '.vigia'), 'utf8')).pid}/cmdline`, 'utf8').includes('guarda.js'); }
  catch { return false; }
};
const dirSpec = (r) => (r.spec?.repo && r.spec?.dir ? path.join(r.spec.repo, r.spec.dir) : null);
const estadoSpec = (r) => (dirSpec(r) ? ler(path.join(dirSpec(r), 'sdd-state.json'), null) : null);
const arquivoPasso = (r, n) => (n === 0 ? path.join(r.spec.repo, 'constitution.md')
  : path.join(dirSpec(r), { 1: 'spec.md', 2: 'spec.md', 3: 'plan.md', 4: 'tasks.md', 5: 'analise.md', 6: 'tasks.md' }[n]));
const STATUS = { pendente: 'Pendente', em_andamento: 'Claude trabalhando', aguardando_revisao: 'Aguardando sua revisão', aprovado: 'Aprovado', desatualizado: 'Desatualizado' };


function listar() {
  let ids;
  try { ids = fs.readdirSync(RAIZ); } catch { return []; }
  return ids.map(meta).filter(Boolean).sort((a, b) => b.criado - a.criado);
}

// ── TODO: mesmo modelo do Atelier (shared/types.ts TodoBoard; colunas padrão; ordem esparsa de 1000 em 1000) ──
const COLUNAS = [{ id: 'todo', title: 'A fazer' }, { id: 'doing', title: 'Fazendo' }, { id: 'done', title: 'Feito' }];
const quadro = (id) => {
  const b = ler(path.join(pasta(id), 'todo.json'), null) || { version: 1, title: 'TODO', columns: COLUNAS, items: [] };
  for (const i of b.items) if (!b.columns.some((c) => c.id === i.status)) i.status = b.columns[0].id; // status órfão cai na primeira
  return b;
};
function aplicarTodo(b, op) {
  const agora = new Date().toISOString();
  const ultima = b.columns.at(-1).id;
  const fimDa = (status) => Math.max(0, ...b.items.filter((i) => i.status === status).map((i) => i.order)) + 1000;
  if (op.type === 'add' && op.title?.trim()) {
    const status = b.columns[0].id;
    b.items.push({ id: crypto.randomUUID(), title: op.title.trim(), status, order: fimDa(status), assignee: '', notes: '', tags: [],
      createdAt: agora, updatedAt: agora, doneAt: null, origin: { type: 'manual' }, activePlanId: null });
  }
  const item = b.items.find((i) => i.id === op.id);
  if (op.type === 'move' && item && b.columns.some((c) => c.id === op.status) && item.status !== op.status) {
    item.status = op.status;
    item.order = fimDa(op.status);
    item.updatedAt = agora;
    item.doneAt = op.status === ultima ? agora : null; // preenchido ao entrar na última coluna, limpo ao sair
  }
  if (op.type === 'remove') b.items = b.items.filter((i) => i.id !== op.id);
  return b;
}

// Markdown simples para os handoffs (títulos, listas, código, negrito, código inline).
function markdown(md) {
  const linhas = esc(md).split('\n');
  let html = '', lista = false, codigo = false;
  const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  for (const l of linhas) {
    if (l.startsWith('```')) { html += codigo ? '</pre>' : '<pre>'; codigo = !codigo; continue; }
    if (codigo) { html += l + '\n'; continue; }
    const item = l.match(/^\s*[-*] (.*)/) || l.match(/^\s*\d+\. (.*)/);
    if (item && !lista) { html += '<ul>'; lista = true; }
    if (!item && lista) { html += '</ul>'; lista = false; }
    const h = l.match(/^(#{1,4}) (.*)/);
    if (h) html += `<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`;
    else if (item) html += `<li>${inline(item[1])}</li>`;
    else if (l.trim()) html += `<p>${inline(l)}</p>`;
  }
  return html + (lista ? '</ul>' : '') + (codigo ? '</pre>' : '');
}

// Decisões da conversa (hook ~/.claude/hooks/decisoes.py): a mais recente primeiro.
const decisoesDa = (sid) => {
  if (!sid) return [];
  const l = ler(path.join(sessao.pasta(sid), '.decisoes.json'), []);
  return Array.isArray(l) ? l.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))) : [];
};
const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

const docsDaConversa = (sid) => (sid ? require('./documentos')._teste.listar(sessao.pasta(sid)) : []);
const chaveDo = (link) => (link || '').match(/[A-Z][A-Z0-9]+-\d+/i)?.[0].toUpperCase() || '';
const dataBr = (ms) => new Date(ms).toLocaleDateString('pt-BR');

// ── Telas ──
const estilo = ESTILO_NOTAS + `<style>
  html, body { height: 100%; }
  body { display: flex; flex-direction: column; }
  .rolagem { flex: 1; min-height: 0; overflow-y: auto; }
  .tipo { flex: none; font-size: 9.5px; font-weight: 600; padding: 1px 7px; border-radius: 9px; color: var(--cor); background: color-mix(in srgb, var(--cor) 15%, transparent); }
  .t-tecnico { --cor: #7c8cff; } .t-funcional { --cor: #e3a43b; } .t-spec { --cor: #2fa5a0; }
  .secundario { flex: none; height: 34px; padding: 0 12px; border-radius: var(--r-md); font-size: 12px; font-weight: 600;
    color: #2fa5a0 !important; border: 1px solid color-mix(in srgb, #2fa5a0 55%, transparent) !important; background: var(--surface) !important; box-shadow: var(--sombra); }
  .secundario:hover { background: color-mix(in srgb, #2fa5a0 14%, transparent) !important; }
  /* Constituição: os 7 passos do SDD — cinza até acontecer */
  .sdd-topo { font-size: 11.5px; color: var(--text-dim); margin-bottom: 10px; line-height: 1.5; }
  .sdd-topo b { color: var(--text); }
  .passos { display: flex; flex-direction: column; gap: 8px; }
  .passo { border-radius: var(--r-lg); border: 1px solid var(--border); background: var(--surface-2); padding: 9px 10px; }
  .passo .cab { display: flex; align-items: center; gap: 8px; }
  .num { flex: none; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
    background: var(--border); color: var(--text-dim); }
  .passo .nome { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; }
  .passo .st { flex: none; font-size: 10px; padding: 1px 7px; border-radius: 9px; border: 1px solid var(--border); color: var(--text-dim); }
  .passo .corpo-passo { margin: 8px 0 0 30px; font-size: 11.5px; color: var(--text-dim); line-height: 1.55; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
  .chip { font-size: 10.5px; padding: 0 7px; border-radius: 8px; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .chip.alerta { color: var(--perigo); border-color: color-mix(in srgb, var(--perigo) 45%, transparent); }
  .arquivo { display: inline-flex; gap: 2px; margin-top: 6px; }
  .acoes-passo { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .acoes-passo button { height: 26px; padding: 0 10px; border-radius: var(--r-md); font-size: 11.5px; font-weight: 600; border: 1px solid var(--border) !important; background: var(--surface) !important; color: var(--text); }
  .acoes-passo button.aprovar { background: var(--ok) !important; color: #fff; border-color: transparent !important; }
  .acoes-passo button:disabled, .acoes-passo button.travado { opacity: .45; cursor: not-allowed; }
  .motivo { color: var(--perigo); }
  .lista-mini { margin: 4px 0 0; padding-left: 14px; }
  .lista-mini li { margin: 2px 0; }
  .s-pendente { opacity: .45; filter: grayscale(1); }
  .s-em_andamento { border-color: var(--accent); animation: pulsa 1.6s infinite; }
  .s-em_andamento .num { background: var(--accent); color: #fff; }
  @keyframes pulsa { 50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); } }
  .s-aguardando_revisao { border-color: #e3a43b; }
  .s-aguardando_revisao .num { background: #e3a43b; color: #1a1a1a; }
  .s-aguardando_revisao .st { color: #e3a43b; border-color: color-mix(in srgb, #e3a43b 50%, transparent); }
  .s-aprovado { border-color: color-mix(in srgb, var(--ok) 55%, transparent); background: color-mix(in srgb, var(--ok) 8%, var(--surface-2)); }
  .s-aprovado .num { background: var(--ok); color: #fff; }
  .s-aprovado .st { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
  .s-desatualizado { border-color: #e8833a; }
  .s-desatualizado .num { background: #e8833a; color: #fff; }
  .s-desatualizado .st { color: #e8833a; border-color: color-mix(in srgb, #e8833a 50%, transparent); }
  .cartoes > li { display: flex; align-items: center; gap: 10px; cursor: pointer; }
  .cartoes .corpo { flex: 1; min-width: 0; }
  .cartoes .nome { font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; }
  .cartoes .nome span:first-child { overflow: hidden; text-overflow: ellipsis; }
  .cartoes .det { font-size: 10.5px; color: var(--text-dim); margin-top: 3px; display: flex; gap: 8px; }
  .chave { font-family: var(--vscode-editor-font-family); color: var(--accent); font-weight: 600; }
  .aguardando { color: #e3a43b; }
  /* Detalhe */
  .menu { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; max-width: 100%; }
  .menu .fb-btn { flex: none; padding: 0 6px; font-size: 11.5px; }
  .menu::-webkit-scrollbar { display: none; }
  .aba[hidden] { display: none; }
  .folha { padding: 12px 14px; }
  .folha h3 { margin: 0 0 6px; font-size: 13px; }
  .linha-doc { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-radius: var(--r-md); cursor: pointer; }
  .linha-doc:hover { background: var(--surface-2); }
  .sigla { flex: none; width: 30px; height: 30px; border-radius: var(--r-md); display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700;
    color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .linha-doc .nome { flex: 1; min-width: 0; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .linha-doc .mini { opacity: 0; }
  .linha-doc:hover .mini { opacity: 1; }
  .vazio-aba { color: var(--text-dim); font-size: 12px; line-height: 1.6; text-align: center; padding: 18px 6px; }
  .acoes-aba { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .md { font-size: 12.5px; line-height: 1.55; }
  .md h3, .md h4, .md h5, .md h6 { margin: .8em 0 .3em; } .md h3:first-child { margin-top: 0; }
  .md pre { background: var(--surface-2); padding: 8px; border-radius: var(--r-md); white-space: pre-wrap; font-size: 11.5px; }
  .md code { font-family: var(--vscode-editor-font-family); font-size: .92em; }
  .md ul { padding-left: 1.3em; margin: .3em 0; }
  .ticket-link { font-family: var(--vscode-editor-font-family); font-size: 13px; color: var(--accent); word-break: break-all; }
  /* Notas: o post-it das Notas */
  .post-it { margin: 0 12px 12px; border-radius: var(--r-lg); background: #FEFDE8; color: #2a2a2a; box-shadow: var(--sombra); display: flex; flex-direction: column; min-height: 260px; }
  #ed { flex: 1; outline: none; padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.55; }
  #ed:empty::before { content: 'Notas do refinamento…'; color: rgba(0,0,0,.4); }
  #ed h2 { font-size: 1.2em; margin: .6em 0 .3em; border-bottom: 1px solid rgba(0,0,0,.12); }
  #ed ol, #ed ul { padding-left: 1.5em; }
  /* TODO: quadro do Atelier (widget-node.css .todo-*) */
  .todo-bar { display: flex; align-items: center; gap: 4px; }
  .todo-input { flex: 1; min-width: 0; height: 26px; background: var(--surface-2); color: var(--text); border: 1px solid var(--border); border-radius: var(--r-sm); padding: 0 8px; font: inherit; font-size: 12px; }
  .todo-input:focus { outline: none; border-color: var(--accent); }
  .todo-mode { flex-shrink: 0; height: 26px; background: none; border: 1px solid var(--border); border-radius: var(--r-sm); color: var(--text-dim); font-size: 11px; padding: 0 8px; }
  .todo-columns { display: flex; gap: 6px; margin-top: 10px; }
  .todo-column { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 4px; border-radius: var(--r-md); padding: 4px; min-height: 60px; }
  .todo-column.is-target { background: var(--surface-2); }
  .todo-column-title { display: flex; align-items: center; gap: 6px; margin: 0 0 2px; padding: 0 2px; font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-dim); }
  .todo-count { font-weight: 400; letter-spacing: 0; padding: 0 4px; border-radius: var(--r-sm); background: var(--surface-2); }
  .todo-card { position: relative; padding: 6px 22px 6px 8px; border-radius: var(--r-sm); background: var(--surface-2); border: 1px solid var(--border); cursor: grab; font-size: 12px; word-break: break-word; }
  .todo-card:active { cursor: grabbing; }
  .todo-remove { position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; padding: 0; border: 0; border-radius: var(--r-sm); background: none; color: var(--perigo); opacity: 0; }
  .todo-card:hover .todo-remove, .todo-line:hover .todo-remove { opacity: 1; }
  .todo-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .todo-list-items { list-style: none; margin: 4px 0 0; padding: 0; }
  .todo-line { position: relative; display: flex; align-items: baseline; gap: 8px; padding: 3px 22px 3px 2px; font-size: 12.5px; }
  .todo-line-title { flex: 1; word-break: break-word; }
  .todo-line-title.is-done { color: var(--text-dim); text-decoration: line-through; }
  .todo-empty { padding: 16px; text-align: center; color: var(--text-dim); font-size: 11.5px; }
  /* Decisões: histórico; clique expande o resumo embaixo */
  .hist { display: flex; flex-direction: column; }
  .decisao { border-left: 2px solid var(--border); margin-left: 4px; padding: 0 0 2px 12px; position: relative; }
  .decisao::before { content: ''; position: absolute; left: -5px; top: 9px; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
  .decisao summary { list-style: none; cursor: pointer; display: flex; align-items: baseline; gap: 8px; padding: 5px 6px; border-radius: var(--r-md); }
  .decisao summary::-webkit-details-marker { display: none; }
  .decisao summary:hover { background: var(--surface-2); }
  .quando { flex: none; font-family: var(--vscode-editor-font-family); font-size: 10.5px; color: var(--text-dim); }
  .dtitulo { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .decisao[open] .dtitulo { white-space: normal; }
  .origem { flex: none; font-size: 9.5px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--border); color: var(--text-dim); }
  .o-pergunta { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .dresumo { margin: 2px 6px 10px; padding: 8px 10px; border-radius: var(--r-md); background: var(--surface-2); font-size: 12px; line-height: 1.55; }
  .dresumo p { margin: 0 0 6px; }
  .dtrecho { font-size: 11.5px; color: var(--text-dim); }
  .dtrecho .esc { color: var(--ok); }
  /* Rodapé (por enquanto sem conteúdo) */
  .rodape { flex: none; height: 26px; border-top: 1px solid var(--border); background: var(--surface); }
</style>`;

const telaLista = (refs) => `${estilo}
  <div class="rolagem">
  <div class="topo"><span class="rotulo">Refinamentos</span><span class="titulo"></span>
    <span class="extra">${refs.length ? `${refs.length} refinamento${refs.length === 1 ? '' : 's'}` : ''}</span></div>
  <div class="barras"><span class="dica">${refs.length ? 'do mais recente para o mais antigo' : ''}</span><span class="espaco"></span>
    <button class="primario" data-acao="novo">＋ Refinamento</button></div>
  ${refs.length ? `<ul class="cartoes">${refs.map((r) => `<li data-acao="abrir" data-id="${esc(r.id)}" title="Abrir o refinamento">
    <div class="corpo">
      <div class="nome"><span>${esc(r.titulo)}</span><span class="tipo t-${esc(r.tipo)}">${TIPOS[r.tipo]}</span></div>
      <div class="det">${r.ticket ? `<span class="chave">${esc(chaveDo(r.ticket) || 'ticket')}</span>` : ''}<span>${dataBr(r.criado)}</span>
        ${r.sid ? '' : '<span class="aguardando">● aguardando a primeira mensagem</span>'}</div>
    </div>
    <span class="mini">
      <button data-acao="mencionar" data-id="${esc(r.id)}" title="Mencionar no Claude">@</button>
      <button data-acao="editar" data-id="${esc(r.id)}" title="Editar">✎</button>
      <button class="perigo" data-acao="excluir" data-id="${esc(r.id)}" title="Excluir">✕</button>
    </span></li>`).join('')}</ul>`
    : '<div class="folha"><div class="centro"><div class="icone">🧭</div>Nenhum refinamento ainda.<br>Clique em <b>＋ Refinamento</b>.</div></div>'}
  </div>
  <div class="rodape"></div>`;

const ABAS = [['docs', 'Docs'], ['ticket', 'Ticket'], ['backend', 'Backend'], ['mobile', 'Mobile'], ['notas', 'Notas'], ['todo', 'TODO'], ['decisoes', 'Decisões']];
const abasDo = (r) => (r.tipo === 'spec' ? [...ABAS, ['constituicao', 'Constituição']] : ABAS);

function telaConstituicao(r, est, abertos) {
  if (!est) return `<div class="vazio-aba">A spec ainda não foi iniciada.<br>Clique em <b>▶ Iniciar spec</b>: o Claude cria <code>specs/NNN-…/</code> em ${esc(path.basename(r.spec?.repo || 'repositório'))} e começa pelo passo 0.</div>`;
  const abertas = est.perguntas.filter((q) => q.status === 'aberta');
  const bloq = est.achados.filter((a) => a.severidade === 'bloqueante' && a.status === 'aberto');
  const ROTULO = { regras: 'regras', proibicoes: 'proibições', secoes: 'seções', rfs: 'requisitos', historias: 'histórias', bordas: 'casos de borda',
    tecnologias: 'tecnologias', endpoints: 'endpoints', entidades: 'entidades', violacoes: 'violações', tarefas: 'tarefas', feitas: 'feitas',
    ultimaTarefa: 'última tarefa', ultimoCommit: 'último commit' };
  const vivo = vigiando(r);
  const chip = (k, v, alerta) => `<span class="chip ${alerta ? 'alerta' : ''}">${esc(ROTULO[k] || k)}: ${esc(Array.isArray(v) ? v.join(', ') : v)}</span>`;
  return `<div class="sdd-topo"><b>${esc(est.feature)}</b> · ${esc(path.basename(r.spec.repo))}<br>Próxima ação: ${esc(est.proximaAcao || '')}</div>
  <div class="passos">${est.passos.map((p) => {
    const lido = abertos.has(`${r.id}:${p.n}:${p.hash}`);
    const portaoFechado = p.n === 2 ? abertas.length : p.n === 5 ? bloq.length : 0;
    const resumo = Object.entries(p.resumo || {}).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length));
    const extra = p.n === 2 && est.perguntas.length ? `<ul class="lista-mini">${est.perguntas.map((q) => `<li><b>${esc(q.id)}</b> ${esc(q.pergunta)} — ${q.status === 'respondida' ? esc(q.resposta) : `<i>${esc(q.status)}</i>`}</li>`).join('')}</ul>`
      : p.n === 5 && est.achados.length ? `<ul class="lista-mini">${est.achados.map((a) => `<li><b>${esc(a.id)}</b> [${esc(a.severidade)}] ${esc(a.descricao)} — <i>${esc(a.status)}</i></li>`).join('')}</ul>`
      : p.n === 6 && est.tarefas.length ? `<div>Tarefas feitas: ${est.tarefas.filter((t) => t.status === 'feita').length}/${p.resumo?.tarefas || est.tarefas.length}</div>` : '';
    return `<div class="passo s-${esc(p.status)}">
      <div class="cab"><span class="num">${p.n}</span><span class="nome">${esc(p.titulo)}${p.portao ? ` · Portão ${p.portao}` : ''}</span>
        <span class="st">${STATUS[p.status] || esc(p.status)}${p.versao ? ` · v${esc(p.versao)}` : ''}</span></div>
      ${p.status === 'pendente' ? '' : `<div class="corpo-passo">
        ${resumo.length ? `<div class="chips">${resumo.map(([k, v]) => chip(k, v, /viola|bloque|abertas/.test(k) && Number(v) > 0)).join('')}</div>` : ''}
        ${p.status === 'aprovado' ? `<div>Aprovado por <b>${esc(p.aprovadoPor || '')}</b> em ${esc(quando(p.aprovadoEm))}</div>` : ''}
        ${p.status === 'desatualizado' ? `<div class="motivo">${esc(p.motivoDesatualizado || '')}</div>` : ''}
        ${p.status === 'aguardando_revisao' && portaoFechado ? `<div class="motivo">Portão fechado: ${p.n === 2 ? `${abertas.length} pergunta(s) aberta(s)` : `${bloq.length} achado(s) bloqueante(s)`}
          <ul class="lista-mini">${(p.n === 2 ? abertas.map((q) => [q.id, q.pergunta]) : bloq.map((a) => [a.id, a.descricao])).map(([id, t]) => `<li><b>${esc(id)}</b> ${esc(t)}</li>`).join('')}</ul>
          <div>Responda/resolva na conversa ou aceite com justificativa.</div></div>` : ''}
        ${extra}
        <div class="format-bar arquivo">
          <button class="fb-btn" data-acao="specAbrir" data-id="${p.n}" title="${esc(p.arquivo)}">Abrir ${esc(path.basename(p.arquivo))}</button>
          <button class="fb-btn" data-acao="specMencionar" data-id="${p.n}" title="Mencionar no Claude">@</button>
          ${p.hashAprovado && p.hash !== p.hashAprovado && fs.existsSync(copiaAprovada(r, p.n)) ? `<button class="fb-btn" data-acao="specMudancas" data-id="${p.n}" title="Diferença para a versão aprovada">Ver mudanças</button>` : ''}
        </div>
        ${p.status === 'aguardando_revisao' ? `<div class="acoes-passo">
          <button class="aprovar ${vivo ? '' : 'travado'}" data-acao="specAprovar" data-id="${p.n}" ${!vivo || (lido && !portaoFechado) ? '' : 'disabled'}
            title="${!vivo ? 'O Claude não está esperando: clique em ▶ Continuar spec' : !lido ? 'Abra o arquivo antes de aprovar: nunca aprove sem ler' : portaoFechado ? 'Resolva as pendências do portão' : 'Aprovar este passo'}">Aprovar</button>
          <button data-acao="specAjuste" data-id="${p.n}">Pedir ajuste</button></div>` : ''}
        ${p.status === 'desatualizado' ? `<div class="acoes-passo"><button data-acao="specContinuar">Reconciliar</button></div>` : ''}
      </div>`}
    </div>`;
  }).join('')}</div>`;
}

function telaDetalhe(r, d) {
  const docs = d.docs.length ? d.docs.map((x) => `<div class="linha-doc" data-acao="docAbrir" data-id="${esc(x.nome)}" title="${esc(x.origem || x.full)}">
      <span class="sigla">${esc(path.extname(x.nome).slice(1, 5).toUpperCase() || 'ARQ')}</span><span class="nome">${esc(x.nome)}</span>
      <span class="mini"><button data-acao="docMencionar" data-id="${esc(x.nome)}" title="Mencionar no Claude">@</button></span></div>`).join('')
    : `<div class="vazio-aba">${r.sid ? 'O Claude ainda não criou documentos nesta conversa.' : 'A conversa ainda não começou: abra e envie a primeira mensagem.'}</div>`;
  const handoff = (lado) => {
    const texto = d.handoffs[lado];
    return `<div class="folha">${texto && texto.trim() ? `<div class="md">${markdown(texto)}</div>`
      : `<div class="vazio-aba">Ainda não há handoff do ${lado}.<br>Mencione no Claude e peça para gravar a análise aqui.</div>`}
      <div class="acoes-aba">
        <div class="format-bar">
          <button class="fb-btn" data-acao="handoffMencionar" data-id="${lado}" title="Mencionar o arquivo no Claude">@ Mencionar</button>
          ${texto !== null ? `<span class="fb-sep"></span><button class="fb-btn" data-acao="handoffPrevia" data-id="${lado}">Prévia</button>
          <button class="fb-btn" data-acao="handoffEditar" data-id="${lado}">Editar</button>`
            : `<span class="fb-sep"></span><button class="fb-btn" data-acao="handoffCriar" data-id="${lado}">Criar arquivo</button>`}
        </div>
      </div></div>`;
  };
  const b = d.board, ultima = b.columns.at(-1).id;
  const ord = (st) => b.items.filter((i) => i.status === st).sort((x, y) => x.order - y.order);
  const todo = `<div class="folha">
    <div class="todo-bar">
      <input class="todo-input" id="novaTarefa" placeholder="nova tarefa…">
      <button class="fb-btn" id="addTarefa" title="Adicionar tarefa">＋</button>
      <button class="todo-mode" id="modoTodo" title="Alternar entre quadro e lista">lista</button>
    </div>
    <div id="todoQuadro" class="todo-columns" hidden>${b.columns.map((c) => `<div class="todo-column" data-coluna="${esc(c.id)}">
      <h5 class="todo-column-title">${esc(c.title)}<span class="todo-count">${ord(c.id).length}</span></h5>
      ${ord(c.id).map((i) => `<div class="todo-card" draggable="true" data-item="${esc(i.id)}" title="${esc(i.notes || '')}">${esc(i.title)}
        <button class="todo-remove" data-acao="todo" data-op="remove" data-id="${esc(i.id)}" title="Excluir tarefa">✕</button></div>`).join('')}
    </div>`).join('')}</div>
    <ul id="todoLista" class="todo-list">${b.columns.map((c) => ord(c.id).length ? `<li><h5 class="todo-column-title">${esc(c.title)}</h5><ul class="todo-list-items">
      ${ord(c.id).map((i) => `<li class="todo-line"><input type="checkbox" data-check="${esc(i.id)}" ${i.status === ultima ? 'checked' : ''}>
        <span class="todo-line-title ${i.status === ultima ? 'is-done' : ''}">${esc(i.title)}</span>
        <button class="todo-remove" data-acao="todo" data-op="remove" data-id="${esc(i.id)}" title="Excluir tarefa">✕</button></li>`).join('')}</ul></li>` : '').join('')}
      ${b.items.length ? '' : '<li class="todo-empty">nenhuma tarefa ainda</li>'}</ul>
  </div>`;

  return `${estilo}
  <div class="rolagem">
  <div class="topo"><span class="rotulo">Refinamento</span><span class="titulo" title="${esc(r.titulo)}">${esc(r.titulo)}</span><span class="tipo t-${esc(r.tipo)}">${TIPOS[r.tipo]}</span></div>
  <div class="barras">
    <div class="format-bar"><button class="fb-btn" data-acao="voltar">← Refinamentos</button></div>
    <span class="espaco"></span>
    ${r.tipo === 'spec' ? `<button class="secundario" data-acao="specContinuar" title="Guia a criação da spec no Claude (plugin sdd)">▶ ${d.estado ? 'Continuar spec' : 'Iniciar spec'}</button>` : ''}
    <button class="primario" data-acao="conversa" title="${r.sid ? 'Abrir a conversa do Claude deste refinamento' : 'A conversa ainda não começou'}">✳ Abrir conversa</button>
  </div>
  <div class="barras"><div class="format-bar menu">${abasDo(r).map(([id, nome]) => `<button class="fb-btn" data-aba="${id}">${nome}</button>`).join('')}</div></div>
  <div class="aba" data-conteudo="docs"><div class="folha">${docs}</div></div>
  <div class="aba" data-conteudo="ticket"><div class="folha">${r.ticket
    ? `<h3>${esc(chaveDo(r.ticket) || 'Ticket')}</h3><div class="ticket-link">${esc(r.ticket)}</div>`
    : '<div class="vazio-aba">Nenhum ticket vinculado.</div>'}
    <div class="acoes-aba"><div class="format-bar">
      ${r.ticket ? `<button class="fb-btn" data-acao="jira">Abrir no Jira ↗</button><button class="fb-btn" data-acao="ticketMencionar">@ Mencionar</button><span class="fb-sep"></span>` : ''}
      <button class="fb-btn" data-acao="ticketEditar">${r.ticket ? 'Trocar link' : 'Vincular ticket'}</button></div></div></div></div>
  <div class="aba" data-conteudo="backend">${handoff('backend')}</div>
  <div class="aba" data-conteudo="mobile">${handoff('mobile')}</div>
  <div class="aba" data-conteudo="notas">
    <div class="barras"><div class="format-bar">
      <button class="fb-btn" data-cmd="titulo" title="Título"><b>T</b></button>
      <button class="fb-btn" data-cmd="insertOrderedList" title="Lista numerada">1.</button>
      <button class="fb-btn" data-cmd="insertUnorderedList" title="Lista com marcador">•</button>
      <span class="fb-sep"></span>
      <button class="fb-btn" data-acao="notasMencionar" title="Mencionar as notas no Claude">@</button>
    </div><span class="espaco"></span><span class="dica" id="estado">Salvo</span></div>
    <div class="post-it"><div id="ed" contenteditable="true" spellcheck="false"></div></div>
  </div>
  <div class="aba" data-conteudo="todo">${todo}</div>
  <div class="aba" data-conteudo="decisoes"><div class="folha">${d.decisoes.length ? `<div class="hist">${d.decisoes.map((x) => `
    <details class="decisao" data-dec="${esc(x.id)}">
      <summary><span class="quando">${esc(quando(x.data))}</span><span class="dtitulo">${esc(x.titulo)}</span>
        <span class="origem o-${esc(x.origem)}">${x.origem === 'pergunta' ? 'Pergunta' : 'Chat'}</span></summary>
      <div class="dresumo"><p>${esc(x.resumo || '')}</p>
        ${x.origem === 'pergunta' && x.detalhes ? `<div class="dtrecho"><b>Opções:</b> ${(x.detalhes.opcoes || []).map((o) => o === x.detalhes.escolha ? `<b class="esc">${esc(o)}</b>` : esc(o)).join(' · ')}${x.detalhes.notas ? `<br><b>Observação:</b> ${esc(x.detalhes.notas)}` : ''}</div>` : ''}
        ${x.origem === 'chat' && x.detalhes?.mensagem ? `<div class="dtrecho"><b>Mensagem:</b> “${esc(x.detalhes.mensagem.slice(0, 500))}”</div>` : ''}
      </div>
    </details>`).join('')}</div>`
    : `<div class="vazio-aba">${r.sid ? 'Nenhuma decisão registrada ainda.<br>Elas aparecem quando você responde uma pergunta do Claude ou pede para ele fazer diferente.' : 'A conversa ainda não começou.'}</div>`}</div></div>
  ${r.tipo === 'spec' ? `<div class="aba" data-conteudo="constituicao"><div class="folha">${telaConstituicao(r, d.estado, d.abertos)}</div></div>` : ''}
  </div>
  </div>
  <div class="rodape"></div>`;
}

function pagina(nonce, corpo, notasHtml) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>body { font-family: var(--vscode-font-family); margin: 0; } button { font: inherit; cursor: pointer; border: 0; background: none; color: inherit; } [hidden] { display: none !important; }</style></head><body>${corpo}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const enviar = (m) => vscode.postMessage(m);
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-acao]');
    if (!el) return;
    e.stopPropagation();
    enviar({ acao: el.dataset.acao, id: el.dataset.id, op: el.dataset.op });
  });

  // Abas do refinamento: a escolhida sobrevive ao redesenho.
  const botoesAba = [...document.querySelectorAll('[data-aba]')];
  const mostrarAba = (id) => {
    botoesAba.forEach((b) => b.classList.toggle('is-on', b.dataset.aba === id));
    document.querySelectorAll('[data-conteudo]').forEach((c) => { c.hidden = c.dataset.conteudo !== id; });
    vscode.setState({ ...(vscode.getState() || {}), aba: id });
  };
  if (botoesAba.length) {
    botoesAba.forEach((b) => b.addEventListener('click', () => mostrarAba(b.dataset.aba)));
    mostrarAba((vscode.getState() || {}).aba || 'docs');
  }

  // Decisões abertas continuam abertas depois do redesenho.
  const abertas = new Set((vscode.getState() || {}).decisoes || []);
  document.querySelectorAll('[data-dec]').forEach((d) => {
    if (abertas.has(d.dataset.dec)) d.open = true;
    d.addEventListener('toggle', () => {
      d.open ? abertas.add(d.dataset.dec) : abertas.delete(d.dataset.dec);
      vscode.setState({ ...(vscode.getState() || {}), decisoes: [...abertas] });
    });
  });

  // Notas
  const ed = document.getElementById('ed');
  if (ed) {
    ed.innerHTML = ${JSON.stringify(notasHtml || '').replace(/</g, '\\u003c')};
    document.execCommand('defaultParagraphSeparator', false, 'div');
    const estado = document.getElementById('estado');
    let t;
    const salvar = () => { clearTimeout(t); estado.textContent = 'Salvando…'; t = setTimeout(() => { enviar({ acao: 'notas', html: ed.innerHTML }); estado.textContent = 'Salvo'; }, 300); };
    ed.addEventListener('input', salvar);
    ed.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
    document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('mousedown', (e) => {
      e.preventDefault(); ed.focus();
      if (b.dataset.cmd === 'titulo') document.execCommand('formatBlock', false, document.queryCommandValue('formatBlock') === 'h2' ? 'div' : 'h2');
      else document.execCommand(b.dataset.cmd);
      salvar();
    }));
  }

  // TODO (como o painel do Atelier): campo + ＋, quadro ⇄ lista, arrastar entre colunas, caixa = última coluna.
  const nova = document.getElementById('novaTarefa');
  if (nova) {
    const add = () => { const v = nova.value.trim(); if (v) { vscode.setState({ ...(vscode.getState() || {}), aba: 'todo' }); enviar({ acao: 'todo', op: 'add', titulo: v }); } };
    nova.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    document.getElementById('addTarefa').addEventListener('click', add);
    const quadroEl = document.getElementById('todoQuadro'), listaEl = document.getElementById('todoLista'), modo = document.getElementById('modoTodo');
    const usarModo = (m) => { quadroEl.hidden = m !== 'quadro'; listaEl.hidden = m === 'quadro'; modo.textContent = m; vscode.setState({ ...(vscode.getState() || {}), todo: m }); };
    usarModo((vscode.getState() || {}).todo || 'lista');
    modo.addEventListener('click', () => usarModo(quadroEl.hidden ? 'quadro' : 'lista'));
    document.querySelectorAll('[data-check]').forEach((c) => c.addEventListener('change', () =>
      enviar({ acao: 'todo', op: 'move', id: c.dataset.check, status: c.checked ? 'ultima' : 'primeira' })));
    document.querySelectorAll('.todo-card').forEach((card) => card.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', card.dataset.item)));
    document.querySelectorAll('.todo-column').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('is-target'); });
      col.addEventListener('dragleave', () => col.classList.remove('is-target'));
      col.addEventListener('drop', (e) => { e.preventDefault(); col.classList.remove('is-target'); enviar({ acao: 'todo', op: 'move', id: e.dataTransfer.getData('text/plain'), status: col.dataset.coluna }); });
    });
  }
</script></body></html>`;
}

// ── Vínculo com a conversa ──
const projeto = () => require('./conversas')._teste.projeto();
const jsonl = (sid) => path.join(projeto(), `${sid}.jsonl`);
function inicioDa(sid) {
  const t = (lerTexto(jsonl(sid)) || '').match(/"timestamp":"([^"]+)"/)?.[1];
  return t ? Date.parse(t) : Date.now();
}
const pedidoDe = (r) => (r.tipo === 'spec' ? `/sdd:iniciar ${pasta(r.id)} ${r.spec?.repo || ''}` : `Refinamento ${TIPOS[r.tipo].toLowerCase()}: ${r.titulo}${r.ticket ? `\nTicket: ${r.ticket}` : ''}\n`
  + `Pasta do refinamento: ${pasta(r.id)} — grave a análise do backend em ${HANDOFF.backend} e a do mobile em ${HANDOFF.mobile}.`);

// Conversa com histórico, criada depois do refinamento, que menciona a pasta dele (a mais antiga, a primeira aberta).
function localizarConversa(r) {
  let nomes;
  try { nomes = fs.readdirSync(projeto()).filter((n) => n.endsWith('.jsonl')); } catch { return null; }
  const achadas = nomes.map((n) => path.join(projeto(), n))
    .filter((f) => { try { return fs.statSync(f).mtimeMs >= r.criado - 5000; } catch { return false; } })
    .filter((f) => (lerTexto(f) || '').includes(pasta(r.id)))
    .map((f) => ({ sid: path.basename(f, '.jsonl'), inicio: inicioDa(path.basename(f, '.jsonl')) }))
    .filter((c) => c.inicio >= r.criado - 5000)
    .sort((a, b) => a.inicio - b.inicio);
  return achadas[0]?.sid || null;
}

// Título do refinamento na conversa: a mesma linha que o /rename do Claude grava (custom-title vence o ai-title).
function titularConversa(sid, titulo, tentativas = 20) {
  const arq = jsonl(sid);
  if (!fs.existsSync(arq)) { if (tentativas) setTimeout(() => titularConversa(sid, titulo, tentativas - 1), 1500); return; }
  const atual = fs.readFileSync(arq, 'utf8');
  fs.appendFileSync(arq, (atual.endsWith('\n') ? '' : '\n') + JSON.stringify({ type: 'custom-title', sessionId: sid, customTitle: titulo }) + '\n');
}

exports.provider = () => {
  let view, aberto = null; // id do refinamento aberto; null = lista
  const abertos = new Set(); // passos cujo arquivo o humano abriu nesta sessão (refinamento:passo:hash)
  let observador;

  const render = () => {
    if (!view) return;
    observador?.close();
    observador = null;
    const nonce = crypto.randomBytes(16).toString('hex');
    const r = aberto && meta(aberto);
    if (!r) { aberto = null; view.webview.html = pagina(nonce, telaLista(listar())); return; }
    // Confere os arquivos da spec antes de desenhar: edição depois de aprovado volta o passo para revisão,
    // mesmo que o hook do plugin não tenha rodado (edição por fora, outra conversa).
    if (r.tipo === 'spec' && dirSpec(r) && fs.existsSync(path.join(dirSpec(r), 'sdd-state.json')) && sddState()) {
      try { require('child_process').execFileSync(sddState(), ['check', '--ref', pasta(r.id)], { timeout: 5000, stdio: 'ignore' }); } catch {}
    }
    const d = {
      docs: docsDaConversa(r.sid),
      handoffs: { backend: lerTexto(path.join(pasta(r.id), HANDOFF.backend)), mobile: lerTexto(path.join(pasta(r.id), HANDOFF.mobile)) },
      board: quadro(r.id),
      decisoes: decisoesDa(r.sid),
      estado: r.tipo === 'spec' ? estadoSpec(r) : null,
      abertos
    };
    view.webview.html = pagina(nonce, telaDetalhe(r, d), lerTexto(path.join(pasta(r.id), 'notas.html')));
    // O Claude grava handoff e mexe no todo.json por fora: redesenha quando o arquivo muda (as notas não, para não atropelar a digitação).
    try {
      let espera;
      observador = fs.watch(pasta(r.id), (_, nome) => {
        if (nome === 'notas.html' || nome === 'meta.json') return;
        clearTimeout(espera);
        espera = setTimeout(render, 300);
      });
      // Estado da spec muda pelo Claude (sdd-state) no repositório.
      if (dirSpec(r) && fs.existsSync(dirSpec(r))) {
        // Qualquer arquivo da spec (e a constituição, na raiz do repo): o render roda o check e o estado se ajusta.
        const obsSpec = fs.watch(dirSpec(r), (_, nome) => { if (nome && !nome.endsWith('.tmp')) { clearTimeout(espera); espera = setTimeout(render, 400); } });
        const obsConst = fs.watch(r.spec.repo, (_, nome) => { if (nome === 'constitution.md') { clearTimeout(espera); espera = setTimeout(render, 400); } });
        const fecharS = observador.close.bind(observador);
        observador.close = () => { fecharS(); obsSpec.close(); obsConst.close(); };
      }
      // Decisões chegam pelo hook na pasta da conversa.
      if (r.sid) {
        const obsDec = fs.watch(sessao.pasta(r.sid), (_, nome) => { if (nome === '.decisoes.json') { clearTimeout(espera); espera = setTimeout(render, 300); } });
        const fechar = observador.close.bind(observador);
        observador.close = () => { fechar(); obsDec.close(); };
      }
    } catch {}
  };

  const perguntar = async (r = {}) => {
    const titulo = await vscode.window.showInputBox({ title: 'Título do refinamento', value: r.titulo, ignoreFocusOut: true, validateInput: (v) => (v.trim() ? null : 'Informe um título') });
    if (!titulo) return null;
    const tipo = await vscode.window.showQuickPick([{ label: 'Técnico', id: 'tecnico' }, { label: 'Funcional', id: 'funcional' },
      { label: 'Spec', id: 'spec', description: 'guiado pelo plugin sdd: constituição → spec → plano → tarefas' }],
      { title: 'Tipo do refinamento', placeHolder: r.tipo ? `atual: ${TIPOS[r.tipo]}` : undefined, ignoreFocusOut: true });
    if (!tipo) return null;
    const ticket = await vscode.window.showInputBox({ title: 'Link do ticket no Jira (opcional)', value: r.ticket || '', placeHolder: 'https://empresa.atlassian.net/browse/WMS-123', ignoreFocusOut: true });
    if (ticket === undefined) return null;
    let spec = r.spec;
    if (tipo.id === 'spec' && !spec?.repo) {
      // Repositório onde a spec vai morar (versionada junto com o código).
      const pastas = (vscode.workspace.workspaceFolders || []).map((f) => ({ label: path.basename(f.uri.fsPath), description: f.uri.fsPath, repo: f.uri.fsPath }));
      const esc2 = await vscode.window.showQuickPick([...pastas, { label: 'Escolher outra pasta…', repo: null }], { title: 'Repositório da spec', ignoreFocusOut: true });
      if (!esc2) return null;
      let repo = esc2.repo;
      if (!repo) {
        const uri = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Usar este repositório' });
        if (!uri) return null;
        repo = uri[0].fsPath;
      }
      spec = { repo };
    }
    return { titulo: titulo.trim(), tipo: tipo.id, ticket: ticket.trim(), ...(spec ? { spec } : {}) };
  };

  const mencionar = (texto) => require('./claude').mencionar(texto);
  const referencia = (r) => `[Refinamento ${TIPOS[r.tipo].toLowerCase()} "${r.titulo}"${r.ticket ? ` · ticket ${chaveDo(r.ticket)} (${r.ticket})` : ''} · pasta ${pasta(r.id)}: grave a análise do backend em ${HANDOFF.backend} e a do mobile em ${HANDOFF.mobile}; notas em notas.html; TODO em todo.json (quadro do Atelier: colunas todo/doing/done)]`;

  const acoes = {
    async novo() {
      const dados = await perguntar();
      if (!dados) return;
      const id = crypto.randomUUID();
      const r = { id, ...dados, sid: null, criado: Date.now() };
      gravar(id, 'meta.json', r);
      aberto = id;
      render();
      // Conversa nova com o pedido já escrito (sem enviar). O vínculo acontece quando a primeira mensagem chega (reconciliar).
      await vscode.commands.executeCommand('claude-vscode.editor.open', undefined, pedidoDe(r));
    },
    abrir({ id }) { aberto = id; render(); },
    voltar() { aberto = null; render(); },
    mencionar({ id }) { const r = meta(id); if (r) mencionar(referencia(r)); },
    async editar({ id }) {
      const r = meta(id);
      const dados = r && await perguntar(r);
      if (!dados) return;
      gravar(id, 'meta.json', { ...r, ...dados });
      if (r.sid && dados.titulo !== r.titulo) titularConversa(r.sid, dados.titulo);
      render();
    },
    async excluir({ id }) {
      const r = meta(id);
      const ok = r && await vscode.window.showWarningMessage(`Excluir o refinamento "${r.titulo}"?`, { modal: true,
        detail: 'Vão para a lixeira: notas, TODO e handoffs do refinamento. A conversa do Claude e os documentos dela continuam (dá para excluir na aba Conversas).' }, 'Excluir');
      if (!ok) return;
      await vscode.workspace.fs.delete(vscode.Uri.file(pasta(id)), { recursive: true, useTrash: true });
      if (aberto === id) aberto = null;
      render();
    },
    // ▶ Iniciar/Continuar spec: cola o comando do plugin na conversa do refinamento (ou numa nova, se ainda não há).
    async specContinuar() {
      reconciliar();
      const r = meta(aberto);
      const texto = estadoSpec(r) ? `/sdd:continuar ${pasta(r.id)}` : pedidoDe(r);
      await vscode.commands.executeCommand('claude-vscode.editor.open', r.sid || undefined, texto);
    },
    specAbrir({ id }) {
      const r = meta(aberto), n = Number(id), est = estadoSpec(r);
      const arq = arquivoPasso(r, n);
      if (!fs.existsSync(arq)) return vscode.window.showWarningMessage(`O arquivo ainda não existe: ${arq}`);
      abertos.add(`${r.id}:${n}:${est?.passos[n]?.hash}`); // libera o Aprovar: só depois de ler
      vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arq));
      render();
    },
    specMudancas({ id }) {
      const r = meta(aberto), n = Number(id), est = estadoSpec(r);
      abertos.add(`${r.id}:${n}:${est?.passos[n]?.hash}`); // ver o diff também conta como leitura
      vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(copiaAprovada(r, n)), vscode.Uri.file(arquivoPasso(r, n)),
        `${path.basename(arquivoPasso(r, n))}: aprovado ↔ atual`);
      render();
    },
    specMencionar({ id }) { const r = meta(aberto); mencionar(`@${arquivoPasso(r, Number(id))}`); },
    async specAprovar({ id }) {
      const r = meta(aberto), n = Number(id), est = estadoSpec(r);
      if (!vigiando(r)) {
        const b = await vscode.window.showWarningMessage('O Claude não está esperando a aprovação (o VS Code foi recarregado ou ele ainda está trabalhando). Clique em ▶ Continuar spec: com a conversa aberta, o Aprovar volta a funcionar em alguns segundos.', 'Continuar spec');
        return b && this.specContinuar();
      }
      if (!abertos.has(`${r.id}:${n}:${est?.passos[n]?.hash}`)) return vscode.window.showWarningMessage('Abra e leia o arquivo antes de aprovar.');
      const ok = await vscode.window.showInformationMessage(`Aprovar o passo ${n} (${est.passos[n].titulo})?`, { modal: true, detail: 'Depois de aprovado, o Claude pode seguir para o próximo passo.' }, 'Aprovar');
      if (!ok) return;
      const bin = sddState();
      if (!bin) return vscode.window.showErrorMessage('Plugin sdd não encontrado (claude plugin install sdd@crafting-local).');
      require('child_process').execFile(bin, ['aprovar', String(n), '--ref', pasta(r.id), '--por', os.userInfo().username], (err, out, errOut) => {
        render();
        if (err) return vscode.window.showErrorMessage(String(errOut || err.message).replace(/^sdd-state: /, ''));
        // O hook Stop do plugin sdd vigia o estado e acorda o Claude da conversa sozinho.
        vscode.window.setStatusBarMessage(`$(check) ${out.trim()} — o Claude já foi acordado`, 6000);
      });
    },
    async specAjuste({ id }) {
      const r = meta(aberto), n = Number(id);
      const bin = sddState();
      if (bin) await new Promise((ok) => require('child_process').execFile(bin, ['ajuste', String(n), '--ref', pasta(r.id), '--motivo', 'pedido na aba'], () => ok()));
      render();
      await vscode.commands.executeCommand('claude-vscode.editor.open', r.sid || undefined, `Ajuste no passo ${n} da spec (${estadoSpec(r)?.passos[n]?.titulo}): `);
    },
    async conversa() {
      reconciliar();
      const r = meta(aberto);
      if (r?.sid) return vscode.commands.executeCommand('claude-vscode.editor.open', r.sid);
      // Ainda sem conversa de verdade: abre de novo a conversa nova com o pedido do refinamento.
      await vscode.commands.executeCommand('claude-vscode.editor.open', undefined, pedidoDe(r));
      vscode.window.showInformationMessage('Abri uma conversa nova com o pedido do refinamento. Envie a primeira mensagem para ela ficar vinculada.');
    },
    docAbrir({ id }) {
      const d = docsDaConversa(meta(aberto)?.sid).find((x) => x.nome === id);
      if (!d || d.quebrado) return;
      const uri = vscode.Uri.file(d.origem || d.full);
      if (/\.md$/i.test(d.nome)) vscode.commands.executeCommand('markdown.showPreview', uri);
      else if (/\.(html?|pdf|docx|xlsx|pptx)$/i.test(d.nome)) vscode.env.openExternal(uri);
      else vscode.commands.executeCommand('vscode.open', uri);
    },
    docMencionar({ id }) {
      const d = docsDaConversa(meta(aberto)?.sid).find((x) => x.nome === id);
      if (d && !d.quebrado) mencionar(`@${d.origem || d.full}`);
    },
    jira() { const r = meta(aberto); if (r?.ticket) vscode.env.openExternal(vscode.Uri.parse(r.ticket)); },
    ticketMencionar() { const r = meta(aberto); if (r?.ticket) mencionar(`${chaveDo(r.ticket)} (${r.ticket})`); },
    async ticketEditar() {
      const r = meta(aberto);
      const ticket = await vscode.window.showInputBox({ title: 'Link do ticket no Jira', value: r.ticket || '', ignoreFocusOut: true });
      if (ticket === undefined) return;
      gravar(r.id, 'meta.json', { ...r, ticket: ticket.trim() });
      render();
    },
    handoffMencionar({ id }) { mencionar(`@${path.join(pasta(aberto), HANDOFF[id])}`); },
    handoffPrevia({ id }) { vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path.join(pasta(aberto), HANDOFF[id]))); },
    handoffEditar({ id }) { vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(pasta(aberto), HANDOFF[id]))); },
    handoffCriar({ id }) {
      const r = meta(aberto);
      gravar(r.id, HANDOFF[id], `# Handoff ${id} — ${r.titulo}\n\n## O que foi analisado\n\n## Arquivos e pontos de alteração\n\n## Riscos e dúvidas\n`);
      acoes.handoffEditar({ id });
    },
    notas({ html }) { if (aberto) gravar(aberto, 'notas.html', html); },
    notasMencionar() { mencionar(`@${path.join(pasta(aberto), 'notas.html')}`); },
    todo(m) {
      const b = quadro(aberto);
      const status = m.status === 'ultima' ? b.columns.at(-1).id : m.status === 'primeira' ? b.columns[0].id : m.status;
      gravar(aberto, 'todo.json', aplicarTodo(b, { type: m.op, title: m.titulo, id: m.id, status }));
      render();
    }
  };

  // Primeira mensagem da conversa nova: vincula ao refinamento que espera por ela e dá a ela o título dele.
  // Vincula cada refinamento à conversa REAL dele: a que tem histórico gravado e cujo texto contém a pasta do
  // refinamento (está no pedido pré-preenchido). O ID que o hook de início vê pode ser de uma conversa que o painel
  // do Claude abriu por dentro e nunca recebeu mensagem: essa não tem histórico e não pode ser reaberta.
  const reconciliar = () => {
    let mudou = false;
    for (const r of listar()) {
      if (r.sid && fs.existsSync(jsonl(r.sid))) continue;
      const sid = localizarConversa(r);
      if (sid === r.sid) continue;
      gravar(r.id, 'meta.json', { ...r, sid });
      if (sid) titularConversa(sid, r.titulo);
      mudou = true;
    }
    if (mudou) render();
  };
  const vincular = () => setTimeout(reconciliar, 1500); // dá tempo de o Claude gravar a primeira mensagem

  return vscode.Disposable.from(
    sessao.onDidChange(vincular),
    { dispose: () => observador?.close() },
    vscode.window.registerWebviewViewProvider('claudeAbas.refinamentos', {
      resolveWebviewView(v) {
        view = v;
        view.webview.options = { enableScripts: true };
        view.webview.onDidReceiveMessage((m) => acoes[m.acao]?.(m));
        view.onDidChangeVisibility(() => { if (view.visible) { reconciliar(); render(); } });
        reconciliar();
        render();
      }
    }, { webviewOptions: { retainContextWhenHidden: true } })
  );
};

exports._teste = { aplicarTodo, quadro, markdown, listar, telaLista, telaDetalhe, pagina, COLUNAS };
