const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { esc } = require('./ticket')._teste;
const jira = require('./ticket').jira;
const { ESTILO_NOTAS } = require('./comandos').ui;
const sessao = require('./sessao');
const tickets = require('./tickets');
const maestro = require('./maestro');
const notas = require('./notas').editor; // o mesmo editor da antiga aba Notas (fonte, tamanho, cores, alinhamento, busca)

// Aba Tickets: a lista e, com um ticket aberto, o ticket ocupando a view inteira —
// cabeçalho fixo (voltar, status no board, ▶ ✦ 🎫, menu), corpo com rolagem própria e rodapé (notificações).
// Comandos, Emulador, Evidências, Cofre e Conversas são de outros módulos: o grupo.js mostra cada um dentro
// da moldura deste painel (moldura()), com o mesmo cabeçalho e rodapé.
// Pasta do ticket (tickets.pasta, mesmo layout da pasta de uma conversa): .ticket.json, documentos, .notas.html,
// .todo.json, .handoff-backend.md, .handoff-mobile.md, .decisoes.json, aprovados/ e .vigia (plugin sdd).
// "Sem ticket": a pasta da conversa atual do Claude (conversas que não são de nenhum ticket).
const SEM_TICKET = '__sem-ticket';
const PRINCIPAL = 'claudeAbas.painel';
const pasta = (id) => tickets.pasta(id);
const pastaDe = (id) => (id === SEM_TICKET ? (sessao.conversaAtual() ? sessao.pasta(sessao.conversaAtual()) : null) : pasta(id));
const ler = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const lerTexto = (arq) => { try { return fs.readFileSync(arq, 'utf8'); } catch { return null; } };
const gravar = (id, nome, dado) => {
  const dir = pastaDe(id);
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, nome), typeof dado === 'string' ? dado : JSON.stringify(dado, null, 2));
};
const HANDOFF = { backend: '.handoff-backend.md', mobile: '.handoff-mobile.md' };
const NOTAS = '.notas.html';
const ORIGEM = '.origem.json'; // { "arquivo.pdf": { origem: 'jira', id: '123' } }: documentos que vieram de fora
const TODO = '.todo.json';
// O ticket com id = chave: as funções da spec (vindas do refinamento) usam r.id para achar a pasta.
const ticketDe = (chave) => { const t = tickets.ler(chave); return t && { ...t, id: chave }; };
const comSpec = (t) => t && { ...t, specPronta: !!(t.spec?.dir && estadoSpec(t)) }; // estadoSpec vem mais abaixo

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
const dirSpec = (r) => (r.spec?.repo && r.spec?.dir ? path.join(r.spec.repo, r.spec.dir) : null);
const estadoSpec = (r) => (dirSpec(r) ? ler(path.join(dirSpec(r), 'sdd-state.json'), null) : null);
const arquivoPasso = (r, n) => (n === 0 ? path.join(r.spec.repo, 'constitution.md')
  : path.join(dirSpec(r), { 1: 'spec.md', 2: 'spec.md', 3: 'plan.md', 4: 'tasks.md', 5: 'analise.md', 6: 'tasks.md' }[n]));
const STATUS = { pendente: 'Pendente', em_andamento: 'Claude trabalhando', aguardando_revisao: 'Aguardando sua revisão', aprovado: 'Aprovado', desatualizado: 'Desatualizado' };


// ── TODO: mesmo modelo do Atelier (shared/types.ts TodoBoard; colunas padrão; ordem esparsa de 1000 em 1000) ──
const COLUNAS = [{ id: 'todo', title: 'A fazer' }, { id: 'doing', title: 'Fazendo' }, { id: 'done', title: 'Feito' }];
const quadro = (id) => {
  const b = ler(path.join(pastaDe(id), TODO), null) || { version: 1, title: 'TODO', columns: COLUNAS, items: [] };
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

const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const decisoesDe = (dir) => {
  const l = dir ? ler(path.join(dir, '.decisoes.json'), []) : [];
  return Array.isArray(l) ? l.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))) : [];
};
const DUVIDAS = '.duvidas.json'; // gravado pelo `sdd-state duvida add` (opção "Tirar dúvida" nas perguntas do Claude)
const duvidasDe = (dir) => { const l = dir ? ler(path.join(dir, DUVIDAS), []) : []; return Array.isArray(l) ? l : []; };
const textoDuvida = (x) => `Dúvida levantada no refinamento: ${x.texto}${x.contexto ? `\nContexto: ${x.contexto}` : ''}`;
const docsDe = (dir) => (dir ? require('./documentos')._teste.listar(dir) : []);

// ── Telas ──
const IC = {
  voltar: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3L5 8l5 5"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2.8v10.4L13 8z"/></svg>',
  pausa: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="3" width="3" height="10" rx="1"/></svg>',
  claude: '<svg viewBox="0 0 24 24" fill="#d97757"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>',
  jira: '<svg viewBox="0 0 24 24" fill="none" stroke="#4a9eed" stroke-width="1.8"><path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4z"/></svg>',
  atualizar: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13 8a5 5 0 11-1.5-3.6M13 2.5v2.8h-2.8"/></svg>',
  sino: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 11V7a4 4 0 018 0v4l1 1H3z"/><path d="M6.5 13.5a1.5 1.5 0 003 0"/></svg>',
  grade: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/></svg>',
  lixo: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/></svg>'
};

const ABAS = [['docs', 'Docs'], ['spec', 'Spec'], ['ticket', 'Ticket'], ['analise', 'Análise'], ['todo', 'TODO'], ['decisoes', 'Decisões'], ['duvidas', 'Dúvidas']];
const ABAS_SEM_TICKET = [['docs', 'Docs'], ['decisoes', 'Decisões']];
const FORA = () => require('./grupo')._teste.GRUPOS['claudeAbas.tickets'].slice(1); // [id da seção, nome]

// Cabeçalho e rodapé do ticket aberto: na página do painel os botões falam com ele direto (data-acao);
// na moldura de outra seção, passam pelo grupo.js (data-painel / data-secao).
const CSS_MOLDURA = `<style>
  .ct-cab { position: sticky; top: 0; z-index: 100; flex: none; padding: 8px 10px 0; background: var(--vscode-sideBar-background, #181818);
    border-bottom: 1px solid var(--vscode-widget-border, #3a3a42); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--vscode-foreground); }
  .ct-linha { display: flex; align-items: center; gap: 4px; }
  .ct-titulo { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ct-titulo .ct-chave { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #007aff; }
  .ct-ico { flex: none; width: 28px; height: 28px; padding: 0; border: 1px solid transparent; border-radius: 6px; background: none; cursor: pointer;
    color: var(--vscode-foreground); display: inline-flex; align-items: center; justify-content: center; }
  .ct-ico:hover { background: var(--vscode-toolbar-hoverBackground, #2a2a30); border-color: var(--vscode-widget-border, #3a3a42); }
  .ct-ico svg { width: 16px; height: 16px; }
  .ct-ico.ct-play { color: #a371f7; }
  .ct-ico.ct-pausa { color: #e3a43b; }
  .ct-dar { flex: none; height: 26px; padding: 0 10px; border: 0; border-radius: 6px; background: #a371f7; color: #fff; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
    animation: ct-chama 1.4s infinite; }
  .ct-dar:disabled { background: color-mix(in srgb, #a371f7 35%, transparent); animation: none; cursor: default; font-weight: 400; }
  @keyframes ct-chama { 50% { box-shadow: 0 0 0 4px color-mix(in srgb, #a371f7 30%, transparent); } }
  /* Modo refinamento: borda roxa em volta da view inteira */
  .ct-roxo { position: fixed; inset: 0; border: 2px solid #a371f7; border-radius: 4px; pointer-events: none; z-index: 300;
    box-shadow: inset 0 0 14px color-mix(in srgb, #a371f7 22%, transparent); }
  /* Pills do topo: coluna do ticket no Jira e modo refinamento, lado a lado à esquerda */
  .ct-pills { margin: 8px 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .ct-pill { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 10px; border-radius: 999px; font-size: 11px; font-weight: 600;
    white-space: nowrap; cursor: default; color: var(--cor); background: color-mix(in srgb, var(--cor) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--cor) 40%, transparent); }
  .ct-pill.ct-refino { --cor: #b48cff; }
  .ct-pill.ct-refino.ct-pausada { --cor: #e3a43b; }
  .ct-bola { width: 7px; height: 7px; border-radius: 50%; background: var(--cor); flex: none; }
  .ct-pills .ct-ico { width: 22px; height: 22px; } .ct-pills .ct-ico svg { width: 13px; height: 13px; }
  .ct-novo { --cor: #8b949e; } .ct-andando { --cor: #e3a43b; } .ct-ok { --cor: #4fb477; }
  .ct-menu { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px; margin-bottom: 8px; border-radius: 10px;
    background: var(--vscode-editorWidget-background, #232328); border: 1px solid var(--vscode-widget-border, #3a3a42); }
  .ct-menu button { flex: none; height: 24px; padding: 0 7px; border: 0; border-radius: 6px; background: none; cursor: pointer; font: inherit; font-size: 11.5px; color: var(--vscode-foreground); }
  .ct-menu button:hover { background: var(--vscode-toolbar-hoverBackground, #2a2a30); }
  .ct-badge { display: inline-block; min-width: 14px; padding: 0 4px; margin-left: 2px; border-radius: 7px; font-size: 9.5px; line-height: 14px; text-align: center; background: #d97757; color: #fff; font-weight: 600; }
  .ct-menu button.is-on { background: color-mix(in srgb, #007aff 18%, transparent); color: #007aff; font-weight: 600; }
  .ct-menu .ct-sep { width: 1px; margin: 3px 3px; background: var(--vscode-widget-border, #3a3a42); }
  .ct-rod { flex: none; height: 30px; display: flex; align-items: center; padding: 0 8px; border-top: 1px solid var(--vscode-widget-border, #3a3a42);
    background: var(--vscode-sideBar-background, #181818); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--vscode-descriptionForeground); }
  .ct-rod details { position: relative; }
  .ct-rod details[open] .ct-badge { display: none; }
  .ct-notif { display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--vscode-widget-border, #3a3a42); font-size: 11.5px; line-height: 1.45; }
  .ct-notif:last-child { border-bottom: 0; }
  .ct-notif small { color: var(--vscode-descriptionForeground, #9a9aa4); }
  .ct-notif.nova .ct-ni { color: #d97757; }
  .ct-ni { flex: none; width: 12px; text-align: center; }
  .ct-rod summary { list-style: none; cursor: pointer; text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 11.5px; margin: 0; color: inherit; display: inline-flex; align-items: center; gap: 5px; padding: 3px 6px; border-radius: 6px; }
  .ct-rod summary::-webkit-details-marker { display: none; }
  .ct-rod summary:hover { background: var(--vscode-toolbar-hoverBackground, #2a2a30); color: var(--vscode-foreground); }
  .ct-rod summary svg { width: 14px; height: 14px; }
  .ct-notifs { position: absolute; bottom: 30px; left: 0; width: min(320px, 90vw); max-height: 280px; overflow: auto; padding: 10px 12px; border-radius: 10px;
    background: var(--vscode-editorWidget-background, #252526); border: 1px solid var(--vscode-widget-border, #454545); box-shadow: 0 8px 30px #0008; }
</style>`;

// Modo refinamento (.ticket.json refinamento.estado): aguardando_inicio → (Dar início) → rodando ⇄ pausado.
// O vigia do plugin sdd lê o mesmo estado: parado não acorda o Claude; rodando acorda a cada aprovação.
const MODO_ATIVO = ['aguardando_inicio', 'rodando', 'pausado'];
const emRefino = (t) => MODO_ATIVO.includes(t.refinamento?.estado);
function botaoRefino(t, b) {
  const modo = t.refinamento?.estado;
  if (modo === 'aguardando_inicio') return t.specPronta
    ? `<button class="ct-dar" ${b('darInicio')} title="O Claude criou a spec: clique para ele começar os passos">Dar início</button>`
    : '<button class="ct-dar" disabled title="O Claude está criando a spec">Preparando…</button>';
  if (modo === 'rodando') return `<button class="ct-ico ct-pausa" ${b('pausar')} title="Pausar refinamento: o Claude termina a etapa atual e espera">${IC.pausa}</button>`;
  if (modo === 'pausado') return `<button class="ct-ico ct-play" ${b('retomar')} title="Retomar refinamento">${IC.play}</button>`;
  return `<button class="ct-ico ct-play" ${b('refinar')} title="${t.spec?.dir ? 'Continuar refinamento (spec)' : 'Iniciar refinamento (spec)'}">${IC.play}</button>`;
}
function pillRefino(t) {
  const modo = t.refinamento?.estado;
  const [texto, dica] = modo === 'aguardando_inicio'
    ? (t.specPronta ? ['Spec pronta', 'Modo refinamento: o Claude criou a spec. Clique em Dar início para ele começar os passos.']
      : ['Preparando spec', 'Modo refinamento: o Claude está criando a spec no repositório de specs.'])
    : modo === 'rodando' ? ['Refinando', 'Modo refinamento: o Claude trabalha nos passos da spec e segue sozinho a cada aprovação. ⏸ no topo pausa.']
      : ['Refinamento pausado', 'Modo refinamento pausado: o Claude termina a etapa atual e espera. ▶ no topo retoma.'];
  return `<span class="ct-pill ct-refino ${modo === 'pausado' ? 'ct-pausada' : ''}" title="${dica}"><span class="ct-bola"></span>${texto}</span>`;
}

function cabecalho(t, { aba, secao, dentro }) {
  const b = (cmd) => (dentro ? `data-acao="${cmd}"` : `data-painel="${cmd}"`);
  const semTicket = t.id === SEM_TICKET;
  const abas = semTicket ? ABAS_SEM_TICKET : ABAS;
  const pend = semTicket ? 0 : duvidasDe(pastaDe(t.id)).filter((x) => !x.enviadaEm).length;
  const rot = (id, nome) => (id === 'duvidas' && pend ? `${nome} <span class="ct-badge" title="${pend} dúvida(s) não enviada(s) ao Jira">${pend}</span>` : nome);
  const abaBtn = ([id, nome]) => (dentro
    ? `<button data-acao="aba" data-id="${id}" class="${secao === PRINCIPAL && aba === id ? 'is-on' : ''}">${rot(id, nome)}</button>`
    : `<button data-secao="${PRINCIPAL}" data-aba="${id}">${rot(id, nome)}</button>`);
  return `<header class="ct-cab"><div class="ct-linha">
      <button class="ct-ico" ${dentro ? 'data-acao="voltar"' : `data-secao="${PRINCIPAL}" data-cmd="voltar"`} title="Voltar para a lista de tickets">${IC.voltar}</button>
      <span class="ct-titulo">${semTicket ? 'Sem ticket' : `<span class="ct-chave">${esc(t.chave)}</span> · ${esc(t.titulo || '')}`}</span>
      ${semTicket ? '' : botaoRefino(t, b)}
      <button class="ct-ico" ${b('claude')} title="Abrir a conversa do Claude${semTicket ? '' : ' deste ticket'}">${IC.claude}</button>
      ${semTicket ? '' : `<button class="ct-ico" ${b('jira')} title="Ver o ticket no Jira">${IC.jira}</button>`}
    </div>
    <div class="ct-pills">${semTicket ? '<span class="ct-pill ct-novo" title="Documentos e notas da conversa atual do Claude, que não pertence a nenhum ticket">Sem ticket vinculado</span>'
      : `<span class="ct-pill ct-${jira.corStatus(t.status)}" title="Coluna do ticket no board do Jira${t.tipo ? ` · ${esc(t.tipo)}` : ''}"><span class="ct-bola"></span>${esc(t.status || 'Status desconhecido')}</span>
      ${emRefino(t) ? pillRefino(t) : ''}
      <button class="ct-ico" ${b('atualizar')} title="Atualizar status e anexos do Jira">${IC.atualizar}</button>`}</div>
    ${!semTicket && emRefino(t) && t.refinamento.estado !== 'pausado' ? '<div class="ct-roxo"></div>' : ''}
    <nav class="ct-menu">${abas.map(abaBtn).join('')}<span class="ct-sep"></span>
      ${FORA().map(([id, nome]) => `<button data-secao="${id}" class="${secao === id ? 'is-on' : ''}">${nome}</button>`).join('')}</nav>
  </header>`;
}

// Notificações: .notificacoes.jsonl da pasta (hook notificacoes.py e sdd-state); lidas = mais antigas que .notificacoes.lidas.
// Abrir o 🔔 marca como lidas (o contador some pelo CSS na hora e no próximo desenho pelo arquivo).
const NOTIF = '.notificacoes.jsonl', LIDAS = '.notificacoes.lidas';
const ICONE_NOTIF = { fim: '✓', permissao: '⚠', sdd: '◆', duvida: '?', aviso: '•' };
const notifsDe = (dir) => {
  const linhas = (dir && lerTexto(path.join(dir, NOTIF))) || '';
  return linhas.split('\n').flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).reverse().slice(0, 50);
};
const rodape = (t, dentro) => {
  const dir = t && pastaDe(t.id);
  const l = notifsDe(dir), lidas = Date.parse((dir && lerTexto(path.join(dir, LIDAS))) || 0) || 0;
  const nova = (n) => Date.parse(n.em) > lidas; // o hook (Python) e o sdd-state (JS) escrevem ISO em formatos diferentes
  const novas = l.filter(nova).length;
  return `<footer class="ct-rod"><details><summary ${dentro ? 'data-acao' : 'data-painel'}="notifLidas">${IC.sino} Notificações
    ${novas ? `<span class="ct-badge">${novas}</span>` : ''}</summary>
  <div class="ct-notifs">${l.length ? l.map((n) => `<div class="ct-notif ${nova(n) ? 'nova' : ''}"><span class="ct-ni">${ICONE_NOTIF[n.tipo] || '•'}</span>
    <span>${esc(n.texto)}<br><small>${esc(quando(n.em))}</small></span></div>`).join('') : 'Nenhuma notificação ainda.'}</div></details></footer>`;
};

const estilo = ESTILO_NOTAS + CSS_MOLDURA + `<style>
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
  .chave { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--accent); font-weight: 600; }
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
  .md code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em; }
  .md ul { padding-left: 1.3em; margin: .3em 0; }
  .ticket-link { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; color: var(--accent); word-break: break-all; }
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
  .quando { flex: none; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.5px; color: var(--text-dim); }
  .dtitulo { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .decisao[open] .dtitulo { white-space: normal; }
  .origem { flex: none; font-size: 9.5px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--border); color: var(--text-dim); }
  .o-pergunta { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .dresumo { margin: 2px 6px 10px; padding: 8px 10px; border-radius: var(--r-md); background: var(--surface-2); font-size: 12px; line-height: 1.55; }
  .dresumo p { margin: 0 0 6px; }
  .dtrecho { font-size: 11.5px; color: var(--text-dim); }
  .agora { margin: 0 12px 10px; padding: 10px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border);
    border-left: 3px solid #a78bfa; box-shadow: var(--sombra); font-size: 12px; line-height: 1.5; }
  .agora .atitulo { font-weight: 600; font-size: 12.5px; display: flex; align-items: center; }
  .agora .atexto { color: var(--text-dim); margin-top: 2px; }
  .agora .aacoes { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
  .agora .aacoes > .primario { align-self: flex-start; height: 28px; }
  .pilha-t { display: flex; justify-content: space-between; align-items: center; margin: 0 12px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-dim); }
  .pilha { position: relative; margin: 0 12px 26px; }
  .pilha::before, .pilha::after { content: ''; position: absolute; left: 10px; right: 10px; height: 100%; border-radius: var(--r-lg);
    background: var(--surface); border: 1px solid var(--border); z-index: 0; display: none; }
  .pilha::before { top: 7px; opacity: .75; } .pilha::after { top: 14px; left: 20px; right: 20px; opacity: .45; }
  .pilha.atras-1::before, .pilha.atras-2::before, .pilha.atras-2::after { display: block; }
  .pnav { display: inline-flex; align-items: center; gap: 2px; text-transform: none; letter-spacing: 0; font-size: 11px; }
  .pnav button { width: 22px; height: 22px; border-radius: var(--r-md); color: var(--text); display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }
  .pnav button:hover { background: var(--surface-2); }
  .pnav button svg { width: 13px; height: 13px; }
  .pnav #pPos { min-width: 42px; text-align: center; }
  .pilha.grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; margin-bottom: 12px; }
  .pilha.grade::before, .pilha.grade::after { display: none !important; }
  .pilha.grade .pcard { min-height: 0; max-height: none; animation: none; }
  .pnav button.is-on { background: color-mix(in srgb, #a78bfa 22%, transparent); color: #a78bfa; }
  .pcard { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 8px; min-height: 200px; max-height: 320px; overflow: auto;
    padding: 14px 14px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); border-top: 3px solid #a78bfa;
    box-shadow: var(--sombra); animation: sobe 220ms ease-out; }
  @keyframes sobe { from { transform: translateY(8px); opacity: 0; } }
  .pcab { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); }
  .pcab b { color: #a78bfa; }
  .pcard .ptexto { font-size: 13px; font-weight: 600; line-height: 1.45; }
  .pcard .pctx { font-size: 11.5px; color: var(--text-dim); line-height: 1.45; }
  .popcoes { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
  .popcoes button { padding: 7px 10px; border: 1px solid var(--border) !important; border-radius: var(--r-md); background: var(--surface-2) !important;
    font-size: 12px; text-align: left; line-height: 1.35; }
  .popcoes button:hover { border-color: #a78bfa !important; }
  .prod { display: flex; justify-content: space-between; margin-top: auto; padding-top: 4px; }
  .prod button { font-size: 11.5px; color: var(--text-dim); padding: 2px 0; }
  .prod button:hover { color: var(--text); text-decoration: underline; }
  .prod .duv { color: #d97757; }
  .ao-vivo { max-height: 260px; overflow: auto; font-size: 11.5px; line-height: 1.45; padding: 8px 10px; }
  .vivo { display: flex; gap: 6px; padding: 2px 0; }
  .vivo .vi { flex: none; width: 12px; text-align: center; color: var(--text-dim); }
  .vivo .vt { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; }
  .vivo .vq { flex: none; color: var(--text-dim); font-size: 10px; }
  .v-ferramenta .vt { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--text-dim); }
  .v-bloqueio .vt, .v-erro .vt { color: var(--vscode-errorForeground, #f48771); }
  .v-fim .vi { color: var(--ok, #4fb477); }
  .vivo-bola { display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: #a78bfa; animation: pulsa 1.2s infinite; }
  @keyframes pulsa { 50% { opacity: .3; } }
  .duvida { padding: 4px 0 10px 12px; }
  .duvida .dlinha { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; }
  .duvida .dtexto { margin: 4px 0; font-size: 12.5px; line-height: 1.5; }
  .duvida .enviar { border: 1px solid var(--border); margin-top: 6px; }
  .dtrecho .esc { color: var(--ok); }
  /* Rodapé (por enquanto sem conteúdo) */
  .rodape { flex: none; height: 26px; border-top: 1px solid var(--border); background: var(--surface); }

  /* Painel do ticket */
  html, body { height: 100%; }
  body { display: flex; flex-direction: column; }
  .rolagem { flex: 1; min-height: 0; overflow-y: auto; padding-top: 10px; }
  .caixa-t { margin: 0 12px 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); display: flex; gap: 6px; }
  .caixa-t span { margin-left: auto; text-transform: none; letter-spacing: 0; }
  .lado { display: flex; gap: 4px; margin: 0 12px 10px; }
  .lado button { flex: 1; height: 28px; border-radius: var(--r-md); border: 1px solid var(--border) !important; background: var(--surface) !important; font-size: 12px; }
  .lado button.is-on { border-color: var(--accent) !important; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent) !important; }
  .st-novo { --cor: #8b949e; } .st-andando { --cor: #e3a43b; } .st-ok { --cor: #4fb477; }
  .pill { font-size: 10px; padding: 1px 7px; border-radius: 9px; color: var(--cor); background: color-mix(in srgb, var(--cor) 16%, transparent); white-space: nowrap; }
  .cartoes > li.sem-ticket { border-style: dashed; }
  .erro { color: var(--vscode-errorForeground); font-size: 12px; margin: 0 12px 8px; }
  .selo { flex: none; font-size: 9.5px; padding: 0 6px; border-radius: 8px; border: 1px solid color-mix(in srgb, #4a9eed 45%, transparent); color: #4a9eed; }
  .pendentes { border-style: dashed; }
  .pendentes .linha-doc { opacity: .45; cursor: default; transition: opacity 140ms; }
  .pendentes .linha-doc:hover { opacity: .8; background: none; }
  .pendentes .tam { flex: none; font-size: 10.5px; color: var(--text-dim); }
  .baixar { flex: none; height: 24px; padding: 0 8px; border-radius: var(--r-md); border: 1px solid var(--border) !important; background: var(--surface-2) !important; font-size: 11px; }
  .baixar:hover { border-color: var(--accent) !important; color: var(--accent); }
  .notas-caixa .papel { min-height: 280px; }
  .caixa-t .baixar { height: 20px; font-size: 10.5px; text-transform: none; letter-spacing: 0; }
</style><style>${jira.estiloDetalhe}</style>`;

const telaLista = (lista, erro) => `${estilo}
  <div class="rolagem">
  <div class="topo"><span class="rotulo">Tickets</span><span class="titulo"></span>
    <span class="extra">${lista.length ? `${lista.length} ticket${lista.length === 1 ? '' : 's'}` : ''}</span></div>
  <div class="barras"><span class="dica">${lista.length ? 'do mais recente para o mais antigo' : ''}</span><span class="espaco"></span>
    <button class="primario" data-acao="novo" title="Adicionar ticket pelo link do Jira">＋ Ticket</button></div>
  ${erro ? `<p class="erro">${esc(erro)}</p>` : ''}
  <ul class="cartoes">${lista.map((t) => `<li data-acao="abrir" data-id="${esc(t.chave)}" class="st-${jira.corStatus(t.status)}" title="Abrir o ticket"${emRefino(t) ? ' style="border-left: 3px solid #a371f7"' : ''}>
    <div class="corpo">
      <div class="nome"><span>${esc(t.titulo || t.chave)}</span></div>
      <div class="det"><span class="chave">${esc(t.chave)}</span>${t.status ? `<span class="pill">${esc(t.status)}</span>` : ''}
        ${emRefino(t) ? '<span class="pill" style="--cor:#a371f7">● refinando</span>' : ''}
        <span>${t.conversas.length} conversa${t.conversas.length === 1 ? '' : 's'}</span></div>
    </div>
    <span class="mini"><button class="perigo" data-acao="excluir" data-id="${esc(t.chave)}" title="Excluir (a pasta vai para _arquivados, nada é apagado)">${IC.lixo}</button></span></li>`).join('')}
    <li class="sem-ticket" data-acao="abrir" data-id="${SEM_TICKET}" title="Documentos e notas da conversa atual, sem ticket">
      <div class="corpo"><div class="nome"><span>Sem ticket</span></div><div class="det"><span>conversa atual do Claude</span></div></div></li>
  </ul>
  ${lista.length ? '' : '<div class="folha"><div class="centro"><div class="icone">🎫</div>Nenhum ticket ainda.<br>Clique em <b>＋ Ticket</b> e cole o link do Jira.</div></div>'}
  </div>`;

function telaConstituicao(r, est, abertos) {
  if (!est) return `<div class="vazio-aba">A spec ainda não foi iniciada.<br>Clique em <b>▶</b> no topo: o Claude cria <code>specs/NNN-…/</code> em ${esc(path.basename(r.spec?.repo || 'repositório'))} e começa pelo passo 0.</div>`;
  const abertas = est.perguntas.filter((q) => q.status === 'aberta');
  const bloq = est.achados.filter((a) => a.severidade === 'bloqueante' && a.status === 'aberto');
  const ROTULO = { regras: 'regras', proibicoes: 'proibições', secoes: 'seções', rfs: 'requisitos', historias: 'histórias', bordas: 'casos de borda',
    tecnologias: 'tecnologias', endpoints: 'endpoints', entidades: 'entidades', violacoes: 'violações', tarefas: 'tarefas', feitas: 'feitas',
    ultimaTarefa: 'última tarefa', ultimoCommit: 'último commit' };
  const vivo = !maestro.rodando(pasta(r.id)); // Aprovar só com o Claude parado
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
            title="${!vivo ? 'O Claude ainda está trabalhando: espere a etapa terminar' : !lido ? 'Abra o arquivo antes de aprovar: nunca aprove sem ler' : portaoFechado ? 'Resolva as pendências do portão' : 'Aprovar este passo'}">Aprovar</button>
          <button data-acao="specAjuste" data-id="${p.n}">Pedir ajuste</button></div>` : ''}
        ${p.status === 'desatualizado' ? `<div class="acoes-passo"><button data-acao="specContinuar">Reconciliar</button></div>` : ''}
      </div>`}
    </div>`;
  }).join('')}</div>`;
}

// O que o refinamento espera de você agora (null = nada: o Claude pode seguir).
const esperaHumano = (est) => (est.perguntas.some((q) => q.status === 'aberta') ? 'perguntas'
  : est.passos.some((p) => p.status === 'aguardando_revisao') ? 'revisao' : null);

// Cartão "Agora" no topo da aba Spec: o que está acontecendo e a sua única ação, com o botão certo.
function cartaoAgora(t, est, rodandoAgora) {
  const modo = t.refinamento?.estado;
  const passo = est && est.proximoPasso <= 6 ? est.passos[est.proximoPasso] : null;
  const abertas = est ? est.perguntas.filter((q) => q.status === 'aberta') : [];
  let titulo, texto = '', acoes = '';
  if (rodandoAgora) [titulo, texto] = [`Claude trabalhando${passo ? ` · passo ${passo.n} · ${passo.titulo}` : ''}`, 'Acompanhe abaixo. ⏸ no topo pausa depois desta etapa.'];
  else if (!est) [titulo, texto] = ['Spec não iniciada', 'Clique em ▶ no topo para o Claude criar a spec.'];
  else if (abertas.length) {
    // Perguntas em pilha: um card por vez, as outras como bordas atrás. ‹ › passa sem responder; ▦ mostra todas em grade
    // (a navegação é só na página: script "Pilha de perguntas" em pagina()). Respondeu, o card sai e a pilha anda.
    const resto = Math.min(abertas.length - 1, 2);
    const card = (q, i) => `<div class="pcard" data-pq="${i}" data-qid="${esc(q.id)}" ${i ? 'hidden' : ''}>
      <div class="pcab"><b>${esc(q.id)}</b>${q.passo !== undefined ? `<span>passo ${esc(q.passo)}</span>` : ''}</div>
      <div class="ptexto">${esc(q.pergunta)}</div>
      ${q.contexto ? `<div class="pctx">${esc(q.contexto)}</div>` : ''}
      <div class="popcoes">${(q.opcoes || []).map((o, k) => `<button data-acao="responder" data-id="${esc(q.id)}" data-op="${k}">${esc(o)}</button>`).join('')}</div>
      <div class="prod"><button data-acao="responder" data-id="${esc(q.id)}" data-op="outra">Outra resposta…</button>
        <button class="duv" data-acao="responder" data-id="${esc(q.id)}" data-op="duvida">Tirar dúvida</button></div>
    </div>`;
    return `<div class="pilha-t"><span>Perguntas do Claude</span>${abertas.length > 1 ? `<span class="pnav">
      <button data-pilha="ant" title="Pergunta anterior">‹</button><span id="pPos">1 de ${abertas.length}</span>
      <button data-pilha="prox" title="Próxima pergunta (sem responder esta)">›</button>
      <button data-pilha="grade" title="Ver todas as perguntas">${IC.grade}</button></span>` : '<span>última</span>'}</div>
    <div class="pilha atras-${resto}" id="pilha">${abertas.map(card).join('')}</div>`;
  } else if (passo?.status === 'aguardando_revisao') [titulo, texto] = [`Revise o passo ${passo.n} · ${passo.titulo}`, `Abra <b>${esc(path.basename(arquivoPasso(t, passo.n)))}</b> no cartão do passo, leia e clique em <b>Aprovar</b> ou <b>Pedir ajuste</b>.`];
  else if (!passo) [titulo, texto] = ['Spec concluída', 'Todos os passos aprovados.'];
  else if (modo === 'aguardando_inicio') [titulo, texto, acoes] = ['Spec criada', `Próximo: passo ${passo.n} · ${passo.titulo}.`, '<button class="primario" data-acao="darInicio">Dar início</button>'];
  else if (modo === 'pausado') [titulo, texto, acoes] = ['Refinamento pausado', `Para em: passo ${passo.n} · ${passo.titulo}.`, '<button class="primario" data-acao="retomar">▶ Retomar</button>'];
  else [titulo, texto, acoes] = [`Pronto para o passo ${passo.n} · ${passo.titulo}`, 'O Claude não está rodando agora.', '<button class="primario" data-acao="retomar">Continuar</button>'];
  return `<div class="agora ${rodandoAgora ? 'trabalhando' : ''}"><div class="atitulo">${rodandoAgora ? '<span class="vivo-bola"></span>' : ''}${titulo}</div>
    ${texto ? `<div class="atexto">${texto}</div>` : ''}${acoes ? `<div class="aacoes">${acoes}</div>` : ''}</div>`;
}

// Caixa "Ao vivo" da aba Spec: o que o Claude em segundo plano (maestro.js) está fazendo.
const ICONE_VIVO = { texto: '✦', ferramenta: '›', bloqueio: '⛔', erro: '⚠', fim: '✓', inicio: '▶' };
const aoVivoHtml = (l, vivo) => (l.length ? `<div class="caixa-t">Ao vivo<span>${vivo ? '<span class="vivo-bola"></span>Claude trabalhando' : 'parado'}</span></div>
  <div class="folha ao-vivo" id="aoVivo">${l.map((x) => `<div class="vivo v-${esc(x.tipo)}"><span class="vi">${ICONE_VIVO[x.tipo] || '·'}</span>
    <span class="vt">${esc(x.tipo === 'texto' ? x.texto.slice(0, 400) : x.texto)}</span><span class="vq">${esc(new Date(x.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</span></div>`).join('')}</div>` : '');

function corpoAba(t, aba, d) {
  const semTicket = t.id === SEM_TICKET;
  if (aba === 'docs') {
    const docs = d.docs.length ? d.docs.map((x) => `<div class="linha-doc" data-acao="docAbrir" data-id="${esc(x.nome)}" title="${esc(x.origem || x.full)}">
        <span class="sigla">${esc(path.extname(x.nome).slice(1, 5).toUpperCase() || 'ARQ')}</span><span class="nome">${esc(x.nome)}</span>
        ${d.origens[x.nome]?.origem === 'jira' ? '<span class="selo" title="Baixado dos anexos do Jira">↓ Jira</span>' : ''}
        <span class="mini"><button data-acao="docMencionar" data-id="${esc(x.nome)}" title="Mencionar no Claude">@</button></span></div>`).join('')
      : `<div class="vazio-aba">${semTicket && !d.dir ? 'Nenhuma conversa do Claude aberta ainda.' : 'Nenhum documento ainda. O que o Claude criar aparece aqui.'}</div>`;
    // Anexos do ticket que ainda não foram baixados: apagados, com botão de baixar. Baixado, sobe para Documentos.
    const baixados = new Set(Object.values(d.origens).map((o) => o.id));
    const pend = (d.jira?.anexos || []).filter((a) => !baixados.has(a.id));
    const kb = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
    const pendentes = pend.length ? `<div class="caixa-t">Encontrados no ticket<span>${pend.length > 1 ? '<button class="baixar" data-acao="anexoTodos">↓ Baixar todos</button>' : ''}</span></div>
      <div class="folha pendentes">${pend.map((a) => `<div class="linha-doc" title="${esc(a.nome)}">
        <span class="sigla">${esc(path.extname(a.nome).slice(1, 5).toUpperCase() || 'ARQ')}</span><span class="nome">${esc(a.nome)}</span>
        <span class="tam">${kb(a.tamanho || 0)}</span>
        <button class="baixar" data-acao="anexoBaixar" data-id="${esc(a.id)}" ${d.baixando.has(a.id) ? 'disabled' : ''}>${d.baixando.has(a.id) ? 'Baixando…' : '↓ Baixar'}</button></div>`).join('')}</div>` : '';
    return `<div class="caixa-t">Documentos<span>${d.docs.length || ''}</span></div><div class="folha">${docs}</div>${pendentes}
    <div class="caixa-t">Notas</div>
    <div class="notas-caixa">${notas.corpoNotas(semTicket ? 'Notas desta conversa…' : 'Notas do ticket…')}</div>`;
  }
  if (aba === 'spec') return `${emRefino(t) || d.estado ? cartaoAgora(t, d.estado, d.vivoRodando) : ''}${aoVivoHtml(d.vivo, d.vivoRodando)}<div class="folha">${t.spec?.dir ? telaConstituicao(t, d.estado, d.abertos)
    : `<div class="vazio-aba">A spec ainda não foi iniciada.<br>Clique em <b>▶</b> no topo: o Claude cria <code>${esc(t.chave)}-…/</code> no repositório de specs e começa pelo passo 0.</div>`}</div>`;
  if (aba === 'ticket') return d.jira?.erro ? `<p class="erro">${esc(d.jira.erro)}</p><div class="barras"><button class="primario" data-acao="atualizar">Tentar de novo</button></div>`
    : d.jira ? jira.folhaTicket(d.jira) : '<div class="folha"><div class="vazio-aba">Carregando do Jira…</div></div>';
  if (aba === 'analise') {
    const texto = d.handoffs[d.lado];
    return `<div class="lado">${['backend', 'mobile'].map((l) => `<button data-acao="lado" data-id="${l}" class="${d.lado === l ? 'is-on' : ''}">${l === 'backend' ? 'Backend' : 'Mobile'}</button>`).join('')}</div>
    <div class="folha">${texto && texto.trim() ? `<div class="md">${markdown(texto)}</div>`
      : `<div class="vazio-aba">Ainda não há análise do ${d.lado}.<br>Mencione no Claude e peça para gravar a análise aqui.</div>`}
      <div class="acoes-aba"><div class="format-bar">
        <button class="fb-btn" data-acao="handoffMencionar" data-id="${d.lado}" title="Mencionar o arquivo no Claude">@ Mencionar</button>
        ${texto !== null ? `<span class="fb-sep"></span><button class="fb-btn" data-acao="handoffPrevia" data-id="${d.lado}">Prévia</button>
        <button class="fb-btn" data-acao="handoffEditar" data-id="${d.lado}">Editar</button>`
          : `<span class="fb-sep"></span><button class="fb-btn" data-acao="handoffCriar" data-id="${d.lado}">Criar arquivo</button>`}
      </div></div></div>`;
  }
  if (aba === 'todo') {
    const b = d.board, ultima = b.columns.at(-1).id;
    const ord = (st) => b.items.filter((i) => i.status === st).sort((x, y) => x.order - y.order);
    return `<div class="folha">
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
  }
  if (aba === 'decisoes') return `<div class="folha">${d.decisoes.length ? `<div class="hist">${d.decisoes.map((x) => `
    <details class="decisao" data-dec="${esc(x.id)}">
      <summary><span class="quando">${esc(quando(x.data))}</span><span class="dtitulo">${esc(x.titulo)}</span>
        <span class="origem o-${esc(x.origem)}">${x.origem === 'pergunta' ? 'Pergunta' : 'Chat'}</span></summary>
      <div class="dresumo"><p>${esc(x.resumo || '')}</p>
        ${x.origem === 'pergunta' && x.detalhes ? `<div class="dtrecho"><b>Opções:</b> ${(x.detalhes.opcoes || []).map((o) => o === x.detalhes.escolha ? `<b class="esc">${esc(o)}</b>` : esc(o)).join(' · ')}${x.detalhes.notas ? `<br><b>Observação:</b> ${esc(x.detalhes.notas)}` : ''}</div>` : ''}
        ${x.origem === 'chat' && x.detalhes?.mensagem ? `<div class="dtrecho"><b>Mensagem:</b> “${esc(x.detalhes.mensagem.slice(0, 500))}”</div>` : ''}
      </div>
    </details>`).join('')}</div>`
    : '<div class="vazio-aba">Nenhuma decisão registrada ainda.<br>Elas aparecem quando você responde uma pergunta do Claude ou pede para ele fazer diferente.</div>'}</div>`;
  if (aba === 'duvidas') return `<div class="folha">${d.duvidas.length ? `<div class="hist">${d.duvidas.slice().reverse().map((x) => `
    <div class="decisao duvida">
      <div class="dlinha"><span class="quando">${esc(quando(x.em))}</span><b>${esc(x.id)}</b>
        ${x.enviadaEm ? `<span class="origem" title="Enviada em ${esc(quando(x.enviadaEm))}">✓ No Jira</span>` : ''}</div>
      <p class="dtexto">${esc(x.texto)}</p>
      ${x.contexto ? `<div class="dtrecho"><b>Contexto:</b> ${esc(x.contexto)}</div>` : ''}
      ${x.enviadaEm ? '' : `<div class="acoes-aba"><button class="fb-btn enviar" data-acao="duvidaEnviar" data-id="${esc(x.id)}">Enviar para os comentários do ticket</button></div>`}
    </div>`).join('')}</div>`
    : '<div class="vazio-aba">Nenhuma dúvida registrada ainda.<br>No modo refinamento, quando você escolher <b>Tirar dúvida</b> numa pergunta do Claude, ela aparece aqui.</div>'}</div>`;
  return '';
}

const telaTicket = (t, aba, d) => `${estilo}${cabecalho(t, { aba, secao: PRINCIPAL, dentro: true })}
  <main class="rolagem">${corpoAba(t, aba, d)}</main>${rodape(t, true)}`;

function pagina(nonce, corpo, nota) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin: 0; } button { font: inherit; cursor: pointer; border: 0; background: none; color: inherit; } [hidden] { display: none !important; }</style>
${nota ? notas.CSS_NOTAS : ''}</head><body>${corpo}
${nota ? `<script nonce="${nonce}">${notas.scriptNotas(nota.html, nota.sid, nota.estilo)}</script>` : ''}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const enviar = (m) => vscode.postMessage(m);
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-acao]');
    if (!el) return;
    e.stopPropagation();
    enviar({ acao: el.dataset.acao, id: el.dataset.id, op: el.dataset.op, key: el.dataset.key });
  });

  // Decisões abertas continuam abertas depois do redesenho.
  const abertas = new Set((vscode.getState() || {}).decisoes || []);
  document.querySelectorAll('[data-dec]').forEach((d) => {
    if (abertas.has(d.dataset.dec)) d.open = true;
    d.addEventListener('toggle', () => {
      d.open ? abertas.add(d.dataset.dec) : abertas.delete(d.dataset.dec);
      vscode.setState({ ...(vscode.getState() || {}), decisoes: [...abertas] });
    });
  });

  // Pilha de perguntas: ‹ › troca o card de cima, ▦ alterna para a grade com todas. Lembra a pergunta e o modo.
  const pilha = document.getElementById('pilha');
  if (pilha) {
    const cards = [...pilha.querySelectorAll('.pcard')], pos = document.getElementById('pPos');
    const st = vscode.getState() || {};
    let i = Math.max(0, cards.findIndex((c) => c.dataset.qid === st.pqId));
    if (i === 0 && st.pqId && !cards.some((c) => c.dataset.qid === st.pqId)) i = Math.min(st.pq || 0, cards.length - 1); // respondida: fica na mesma posição
    let grade = !!st.pgrade && cards.length > 1;
    const mostrar = () => {
      pilha.classList.toggle('grade', grade);
      cards.forEach((c, k) => { c.hidden = !grade && k !== i; });
      if (pos) pos.textContent = grade ? cards.length + ' perguntas' : (i + 1) + ' de ' + cards.length;
      document.querySelector('[data-pilha="grade"]')?.classList.toggle('is-on', grade);
      vscode.setState({ ...(vscode.getState() || {}), pq: i, pqId: cards[i]?.dataset.qid, pgrade: grade });
    };
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pilha]');
      if (!b) return;
      if (b.dataset.pilha === 'grade') grade = !grade;
      else { grade = false; i = (i + (b.dataset.pilha === 'prox' ? 1 : -1) + cards.length) % cards.length; }
      mostrar();
    });
    mostrar();
  }

  // Ao vivo: rola para a última linha; o corpo volta para onde estava (a página é redesenhada a cada linha nova).
  const av = document.getElementById('aoVivo');
  if (av) av.scrollTop = av.scrollHeight;
  const corpo = document.querySelector('main.rolagem');
  if (corpo) {
    corpo.scrollTop = (vscode.getState() || {}).rolagem || 0;
    corpo.addEventListener('scroll', () => vscode.setState({ ...(vscode.getState() || {}), rolagem: corpo.scrollTop }));
  }

  // TODO (como o painel do Atelier): campo + ＋, quadro ⇄ lista, arrastar entre colunas, caixa = última coluna.
  const nova = document.getElementById('novaTarefa');
  if (nova) {
    const add = () => { const v = nova.value.trim(); if (v) enviar({ acao: 'todo', op: 'add', titulo: v }); };
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

// ── Vínculo com as conversas do Claude ──
const projeto = () => require('./conversas')._teste.projeto();
// Histórico da conversa: no projeto atual ou em outro (o ticket junta conversas de repositórios diferentes).
const jsonl = (sid) => require('./conversas')._teste.historico(sid);
function inicioDa(sid) {
  const t = (lerTexto(jsonl(sid)) || '').match(/"timestamp":"([^"]+)"/)?.[1];
  return t ? Date.parse(t) : Date.now();
}
// Conversa com histórico, aberta depois do pedido, que menciona a pasta do ticket (está no texto pré-preenchido).
function localizarConversa(t) {
  let nomes;
  try { nomes = fs.readdirSync(projeto()).filter((n) => n.endsWith('.jsonl')); } catch { return null; }
  const desde = t.pedidoEm - 5000;
  return nomes.map((n) => path.basename(n, '.jsonl'))
    .filter((sid) => !tickets.ticketDa(sid))
    .filter((sid) => { try { return fs.statSync(jsonl(sid)).mtimeMs >= desde; } catch { return false; } })
    .filter((sid) => (lerTexto(jsonl(sid)) || '').includes(pasta(t.chave)) && inicioDa(sid) >= desde)
    .sort((a, b) => inicioDa(a) - inicioDa(b))[0] || null;
}
// Título da conversa: a mesma linha que o /rename do Claude grava (custom-title vence o ai-title).
function titularConversa(sid, titulo, tentativas = 20) {
  const arq = jsonl(sid);
  if (!fs.existsSync(arq)) { if (tentativas) setTimeout(() => titularConversa(sid, titulo, tentativas - 1), 1500); return; }
  const atual = fs.readFileSync(arq, 'utf8');
  fs.appendFileSync(arq, (atual.endsWith('\n') ? '' : '\n') + JSON.stringify({ type: 'custom-title', sessionId: sid, customTitle: titulo }) + '\n');
}
const ultimaConversa = (t) => require('./claude').ultimaConversa(t);

const SPECS_PADRAO = path.join(os.homedir(), 'specs');

exports.provider = (ctx) => {
  let view, aberto = null, aba = 'docs', lado = 'backend', observador;
  const abertos = new Set(); // passos cujo arquivo o humano abriu nesta sessão (ticket:passo:hash)
  const cacheJira = {}; // chave -> dados do Jira (ou { erro })
  const baixando = new Set(); // ids de anexos sendo baixados
  let avisarMoldura = () => {}, pedirSecao = () => {};

  const fechar = () => { observador?.close(); observador = null; };
  const render = () => {
    if (!view) return;
    fechar();
    const nonce = crypto.randomBytes(16).toString('hex');
    let t = aberto === SEM_TICKET ? { id: SEM_TICKET, conversas: [] } : aberto && comSpec(ticketDe(aberto));
    // Todos os passos aprovados: o modo refinamento termina sozinho.
    if (t && emRefino(t) && t.specPronta && estadoSpec(t).proximoPasso > 6) t = { ...t, refinamento: modo(t.id, 'concluido') };
    if (!t) { aberto = null; sessao.focar(null); view.webview.html = pagina(nonce, telaLista(tickets.listar())); avisarMoldura(); return; }
    if (!(t.id === SEM_TICKET ? ABAS_SEM_TICKET : ABAS).some(([id]) => id === aba)) aba = 'docs';
    // Confere os arquivos da spec antes de desenhar: edição depois de aprovado volta o passo para revisão.
    if (aba === 'spec' && dirSpec(t) && fs.existsSync(path.join(dirSpec(t), 'sdd-state.json')) && sddState()) {
      try { require('child_process').execFileSync(sddState(), ['check', '--ref', pasta(t.id)], { timeout: 5000, stdio: 'ignore' }); } catch {}
    }
    const dir = pastaDe(t.id);
    const d = {
      dir, lado, abertos,
      docs: docsDe(dir),
      handoffs: t.id === SEM_TICKET ? {} : { backend: lerTexto(path.join(dir, HANDOFF.backend)), mobile: lerTexto(path.join(dir, HANDOFF.mobile)) },
      board: t.id === SEM_TICKET ? null : quadro(t.id),
      decisoes: decisoesDe(dir),
      duvidas: duvidasDe(dir),
      vivo: t.id === SEM_TICKET ? [] : maestro.aoVivo(dir),
      vivoRodando: t.id !== SEM_TICKET && maestro.rodando(dir),
      estado: dirSpec(t) ? estadoSpec(t) : null,
      jira: cacheJira[t.id],
      origens: dir ? ler(path.join(dir, ORIGEM), {}) : {},
      baixando
    };
    view.webview.html = pagina(nonce, telaTicket(t, aba, d), aba === 'docs' && dir
      ? { html: lerTexto(path.join(dir, NOTAS)) || '', sid: t.id, estilo: ler(path.join(dir, '.notas.json'), null) || notas.ESTILO_PADRAO } : null);
    avisarMoldura();
    // O Claude grava documentos, handoffs, decisões e o estado da spec por fora: redesenha quando muda
    // (as notas não, para não atropelar a digitação).
    let espera;
    const depois = (ms) => { clearTimeout(espera); espera = setTimeout(render, ms); };
    const obs = [];
    try { if (dir) obs.push(fs.watch(dir, (_, nome) => { if (nome !== NOTAS && nome !== '.notas.json' && nome !== '.decisoes.lock' && nome !== LIDAS) depois(300); })); } catch {}
    if (dirSpec(t) && fs.existsSync(dirSpec(t))) {
      try { obs.push(fs.watch(dirSpec(t), (_, nome) => { if (nome && !nome.endsWith('.tmp')) depois(400); })); } catch {}
      try { obs.push(fs.watch(t.spec.repo, (_, nome) => { if (nome === 'constitution.md') depois(400); })); } catch {}
    }
    observador = { close: () => { clearTimeout(espera); obs.forEach((o) => o.close()); } };
  };

  // Título e status do Jira: guardados no .ticket.json (a lista mostra sem buscar de novo).
  const atualizarJira = async (chave) => {
    const t = tickets.ler(chave);
    if (!t) return;
    try {
      const j = await jira.buscar(ctx.secrets, { key: chave, site: t.site });
      cacheJira[chave] = j;
      tickets.gravar({ ...tickets.ler(chave), titulo: j.resumo, status: j.status, tipo: j.tipo });
    } catch (e) { cacheJira[chave] = { erro: e.message }; }
    render();
  };

  const mencionar = (texto) => require('./claude').mencionar(texto);
  const modo = (chave, estado) => {
    const t = tickets.ler(chave);
    const refinamento = { ...t.refinamento, estado };
    tickets.gravar({ ...t, refinamento });
    return refinamento;
  };
  const ticketAberto = () => (aberto && aberto !== SEM_TICKET ? ticketDe(aberto) : null);

  // ── Maestro: o Claude em segundo plano (maestro.js), uma execução por etapa. A extensão decide quando rodar:
  // Dar início/▶, aprovação (execução nova: contexto limpo), respostas e ajuste (mesma sessão). Pausado não roda.
  const binsSdd = () => [sddState(), path.join(os.homedir(), '.claude', 'plugins-locais', 'crafting', 'plugins', 'sdd', 'bin', 'sdd-state')].filter(Boolean);
  const FERRAMENTAS = () => [...binsSdd().map((b) => `Bash(${b}:*)`), 'Read', 'Write', 'Edit', 'Glob', 'Grep',
    'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(git status:*)', 'Bash(git log:*)', 'Bash(git diff:*)'];
  const etapa = (t, texto, continuar = false, cwd = t.spec?.repo) => maestro.rodar(pasta(t.chave), {
    cwd, continuar, ferramentas: FERRAMENTAS(), aoMudar: render,
    prompt: `[segundo plano] [Crafting Table · ticket ${t.chave}] ${texto}\nPasta do ticket: ${pasta(t.chave)} · sdd-state: ${sddState()}`
  });
  const estadoDe = (chave) => tickets.ler(chave)?.refinamento?.estado;
  // Rodando e sem nada esperando o humano → próxima etapa numa execução nova (true se começou).
  const seguir = (t) => {
    const est = estadoSpec(t);
    if (!est || estadoDe(t.chave) !== 'rodando' || maestro.rodando(pasta(t.chave)) || esperaHumano(est) || est.proximoPasso > 6) return false;
    const novas = respondidas.splice(0).join('; ');
    return etapa(t, `Siga a skill sdd, protocolo de retomada, sem perguntar: rode status e trabalhe só o passo ${est.proximoPasso} (${est.passos[est.proximoPasso].titulo}).`
      + (novas ? ` Respostas do humano desde a última execução: ${novas}.` : ''));
  };
  const pedido = (t) => `Ticket ${t.chave}: ${t.titulo || ''}\n${t.link}\nPasta do ticket: ${pasta(t.chave)} (documentos, notas em ${NOTAS}, `
    + `análise do backend em ${HANDOFF.backend} e do mobile em ${HANDOFF.mobile}, TODO em ${TODO}: quadro do Atelier, colunas todo/doing/done)\n`;
  // Abre a conversa mais recente do ticket com o texto; sem conversa, abre uma nova e vincula quando a 1ª mensagem chegar.
  const abrirConversa = async (t, texto) => {
    const sid = ultimaConversa(t);
    if (sid) return vscode.commands.executeCommand('claude-vscode.editor.open', sid, texto);
    tickets.gravar({ ...tickets.ler(t.chave), pedidoEm: Date.now() });
    await vscode.commands.executeCommand('claude-vscode.editor.open', undefined, texto || pedido(t));
  };

  const respondidas = []; // respostas ainda não entregues ao Claude
  const sdd = (args) => new Promise((ok) => (sddState() ? require('child_process').execFile(sddState(), args, (e, out, err) => {
    if (e) vscode.window.showErrorMessage(String(err || e.message).replace(/^sdd-state: /, ''));
    ok(!e);
  }) : ok(false)));
  const acoes = {
    abrir({ id, key }) {
      if (key) { const t = ticketAberto(); return t && vscode.env.openExternal(vscode.Uri.parse(`${t.site}/browse/${key}`)); } // subtarefa
      aberto = id;
      aba = 'docs';
      sessao.focar(id === SEM_TICKET ? null : id);
      render();
      if (id !== SEM_TICKET && !cacheJira[id]) atualizarJira(id);
    },
    voltar() { aberto = null; sessao.focar(null); pedirSecao(PRINCIPAL); render(); },
    aba({ id }) { aba = id; render(); if (id === 'ticket' && aberto !== SEM_TICKET && cacheJira[aberto]?.erro) atualizarJira(aberto); },
    lado({ id }) { lado = id; render(); },
    async novo() {
      const link = await vscode.window.showInputBox({ title: 'Novo ticket', prompt: 'Link do ticket no Jira', placeHolder: 'https://ferreiracosta.atlassian.net/browse/WMS-123', ignoreFocusOut: true });
      if (!link) return;
      let t;
      try { jira.lerLink(link); t = tickets.criar(link.trim()); } catch (e) { return vscode.window.showErrorMessage(e.message); }
      this.abrir({ id: t.chave });
    },
    async excluir({ id }) {
      const t = tickets.ler(id);
      const ok = t && await vscode.window.showWarningMessage(`Excluir o ticket ${id}?`, { modal: true,
        detail: `Sai da lista. A pasta (documentos, notas, TODO, evidências) vai para ${path.join(tickets.RAIZ, '_arquivados')} — nada é apagado. As conversas do Claude continuam, sem ticket.` }, 'Excluir');
      if (!ok) return;
      tickets.arquivar(id);
      if (aberto === id) { aberto = null; sessao.focar(null); }
      render();
    },
    atualizar() { if (ticketAberto()) { delete cacheJira[aberto]; render(); atualizarJira(aberto); } },
    notifLidas() { if (aberto) gravar(aberto, LIDAS, new Date().toISOString()); },
    // Prévia + confirmação antes de publicar: o comentário fica visível para todo o time no Jira.
    async duvidaEnviar({ id }) {
      const t = ticketAberto();
      const l = t ? duvidasDe(pasta(t.chave)) : [];
      const x = l.find((y) => y.id === id);
      if (!x || x.enviadaEm) return;
      const ok = await vscode.window.showWarningMessage(`Comentar no ${t.chave}?`, { modal: true, detail: textoDuvida(x) }, 'Enviar');
      if (!ok) return;
      try { await jira.comentar(ctx.secrets, { key: t.chave, site: t.site }, textoDuvida(x)); }
      catch (e) { return vscode.window.showErrorMessage(e.message); }
      x.enviadaEm = new Date().toISOString();
      gravar(t.chave, DUVIDAS, l);
      vscode.window.showInformationMessage(`${x.id} enviada para os comentários do ${t.chave}.`);
      atualizarJira(t.chave);
    },
    jira() { const t = ticketAberto(); if (t?.link) vscode.env.openExternal(vscode.Uri.parse(t.link)); },
    async claude() {
      const t = ticketAberto();
      if (t) return abrirConversa(t);
      const sid = sessao.conversaAtual();
      return vscode.commands.executeCommand('claude-vscode.editor.open', sid || undefined);
    },
    // ▶ Iniciar refinamento: modo aguardando_inicio + conversa nova que o hook do plugin sdd acorda com o /sdd:iniciar.
    // A spec mora no repositório de specs (craftingTable.specsDir), em <CHAVE>-<slug>/. Spec já existente: continua de onde parou.
    async refinar() {
      const t = ticketAberto();
      if (!t) return;
      if (estadoSpec(t)) { aba = 'spec'; return this.retomar(); }
      let repo = t.spec?.repo || vscode.workspace.getConfiguration('craftingTable').get('specsDir') || SPECS_PADRAO;
      if (!fs.existsSync(repo)) {
        const uri = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, title: 'Repositório de specs (onde a spec vai morar)', openLabel: 'Usar este repositório' });
        if (!uri) return;
        repo = uri[0].fsPath;
      }
      modo(t.chave, 'aguardando_inicio');
      aba = 'spec'; // o refinamento acontece na aba Spec
      atualizarJira(t.chave); // anexos do ticket aparecem em Docs para baixar
      // Maestro (prova): o Claude roda em segundo plano e a caixa Ao vivo da aba Spec mostra o que ele faz.
      etapa(t, `/sdd:iniciar ${pasta(t.chave)} ${repo}\nTicket aguardando início: só crie a spec (init + status) e termine dizendo para clicar em Dar início.`, false, repo);
      render();
    },
    darInicio() { return this.retomar(); },
    pausar() { modo(aberto, 'pausado'); render(); },
    // Dar início / ▶ Retomar / Continuar: modo rodando e, se nada espera por você, o Claude começa a próxima etapa.
    retomar() {
      const t = ticketAberto();
      if (!t) return;
      modo(t.chave, 'rodando');
      if (!seguir(t)) render();
    },
    specAbrir({ id }) {
      const r = ticketAberto(), n = Number(id), est = estadoSpec(r);
      const arq = arquivoPasso(r, n);
      if (!fs.existsSync(arq)) return vscode.window.showWarningMessage(`O arquivo ainda não existe: ${arq}`);
      abertos.add(`${r.id}:${n}:${est?.passos[n]?.hash}`); // libera o Aprovar: só depois de ler
      vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arq));
      render();
    },
    specMudancas({ id }) {
      const r = ticketAberto(), n = Number(id), est = estadoSpec(r);
      abertos.add(`${r.id}:${n}:${est?.passos[n]?.hash}`); // ver o diff também conta como leitura
      vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(copiaAprovada(r, n)), vscode.Uri.file(arquivoPasso(r, n)),
        `${path.basename(arquivoPasso(r, n))}: aprovado ↔ atual`);
      render();
    },
    specMencionar({ id }) { mencionar(`@${arquivoPasso(ticketAberto(), Number(id))}`); },
    specContinuar() { return this.refinar(); },
    async specAprovar({ id }) {
      const r = ticketAberto(), n = Number(id), est = estadoSpec(r);
      if (maestro.rodando(pasta(r.id))) return vscode.window.showWarningMessage('O Claude ainda está trabalhando neste ticket: espere a etapa terminar.');
      if (!abertos.has(`${r.id}:${n}:${est?.passos[n]?.hash}`)) return vscode.window.showWarningMessage('Abra e leia o arquivo antes de aprovar.');
      const ok = await vscode.window.showInformationMessage(`Aprovar o passo ${n} (${est.passos[n].titulo})?`, { modal: true, detail: 'Depois de aprovado, o Claude pode seguir para o próximo passo.' }, 'Aprovar');
      if (!ok) return;
      const bin = sddState();
      if (!bin) return vscode.window.showErrorMessage('Plugin sdd não encontrado (claude plugin install sdd@crafting-local).');
      require('child_process').execFile(bin, ['aprovar', String(n), '--ref', pasta(r.id), '--por', os.userInfo().username], (err, out, errOut) => {
        render();
        if (err) return vscode.window.showErrorMessage(String(errOut || err.message).replace(/^sdd-state: /, ''));
        // Aprovado: próximo passo numa execução nova (contexto limpo), se o refinamento estiver rodando.
        vscode.window.setStatusBarMessage(`$(check) ${out.trim()}`, 6000);
        seguir(ticketDe(r.id));
      });
    },
    async specAjuste({ id }) {
      const r = ticketAberto(), n = Number(id);
      if (maestro.rodando(pasta(r.id))) return vscode.window.showWarningMessage('O Claude ainda está trabalhando neste ticket: espere a etapa terminar.');
      const texto = await vscode.window.showInputBox({ title: `Ajuste no passo ${n} (${estadoSpec(r)?.passos[n]?.titulo})`, prompt: 'O que o Claude deve mudar?', ignoreFocusOut: true });
      if (!texto?.trim()) return;
      await sdd(['ajuste', String(n), '--ref', pasta(r.id), '--motivo', texto.trim()]);
      etapa(r, `O humano pediu ajuste no passo ${n}: "${texto.trim()}". Faça o ajuste no arquivo do passo e rode concluir ${n} de novo.`, true);
    },
    // Pergunta do Claude respondida na aba (id = Qnn, op = índice da opção | 'outra' | 'duvida').
    // Todas respondidas e refinamento rodando → o Claude continua na mesma sessão com as respostas.
    async responder({ id, op }) {
      const r = ticketAberto();
      const q = estadoSpec(r)?.perguntas.find((x) => x.id === id);
      if (!q || q.status !== 'aberta') return;
      let resposta;
      if (op === 'duvida') {
        await sdd(['duvida', 'add', '--ref', pasta(r.id), '--texto', q.pergunta, '--contexto', `${q.id} · passo ${q.passo ?? '?'}${q.contexto ? ` · ${q.contexto}` : ''}${q.opcoes?.length ? ` · opções: ${q.opcoes.join(' / ')}` : ''}`]);
        await sdd(['pergunta', 'descartar', id, '--ref', pasta(r.id)]);
        resposta = 'Tirar dúvida (vai para o time; trate como em aberto)';
      } else {
        resposta = op === 'outra' ? (await vscode.window.showInputBox({ title: q.pergunta, prompt: 'Sua resposta', ignoreFocusOut: true }))?.trim() : q.opcoes?.[Number(op)];
        if (!resposta) return;
        await sdd(['pergunta', 'responder', id, '--ref', pasta(r.id), '--resposta', resposta]);
      }
      respondidas.push(`${id} → ${resposta}`);
      const est = estadoSpec(r);
      if (!est.perguntas.some((x) => x.status === 'aberta') && estadoDe(r.id) === 'rodando' && !maestro.rodando(pasta(r.id))) {
        etapa(r, `Respostas do humano na aba: ${respondidas.join('; ')}. Continue o passo ${est.proximoPasso} com elas.`, true);
        respondidas.length = 0;
      }
      render();
    },
    docAbrir({ id }) {
      const d = docsDe(pastaDe(aberto)).find((x) => x.nome === id);
      if (!d || d.quebrado) return;
      const uri = vscode.Uri.file(d.origem || d.full);
      if (/\.md$/i.test(d.nome)) vscode.commands.executeCommand('markdown.showPreview', uri);
      else if (/\.(html?|pdf|docx|xlsx|pptx)$/i.test(d.nome)) vscode.env.openExternal(uri);
      else vscode.commands.executeCommand('vscode.open', uri);
    },
    docMencionar({ id }) {
      const d = docsDe(pastaDe(aberto)).find((x) => x.nome === id);
      if (d && !d.quebrado) mencionar(`@${d.origem || d.full}`);
    },
    handoffMencionar({ id }) { mencionar(`@${path.join(pasta(aberto), HANDOFF[id])}`); },
    handoffPrevia({ id }) { vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path.join(pasta(aberto), HANDOFF[id]))); },
    handoffEditar({ id }) { vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(pasta(aberto), HANDOFF[id]))); },
    handoffCriar({ id }) {
      const t = ticketAberto();
      gravar(t.id, HANDOFF[id], `# Análise ${id} — ${t.chave} ${t.titulo || ''}\n\n## O que foi analisado\n\n## Arquivos e pontos de alteração\n\n## Riscos e dúvidas\n`);
      acoes.handoffEditar({ id });
    },
    // Anexo do Jira → pasta do ticket (nome repetido ganha sufixo), marcado em .origem.json como vindo do Jira.
    async anexoBaixar({ id }) {
      const chave = aberto, a = cacheJira[chave]?.anexos?.find((x) => x.id === id);
      if (!a || baixando.has(id)) return;
      baixando.add(id);
      render();
      try {
        const auth = await jira.credenciais(ctx.secrets);
        if (!auth) throw new Error('credenciais do Jira não informadas');
        const r = await fetch(a.url, { headers: { Authorization: auth } });
        if (!r.ok) throw new Error(`Jira respondeu ${r.status}`);
        const dir = pasta(chave), { name, ext } = path.parse(a.nome);
        let nome = a.nome;
        for (let n = 2; fs.existsSync(path.join(dir, nome)); n++) nome = `${name}-${n}${ext}`;
        fs.writeFileSync(path.join(dir, nome), Buffer.from(await r.arrayBuffer()));
        const origens = ler(path.join(dir, ORIGEM), {});
        fs.writeFileSync(path.join(dir, ORIGEM), JSON.stringify({ ...origens, [nome]: { origem: 'jira', id } }, null, 1));
      } catch (e) {
        vscode.window.showErrorMessage(`Não consegui baixar ${a.nome}: ${e.message}`);
      } finally {
        baixando.delete(id);
        render();
      }
    },
    async anexoTodos() {
      const baixados = new Set(Object.values(ler(path.join(pasta(aberto), ORIGEM), {})).map((o) => o.id));
      for (const a of cacheJira[aberto]?.anexos || []) if (!baixados.has(a.id)) await this.anexoBaixar({ id: a.id });
    },
    todo(m) {
      const b = quadro(aberto);
      const status = m.status === 'ultima' ? b.columns.at(-1).id : m.status === 'primeira' ? b.columns[0].id : m.status;
      gravar(aberto, TODO, aplicarTodo(b, { type: m.op, title: m.titulo, id: m.id, status }));
      render();
    }
  };

  // Editor de notas (notas.js): o sid que vem da página é o ticket (ou Sem ticket) em que a nota foi aberta,
  // então um salvamento atrasado nunca cai em outro ticket.
  const daNota = (m) => {
    const dir = m.sid && pastaDe(m.sid);
    if (!dir) return;
    fs.mkdirSync(dir, { recursive: true });
    if (m.tipo === 'salvar' || m.tipo === 'mencionar') fs.writeFileSync(path.join(dir, NOTAS), m.html);
    if (m.tipo === 'estilo') fs.writeFileSync(path.join(dir, '.notas.json'), JSON.stringify(m.estilo));
    if (m.tipo === 'mencionar') mencionar(`@${path.join(dir, NOTAS)}${m.trecho ? ` (trecho: "${m.trecho.slice(0, 300)}")` : ''}`);
    if (m.tipo === 'colar') vscode.env.clipboard.readText().then((texto) => view?.webview.postMessage({ tipo: 'colado', texto }));
  };

  // Primeira mensagem da conversa nova aberta pelo ticket: vincula ao ticket e dá a ela o título dele.
  const reconciliar = () => {
    let mudou = false;
    for (const t of tickets.listar()) {
      if (!t.pedidoEm) continue;
      const sid = localizarConversa(t);
      if (sid) {
        tickets.vincular(sid, t.chave);
        const { pedidoEm, ...resto } = tickets.ler(t.chave);
        tickets.gravar(resto);
        titularConversa(sid, `${t.chave} · ${t.titulo || ''}`.trim());
        mudou = true;
      } else if (Date.now() - t.pedidoEm > 24 * 3600e3) { const { pedidoEm, ...resto } = t; tickets.gravar(resto); }
    }
    if (mudou) render();
  };

  const provider = {
    resolveWebviewView(v) {
      view = v;
      view.webview.options = { enableScripts: true };
      view.webview.onDidReceiveMessage((m) => (m.tipo ? daNota(m) : acoes[m.acao]?.call(acoes, m)));
      view.onDidChangeVisibility(() => { if (view.visible) { reconciliar(); render(); } });
      reconciliar();
      render();
    },
    // Cabeçalho e rodapé do ticket em volta das seções de outros módulos (Comandos, Evidências…).
    moldura: (secao) => {
      const t = aberto === SEM_TICKET ? { id: SEM_TICKET } : aberto && comSpec(ticketDe(aberto));
      if (!t) return null;
      // Fora do painel o rodapé fica preso embaixo (a página do outro módulo rola o body).
      return { css: CSS_MOLDURA + '<style>body { margin: 0; padding-bottom: 30px; } .ct-rod { position: fixed; left: 0; right: 0; bottom: 0; z-index: 100; }</style>',
        topo: cabecalho(t, { aba, secao }), rodape: rodape(t) };
    },
    aoMudarMoldura: (f) => { avisarMoldura = f; },
    aoPedirSecao: (f) => { pedirSecao = f; }
  };

  return vscode.Disposable.from(
    sessao.onDidChange(() => { setTimeout(reconciliar, 1500); if (aberto === SEM_TICKET) render(); }), // dá tempo de o Claude gravar a 1ª mensagem
    { dispose: fechar },
    require('./grupo').registrar(PRINCIPAL, provider)
  );
};

exports._teste = { aplicarTodo, quadro, markdown, telaLista, telaTicket, cabecalho, pagina, COLUNAS, SEM_TICKET };
