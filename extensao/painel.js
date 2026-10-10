// @ts-check
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
const { HANDOFF, dirSpec, arquivoPasso, arqHandoff, docsDaSpec, ondeSalvar } = require('./locais'); // onde cada coisa mora
const maestro = require('./maestro');
const aoVivo = require('./componentes/ao-vivo'); // caixa "Ao vivo" (aba Spec e Evidências do QA)
const menuAbas = require('./componentes/menu-abas'); // barra de abas do cabeçalho do ticket
const abaDocs = require('./componentes/aba-docs'); // aba Docs (documentos, anexos do Jira e notas)
const pill = require('./componentes/pill'); // pills de status (cabeçalho do ticket, cards e vinculados)
const listaTickets = require('./componentes/lista-tickets'); // tela inicial: módulos, pesquisa, cards e vinculados
const vinculados = require('./componentes/vinculados'); // caixa de vinculados (filtro de status por módulo)
const menuModulos = require('./componentes/menu-modulos'); // Tickets · Implementações · QA
const configuracao = require('./configuracao'); // tela do ⚙ com os cliques e testes; também lê as settings e os plugins
const { cfg, siteJira, projetoJira, reposAuto, SPECS_PADRAO, pluginInstalado, sddState } = configuracao;
const mudancas = require('./mudancas');
const notas = require('./notas').editor; // o mesmo editor da antiga aba Notas (fonte, tamanho, cores, alinhamento, busca)

// Aba Tickets: a lista e, com um ticket aberto, o ticket ocupando a view inteira —
// cabeçalho fixo (voltar, status no board, ▶ ✦ 🎫, menu), corpo com rolagem própria e rodapé (notificações).
// Comandos, Emulador, Evidências, Cofre e Conversas são de outros módulos: o grupo.js mostra cada um dentro
// da moldura deste painel (moldura()), com o mesmo cabeçalho e rodapé.
// Pasta do ticket (tickets.pasta, mesmo layout da pasta de uma conversa): .ticket.json, documentos, .notas.html,
// .tarefas.json, .decisoes.json, aprovados/ e .vigia (plugin sdd).
// "Sem ticket": a pasta da conversa atual do Claude (conversas que não são de nenhum ticket).
const { SEM_TICKET } = require('./componentes/card-ticket');
const PRINCIPAL = 'claudeAbas.painel';
const pasta = (id) => tickets.pasta(id);
const pastaDe = (id) => (id === SEM_TICKET ? (sessao.conversaAtual() ? sessao.pasta(sessao.conversaAtual()) : null) : pasta(id));
// Pasta da aba em que o ticket está aberto (Tickets = raiz; Implementações e QA = impl/ e qa/, tickets.js): documentos,
// notas, decisões e notificações das conversas daquela aba. Refinamento (spec, tarefas, dúvidas, impactos) segue na raiz.
// id pode vir como CHAVE/aba (nota salva depois de trocar de aba não cai na aba errada).
const pastaAba = (id) => {
  if (!id || id === SEM_TICKET) return pastaDe(SEM_TICKET);
  const [chave, lista] = id.split('/');
  return lista ? tickets.pasta(chave, lista) : sessao.pasta(chave);
};
const naRaiz = () => sessao.focoLista() === 'tickets'; // ticket aberto na aba Tickets (a do refinamento)
const idAba = (id) => (id === SEM_TICKET || naRaiz() ? id : `${id}/${sessao.focoLista()}`);
const ler = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const lerTexto = (arq) => { try { return fs.readFileSync(arq, 'utf8'); } catch { return null; } };
const gravar = (id, nome, dado) => {
  const dir = pastaDe(id);
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, nome), typeof dado === 'string' ? dado : JSON.stringify(dado, null, 2));
};
// Análise por camada (cards Backend/Mobile da aba Análise): o mapeamento do passo 3 mora na PASTA DA SPEC (versionado, viaja
// com a spec para quem for implementar). Fora de ~/.claude de propósito: o Claude Code bloqueia a escrita ali ("arquivo sensível").
const NOTAS = '.notas.html';
const ORIGEM = '.origem.json'; // { "arquivo.pdf": { origem: 'jira', id: '123' } }: documentos que vieram de fora
const TAREFAS = '.tarefas.json'; // cards das tarefas do passo 4 (sdd-state card); aprovar/reprovar é daqui
// O ticket com id = chave: as funções da spec (vindas do refinamento) usam r.id para achar a pasta.
const ticketDe = (chave) => { const t = tickets.ler(chave); return t && { ...t, id: chave }; };
const comSpec = (t) => t && { ...t, specPronta: !!(t.spec?.dir && estadoSpec(t)) }; // estadoSpec vem mais abaixo

// ── Spec (plugin sdd do Claude Code) ──
const copiaAprovada = (r, n) => path.join(pasta(r.id), 'aprovados', `${n}-${path.basename(arquivoPasso(r, n))}`); // gravada pelo sdd-state aprovar
const estadoSpec = (r) => (dirSpec(r) ? ler(path.join(dirSpec(r), 'sdd-state.json'), null) : null);
const STATUS = { pendente: 'Pendente', em_andamento: 'Claude trabalhando', aguardando_revisao: 'Aguardando sua revisão', aprovado: 'Aprovado', desatualizado: 'Desatualizado' };


// Markdown simples para os handoffs (títulos, listas, código, negrito, código inline).
function markdown(md) {
  const linhas = esc(md).split('\n');
  let html = '', lista = false, codigo = false;
  const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const celulas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (l.startsWith('```')) { html += codigo ? '</pre>' : '<pre>'; codigo = !codigo; continue; }
    if (codigo) { html += l + '\n'; continue; }
    // Tabela: | a | b | seguida de |---|---|
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1] || '')) {
      if (lista) { html += '</ul>'; lista = false; }
      html += `<table><tr>${celulas(l).map((c) => `<th>${c}</th>`).join('')}</tr>`;
      for (i += 2; i < linhas.length && /^\s*\|/.test(linhas[i]); i++) html += `<tr>${celulas(linhas[i]).map((c) => `<td>${c}</td>`).join('')}</tr>`;
      html += '</table>';
      i--;
      continue;
    }
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
// Busca pessoas no Jira enquanto digita; Enter numa pessoa a menciona (Enter de novo remove), "Concluir" segue.
// Devolve [{ id, nome }] (vazio = ninguém) ou undefined se cancelou.
function escolherMencoes(t, secrets) {
  return new Promise((resolve) => {
    const qp = /** @type {vscode.QuickPick<vscode.QuickPickItem & { fim?: boolean, p?: any }>} */ (vscode.window.createQuickPick()), escolhidas = new Map();
    qp.ignoreFocusOut = true; qp.matchOnDescription = true;
    qp.placeholder = 'Digite parte do nome ou do e-mail para buscar no Jira';
    let seq = 0, timer, fim = false;
    const titulo = () => { const ja = [...escolhidas.values()].map((p) => '@' + p.nome).join(', '); qp.title = ja ? `Mencionando: ${ja}` : `Mencionar alguém no comentário do ${t.chave}?`; };
    const concluir = () => ({ label: escolhidas.size ? '$(check) Concluir menções' : '$(check) Enviar sem menção', alwaysShow: true, fim: true });
    const pessoa = (p) => ({ label: p.nome, description: escolhidas.has(p.id) ? 'mencionada · Enter remove' : '', alwaysShow: true, p });
    const inicio = () => { qp.busy = false; qp.items = [concluir(), ...[...escolhidas.values()].map(pessoa)]; };
    qp.onDidChangeValue((v) => {
      clearTimeout(timer);
      const n = ++seq;
      if (!v.trim()) return inicio();
      qp.busy = true;
      timer = setTimeout(async () => {
        let itens;
        try { const achadas = await jira.pessoas(secrets, { key: t.chave, site: t.site }, v.trim()); itens = achadas.length ? achadas.map(pessoa) : [{ label: `Ninguém encontrado para "${v}"`, alwaysShow: true }]; }
        catch (e) { itens = [{ label: `$(error) ${e.message}`, alwaysShow: true }]; }
        if (n !== seq) return;
        qp.busy = false; qp.items = itens;
      }, 300);
    });
    qp.onDidAccept(() => {
      const i = qp.activeItems[0];
      if (!i) return;
      if (i.fim) { fim = true; resolve([...escolhidas.values()]); return qp.hide(); }
      if (!i.p) return;
      if (escolhidas.has(i.p.id)) escolhidas.delete(i.p.id); else escolhidas.set(i.p.id, i.p);
      titulo(); qp.value = ''; inicio();
    });
    qp.onDidHide(() => { clearTimeout(timer); qp.dispose(); if (!fim) resolve(undefined); });
    titulo(); inicio(); qp.show();
  });
}
const textoDuvida = (x) => `Dúvida levantada no refinamento: ${x.texto}${x.contexto ? `\nContexto: ${x.contexto}` : ''}`;
const tarefasDe = (dir) => { const l = dir ? ler(path.join(dir, TAREFAS), []) : []; return Array.isArray(l) ? l : []; };
const IMPACTOS = '.impactos.json'; // comentários do Jira em análise/analisados (vigia de mudanças)
const impactosDe = (dir) => { const l = dir ? ler(path.join(dir, IMPACTOS), []) : []; return Array.isArray(l) ? l : []; };
const docsDe = (dir) => (dir ? require('./documentos')._teste.listar(dir) : []);
// Docs do ticket = pasta da aba + documentos da spec (locais.docsDaSpec); mapa-*.md ficam na aba Análise.
// Fora da aba Tickets, os anexos do Jira (raiz, .origem.json) também entram; os rascunhos do refinamento não.
function docsDoTicket(t) {
  const docs = docsDe(pastaAba(t.id));
  if (!naRaiz()) { const jira = ler(path.join(pasta(t.id), ORIGEM), {}); docs.push(...docsDe(pasta(t.id)).filter((d) => jira[d.nome])); }
  const vistos = new Set(docs.map((x) => x.origem || x.full));
  for (const d of docsDaSpec(t)) if (!vistos.has(d.full) && !docs.some((x) => x.nome === d.nome)) docs.push(d);
  return docs.sort((a, b) => b.mtime - a.mtime);
}

// ── Telas ──
const IC = {
  voltar: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3L5 8l5 5"/></svg>',
  pausa: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="3" width="3" height="10" rx="1"/></svg>',
  claude: '<svg viewBox="0 0 24 24" style="fill:var(--accent)"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>',
  jira: '<svg viewBox="0 0 24 24" fill="none" style="stroke:var(--accent-soft)" stroke-width="1.8"><path d="M3 8a2 2 0 002-2h14a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2H5a2 2 0 00-2-2v-2a2 2 0 000-4z"/></svg>',
  atualizar: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13 8a5 5 0 11-1.5-3.6M13 2.5v2.8h-2.8"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 3l8 5-8 5z"/></svg>',
  parar: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8" rx="1"/></svg>',
  sino: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 11V7a4 4 0 018 0v4l1 1H3z"/><path d="M6.5 13.5a1.5 1.5 0 003 0"/></svg>',
  grade: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/></svg>',
  engrenagem: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4"/></svg>'
};

// Abas do menu do ticket em cada lista (componentes/menu-abas.js): { id, nome } = aba desta página, { secao, nome } = outra seção.
// Evidências é só do QA, logo depois de Docs.
const EVID = 'claudeAbas.evidencias';
const DOCS = { id: 'docs', nome: 'Docs' }, TICKET = { id: 'ticket', nome: 'Ticket' }, DECISOES = { id: 'decisoes', nome: 'Decisões' };
const ABAS = {
  tickets: [DOCS, { id: 'spec', nome: 'Spec' }, TICKET, { id: 'analise', nome: 'Análise' }, { id: 'tarefas', nome: 'Tarefas' }, DECISOES, { id: 'duvidas', nome: 'Dúvidas' }],
  impl: [DOCS, TICKET, DECISOES],
  qa: [DOCS, { secao: EVID, nome: 'Evidências' }, TICKET, DECISOES, { id: 'massa', nome: 'Massa' }],
  semTicket: [DOCS, DECISOES]
};
/** @returns {{ id?: string, secao?: string, nome: string }[]} */
const abasDe = (t) => ABAS[t.id === SEM_TICKET ? 'semTicket' : sessao.focoLista()] || ABAS.impl;
const FORA = () => require('./grupo')._teste.GRUPOS['claudeAbas.tickets'].slice(1).filter(([id]) => id !== EVID);

// Cabeçalho e rodapé do ticket aberto: na página do painel os botões falam com ele direto (data-acao);
// na moldura de outra seção, passam pelo grupo.js (data-painel / data-secao).
const CSS_MOLDURA = `<style>
  .ct-cab { position: sticky; top: 0; z-index: 100; flex: none; padding: 8px 10px 0; background: var(--bg);
    border-bottom: 1px solid var(--border); font-family: var(--fc-font); color: var(--text); }
  .ct-linha { display: flex; align-items: center; gap: 4px; }
  .ct-titulo { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ct-titulo .ct-chave { font-family: var(--fc-font); color: var(--accent); }
  .ct-ico.ct-play { color: var(--ia); }
  .ct-ico.ct-pausa { color: var(--warn); }
  .ct-dar { flex: none; height: 26px; padding: 0 10px; border: 0; border-radius: var(--r-md); background: var(--ia); color: var(--on-cor); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
    animation: ct-chama 1.4s infinite; }
  .ct-dar:disabled { background: color-mix(in srgb, var(--ia) 35%, transparent); animation: none; cursor: default; font-weight: 400; }
  @keyframes ct-chama { 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--ia) 30%, transparent); } }
  /* Modo refinamento: borda roxa em volta da view inteira */
  .ct-roxo { position: fixed; inset: 0; border: 2px solid var(--ia); border-radius: var(--r-sm); pointer-events: none; z-index: 300;
    box-shadow: inset 0 0 14px color-mix(in srgb, var(--ia) 22%, transparent); }
  /* Pills do topo: coluna do ticket no Jira e modo refinamento, lado a lado à esquerda */
  .ct-pills { margin: 8px 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  ${pill.CSS}
  .ct-pills .ct-ico { width: 22px; height: 22px; } .ct-pills .ct-ico svg { width: 13px; height: 13px; }
  ${menuAbas.CSS}
  .ct-rod { flex: none; height: 30px; display: flex; align-items: center; padding: 0 8px; border-top: 1px solid var(--border);
    background: var(--bg); font-family: var(--fc-font); font-size: 11.5px; color: var(--text-dim); }
  .ct-rod details { position: relative; }
  .ct-rod details[open] .ct-badge { display: none; }
  .ct-notif { display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 11.5px; line-height: 1.45; }
  .ct-notif:last-child { border-bottom: 0; }
  .ct-notif small { color: var(--text-dim); }
  .ct-notif.nova .ct-ni { color: var(--accent); }
  .ct-ni { flex: none; width: 12px; text-align: center; }
  .ct-rod summary { list-style: none; cursor: pointer; text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 11.5px; margin: 0; color: inherit; display: inline-flex; align-items: center; gap: 5px; padding: 3px 6px; border-radius: var(--r-md); }
  .ct-rod summary::-webkit-details-marker { display: none; }
  .ct-rod summary:hover { background: var(--surface-2); color: var(--text); }
  .ct-rod summary svg { width: 14px; height: 14px; }
  .ct-cmd { display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 4px; border: 0; border-radius: var(--r-md); background: none; cursor: pointer;
    font: inherit; font-size: 11.5px; color: var(--text); text-align: left; }
  .ct-cmd:hover { background: var(--surface-2); }
  .ct-cmd .ct-ci { flex: none; display: flex; color: var(--ok); }
  .ct-cmd.on .ct-ci { color: var(--perigo, var(--danger)); }
  .ct-cmd svg { width: 12px; height: 12px; }
  .ct-cmd:disabled { opacity: .55; cursor: default; }
  .ct-cmd small { color: var(--text-dim); }
  .ct-cmd-grupo { margin: 8px 0 2px; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-dim); }
  .ct-cmd-vazio { color: var(--text-dim); padding: 2px 0; }
  .ct-amb { display: inline-flex; align-items: center; gap: 6px; padding: 3px 6px; border: 0; border-radius: var(--r-md); background: none; cursor: pointer;
    font: inherit; font-size: 11.5px; color: inherit; }
  .ct-amb:hover { background: var(--surface-2); color: var(--text); }
  .ct-luz { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--text-dim); }
  .ct-luz.ok { background: var(--ok); }
  .ct-luz.prep { background: var(--ia); animation: ct-pisca 1.2s infinite; }
  .ct-luz.erro { background: var(--danger); box-shadow: 0 0 6px var(--danger); }
  .ct-luz.erro.pisca { animation: ct-pisca .8s infinite; }
  @keyframes ct-pisca { 50% { opacity: .2; } }
  .ct-badge-erro { background: var(--danger); }
  .ct-notifs { position: absolute; bottom: 30px; left: 0; width: min(320px, 90vw); max-height: 280px; overflow: auto; padding: 10px 12px; border-radius: var(--r-lg);
    background: var(--surface); border: 1px solid var(--border); box-shadow: 0 8px 30px rgb(0 0 0 / 53%); }
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
  return pill.pill(texto, { cor: modo === 'pausado' ? 'pausada' : 'ia', dica, grande: true });
}

function cabecalho(t, { aba, secao, dentro = false }) {
  const b = (cmd) => (dentro ? `data-acao="${cmd}"` : `data-painel="${cmd}"`);
  const semTicket = t.id === SEM_TICKET;
  const refino = !semTicket && naRaiz();
  const contador = (id) => (id === 'duvidas' ? [duvidasDe(pastaDe(t.id)).filter((x) => !x.resposta).length, 'dúvida(s) em aberto: a spec só avança quando todas forem respondidas']
    : id === 'tarefas' ? [tarefasDe(pastaDe(t.id)).filter((x) => x.status === 'pendente' || x.revisao).length, 'tarefa(s) esperando sua decisão'] : [0, '']);
  const itens = [...abasDe(t).map((a) => { const [badge, dica] = contador(a.id); return { ...a, badge, dica: `${badge} ${dica}` }; }),
    '|', ...FORA().map(([secao, nome]) => ({ secao, nome }))];
  return `<header class="ct-cab"><div class="ct-linha">
      <button class="ct-ico" ${dentro ? 'data-acao="voltar"' : `data-secao="${PRINCIPAL}" data-cmd="voltar"`} title="Voltar para a lista de tickets">${IC.voltar}</button>
      <span class="ct-titulo">${semTicket ? 'Sem ticket' : `<span class="ct-chave">${esc(t.chave)}</span> · ${esc(t.titulo || '')}`}</span>
      ${refino ? botaoRefino(t, b) : !semTicket && sessao.focoLista() === 'qa' ? (require('./qa').rodando(pastaAba(t.id))
    ? `<button class="ct-ico ct-pausa" ${b('qaParar')} title="Pausar o QA: o cenário em andamento é descartado e volta na retomada">${IC.pausa}</button>`
    : `<button class="ct-ico ct-play" ${b('qaPlay')} title="Executar QA: planejamento, ambiente, massa e cenários pendentes (Ao vivo em Evidências)">${IC.play}</button>`) : ''}
      <button class="ct-ico" ${b('claude')} title="Abrir a conversa do Claude${semTicket ? '' : ' deste ticket'}">${IC.claude}</button>
      ${semTicket ? '' : `<button class="ct-ico" ${b('jira')} title="Ver o ticket no Jira">${IC.jira}</button>`}
    </div>
    <div class="ct-pills">${semTicket ? pill.pill('Sem ticket vinculado', { grande: true, bola: false, dica: 'Documentos e notas da conversa atual do Claude, que não pertence a nenhum ticket' })
      : `${pill.status(t.status, { grande: true, dica: `Coluna do ticket no board do Jira${t.tipo ? ` · ${t.tipo}` : ''}` })}
      ${refino && emRefino(t) ? pillRefino(t) : ''}
      <button class="ct-ico" ${b('atualizar')} title="Atualizar status e anexos do Jira">${IC.atualizar}</button>`}</div>
    ${refino && emRefino(t) && t.refinamento.estado !== 'pausado' ? '<div class="ct-roxo"></div>' : ''}
    ${menuAbas.menu(itens, { aba, secao, principal: PRINCIPAL, dentro })}
  </header>`;
}

// Notificações: .notificacoes.jsonl da pasta (hook notificacoes.py e sdd-state); lidas = mais antigas que .notificacoes.lidas.
// Abrir o 🔔 marca como lidas (o contador some pelo CSS na hora e no próximo desenho pelo arquivo).
const NOTIF = '.notificacoes.jsonl', LIDAS = '.notificacoes.lidas';
const ICONE_NOTIF = { fim: '✓', permissao: '⚠', sdd: '◆', duvida: '?', aviso: '•', jira: '◇', mudanca: '⚠' };
// Grava uma linha no 🔔 do ticket (o encaminhador do Teams lê as mesmas linhas).
const notificar = (chave, tipo, texto) => { try { fs.appendFileSync(path.join(pasta(chave), NOTIF), JSON.stringify({ em: new Date().toISOString(), tipo, texto }) + '\n'); } catch {} };
const notifsDe = (dir) => {
  const linhas = (dir && lerTexto(path.join(dir, NOTIF))) || '';
  return linhas.split('\n').flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).reverse().slice(0, 50);
};
let cmdsAberto = false; // caixa Comandos do rodapé aberta (a tela se redesenha a cada terminal aberto/fechado)
const rodape = (t, dentro = false) => {
  const dir = t && pastaAba(t.id);
  const l = notifsDe(dir), lidas = Date.parse((dir && lerTexto(path.join(dir, LIDAS))) || '') || 0;
  const nova = (n) => Date.parse(n.em) > lidas; // o hook (Python) e o sdd-state (JS) escrevem ISO em formatos diferentes
  const novas = l.filter(nova).length;
  const cmds = require('./comandos').api?.lista() || [], emus = require('./emulador').api?.lista() || [];
  const acao = dentro ? 'data-acao' : 'data-painel';
  const caixaCmds = `<details class="ct-cmds"${cmdsAberto ? ' open' : ''}><summary ${acao}="cmdsAlternar">${IC.play} Comandos</summary>
    <div class="ct-notifs">${cmds.length ? cmds.map((c) => `<button class="ct-cmd ${c.rodando ? 'on' : ''}" ${acao}="cmdAlternar" data-id="${esc(c.id)}"
      title="${c.rodando ? 'Parar' : 'Executar'}"><span class="ct-ci">${c.rodando ? IC.parar : IC.play}</span>${esc(c.nome)}</button>`).join('') : '<div class="ct-cmd-vazio">Nenhum comando. Cadastre em Configurações → Comandos.</div>'}
    ${emus.length ? `<div class="ct-cmd-grupo">Emuladores</div>${emus.map((c) => `<button class="ct-cmd ${c.rodando ? 'on' : ''}" ${acao}="emuAlternar" data-id="${esc(c.id)}" ${c.ocupado ? 'disabled' : ''}
      title="${esc(c.ocupado || (c.rodando ? 'Desligar' : 'Ligar'))}"><span class="ct-ci">${c.rodando ? IC.parar : IC.play}</span>${esc(c.nome)}${c.ocupado ? ` <small>${esc(c.ocupado)}</small>` : ''}</button>`).join('')}` : ''}</div></details>`;
  // QA: ambiente depois de Comandos. Preparando → abre o log ao vivo; erro → luz vermelha piscando e bolinha até abrir a análise (Evidências).
  const amb = t && t.id !== SEM_TICKET && sessao.focoLista() === 'qa' ? require('./qa').statusAmbiente(dir) : null;
  const caixaAmb = !amb ? '' : amb.tipo === 'preparando'
    ? `<button class="ct-amb" ${acao}="qaAmbLog" title="Preparando API, Metro, emulador e app: clique para ver o log ao vivo"><span class="ct-luz prep"></span>Preparando ambiente</button>`
    : amb.tipo === 'erro'
      ? `<button class="ct-amb" ${acao}="${amb.analisando ? 'qaAmbLog' : 'qaAmbErro'}" title="${amb.analisando ? 'O Claude está analisando o erro: clique para ver o log ao vivo' : 'Ver o erro e a análise do Claude'}"><span class="ct-luz erro ${amb.nova || amb.analisando ? 'pisca' : ''}"></span>Ambiente parou${amb.analisando ? ' · analisando' : ''}${amb.nova ? '<span class="ct-badge ct-badge-erro">1</span>' : ''}</button>`
      : `<button class="ct-amb" ${acao}="qaAmbLog" title="Ambiente pronto: clique para ver o log"><span class="ct-luz ok"></span>Ambiente</button>`;
  return `<footer class="ct-rod"><details><summary ${dentro ? 'data-acao' : 'data-painel'}="notifLidas">${IC.sino} Notificações
    ${novas ? `<span class="ct-badge">${novas}</span>` : ''}</summary>
  <div class="ct-notifs">${l.length ? l.map((n) => `<div class="ct-notif ${nova(n) ? 'nova' : ''}"><span class="ct-ni">${ICONE_NOTIF[n.tipo] || '•'}</span>
    <span>${esc(n.texto)}<br><small>${esc(quando(n.em))}</small></span></div>`).join('') : 'Nenhuma notificação ainda.'}</div></details>${caixaCmds}${caixaAmb}</footer>`;
};

const estilo = ESTILO_NOTAS + CSS_MOLDURA + `<style>
  html, body { height: 100%; }
  body { display: flex; flex-direction: column; }
  .rolagem { flex: 1; min-height: 0; overflow-y: auto; }
  .tipo { flex: none; font-size: 9.5px; font-weight: 600; padding: 1px 7px; border-radius: var(--r-pill); color: var(--cor); background: color-mix(in srgb, var(--cor) 15%, transparent); }
  .t-tecnico { --cor: var(--ia); } .t-funcional { --cor: var(--warn); } .t-spec { --cor: var(--ok); }
  .secundario { flex: none; height: 34px; padding: 0 12px; border-radius: var(--r-md); font-size: 12px; font-weight: 600;
    color: var(--ok) !important; border: 1px solid color-mix(in srgb, var(--ok) 55%, transparent) !important; background: var(--surface) !important; box-shadow: var(--sombra); }
  .secundario:hover { background: color-mix(in srgb, var(--ok) 14%, transparent) !important; }
  /* Constituição: os 7 passos do SDD — cinza até acontecer */
  .sdd-topo { font-size: 11.5px; color: var(--text-dim); margin-bottom: 10px; line-height: 1.5; }
  .sdd-topo b { color: var(--text); }
  .passos { display: flex; flex-direction: column; gap: 8px; }
  .passo { border-radius: var(--r-lg); border: 1px solid var(--border); background: var(--surface-2); padding: 9px 10px; }
  .passo .cab { display: flex; align-items: center; gap: 8px; }
  .num { flex: none; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
    background: var(--border); color: var(--text-dim); }
  .passo .nome { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; }
  .passo .st { flex: none; font-size: 10px; padding: 1px 7px; border-radius: var(--r-pill); border: 1px solid var(--border); color: var(--text-dim); }
  .passo .corpo-passo { margin: 8px 0 0 30px; font-size: 11.5px; color: var(--text-dim); line-height: 1.55; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
  .chip { font-size: 10.5px; padding: 0 7px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .chip.alerta { color: var(--perigo); border-color: color-mix(in srgb, var(--perigo) 45%, transparent); }
  .arquivo { display: inline-flex; gap: 2px; margin-top: 6px; }
  .acoes-passo { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .acoes-passo button { height: 26px; padding: 0 10px; border-radius: var(--r-md); font-size: 11.5px; font-weight: 600; border: 1px solid var(--border) !important; background: var(--surface) !important; color: var(--text); }
  .acoes-passo button.aprovar { background: var(--ok) !important; color: var(--on-cor); border-color: transparent !important; }
  .acoes-passo button:disabled, .acoes-passo button.travado { opacity: .45; cursor: not-allowed; }
  .motivo { color: var(--perigo); }
  .lista-mini { margin: 4px 0 0; padding-left: 14px; }
  .lista-mini li { margin: 2px 0; }
  .s-pendente { opacity: .45; filter: grayscale(1); }
  .s-em_andamento { border-color: var(--accent); animation: pulsa 1.6s infinite; }
  .s-em_andamento .num { background: var(--accent); color: var(--on-cor); }
  @keyframes pulsa { 50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); } }
  .s-aguardando_revisao { border-color: var(--warn); }
  .s-aguardando_revisao .num { background: var(--warn); color: var(--on-cor); }
  .s-aguardando_revisao .st { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 50%, transparent); }
  .s-aprovado { border-color: color-mix(in srgb, var(--ok) 55%, transparent); background: color-mix(in srgb, var(--ok) 8%, var(--surface-2)); }
  .s-aprovado .num { background: var(--ok); color: var(--on-cor); }
  .s-aprovado .st { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
  .s-desatualizado { border-color: var(--warn); }
  .s-desatualizado .num { background: var(--warn); color: var(--on-cor); }
  .s-desatualizado .st { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 50%, transparent); }
  .aguardando { color: var(--warn); }
  /* Detalhe */
  .menu { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; max-width: 100%; }
  .menu .fb-btn { flex: none; padding: 0 6px; font-size: 11.5px; }
  .menu::-webkit-scrollbar { display: none; }
  .aba[hidden] { display: none; }
  .folha { padding: 12px 14px; }
  .folha h3 { margin: 0 0 6px; font-size: 13px; }
  .vazio-aba { color: var(--text-dim); font-size: 12px; line-height: 1.6; text-align: center; padding: 18px 6px; }
  .acoes-aba { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .md { font-size: 12.5px; line-height: 1.55; }
  .md h3, .md h4, .md h5, .md h6 { margin: .8em 0 .3em; } .md h3:first-child { margin-top: 0; }
  .md pre { background: var(--surface-2); padding: 8px; border-radius: var(--r-md); white-space: pre-wrap; font-size: 11.5px; }
  .md code { font-family: var(--fc-mono); font-size: .92em; }
  .md ul { padding-left: 1.3em; margin: .3em 0; }
  .ticket-link { font-family: var(--fc-mono); font-size: 13px; color: var(--accent); word-break: break-all; }
  /* Decisões: histórico; clique expande o resumo embaixo */
  .hist { display: flex; flex-direction: column; }
  .decisao { border-left: 2px solid var(--border); margin-left: 4px; padding: 0 0 2px 12px; position: relative; }
  .decisao::before { content: ''; position: absolute; left: -5px; top: 9px; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
  .decisao summary { list-style: none; cursor: pointer; display: flex; align-items: baseline; gap: 8px; padding: 5px 6px; border-radius: var(--r-md); }
  .decisao summary::-webkit-details-marker { display: none; }
  .decisao summary:hover { background: var(--surface-2); }
  .quando { flex: none; font-family: var(--fc-font); font-size: 10.5px; color: var(--text-dim); }
  .dtitulo { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .decisao[open] .dtitulo { white-space: normal; }
  .origem { flex: none; font-size: 9.5px; padding: 0 6px; border-radius: var(--r-pill); border: 1px solid var(--border); color: var(--text-dim); }
  .o-pergunta { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .dresumo { margin: 2px 6px 10px; padding: 8px 10px; border-radius: var(--r-md); background: var(--surface-2); font-size: 12px; line-height: 1.55; }
  .dresumo p { margin: 0 0 6px; }
  .dtrecho { font-size: 11.5px; color: var(--text-dim); }
  .agora { margin: 0 12px 10px; padding: 10px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border);
    border-left: 3px solid var(--ia); box-shadow: var(--sombra); font-size: 12px; line-height: 1.5; }
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
  .ptam { display: inline-flex; gap: 2px; margin: 0 2px; padding: 0 2px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
  .pnav #pPos { min-width: 42px; text-align: center; }
  .pilha.grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--pw, 240px), 100%), 1fr)); gap: 10px; margin-bottom: 12px; }
  .pilha.grade::before, .pilha.grade::after { display: none !important; }
  .pilha.grade .pcard { min-height: 0; max-height: none; animation: none; }
  .pnav button.is-on { background: color-mix(in srgb, var(--ia) 22%, transparent); color: var(--ia); }
  .pcard { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 8px; min-height: 200px; max-height: 320px; overflow: auto;
    padding: 14px 14px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--ia);
    box-shadow: var(--sombra); animation: sobe 220ms ease-out; }
  @keyframes sobe { from { transform: translateY(8px); opacity: 0; } }
  .pcab { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); }
  .pcab b { color: var(--ia); }
  .pcard .ptexto { font-size: 13px; font-weight: 600; line-height: 1.45; }
  .pcard .pctx { font-size: 11.5px; color: var(--text-dim); line-height: 1.45; }
  .popcoes { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
  .popcoes button { padding: 7px 10px; border: 1px solid var(--border) !important; border-radius: var(--r-md); background: var(--surface-2) !important;
    font-size: 12px; text-align: left; line-height: 1.35; }
  .popcoes button:hover { border-color: var(--ia) !important; }
  .prod { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 10px; margin-top: auto; padding-top: 4px; }
  .prod button { white-space: nowrap; }
  .prod button { font-size: 11.5px; color: var(--text-dim); padding: 2px 0; }
  .prod button:hover { color: var(--text); text-decoration: underline; }
  .prod .duv { color: var(--accent); }
  .tboard { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 12px 12px; align-items: flex-start; }
  .tcol { flex: 1 0 210px; min-width: 210px; display: flex; flex-direction: column; gap: 6px; padding: 6px; border-radius: var(--r-lg); background: var(--surface-2); }
  .tcol-t { display: flex; justify-content: space-between; padding: 2px 4px 4px; font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-dim); }
  .tvazio { text-align: center; color: var(--text-dim); font-size: 11px; padding: 8px 0; }
  .tcard { display: flex; flex-direction: column; gap: 6px; padding: 9px 10px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--border);
    box-shadow: 0 1px 2px rgb(0 0 0 / 18%); cursor: pointer; font-size: 12px; line-height: 1.4; }
  .tcard:hover { border-color: var(--accent); }
  .tcard.ts-em_alteracao { border-color: var(--ia); }
  .tcard.ts-reprovada .ttit { color: var(--text-dim); text-decoration: line-through; }
  .ttit { font-weight: 500; word-break: break-word; }
  .tpe { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; font-size: 10.5px; color: var(--text-dim); }
  .tid { font-weight: 600; color: var(--text-dim); }
  .tcam { padding: 0 5px; border-radius: var(--r-sm); font-size: 10px; text-transform: uppercase; background: var(--surface-2); }
  .cam-backend { background: color-mix(in srgb, var(--text) 14%, transparent); color: var(--text); }
  .cam-mobile { background: color-mix(in srgb, var(--ok) 22%, transparent); color: var(--ok); }
  .tjira { color: var(--accent-soft); font-weight: 600; }
  .tav { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; background: var(--accent); color: var(--on-cor); font-size: 9px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  .mudancas { display: flex; flex-direction: column; gap: 8px; margin: 0 12px 12px; }
  .mud { position: relative; padding: 9px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--cor); font-size: 12px; }
  .mud-l1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; }
  .mud-niv { display: inline-flex; align-items: center; padding: 0 6px; border-radius: var(--r-sm); font-size: 10px; font-weight: 700; color: var(--on-cor); background: var(--cor); }
  .mud-q { color: var(--text-dim); } .mud-l1 a { color: var(--accent-soft); margin-left: auto; }
  .mud-tx { margin-top: 4px; line-height: 1.45; }
  .mud-ef { margin-top: 4px; font-size: 11px; color: var(--text-dim); }
  .decisao { margin: 0 12px 12px; padding: 10px 12px; border-radius: var(--r-lg); border: 2px solid var(--perigo); background: color-mix(in srgb, var(--perigo) 7%, var(--surface)); font-size: 12px; display: flex; flex-direction: column; gap: 6px; }
  .dec-t { display: flex; align-items: center; gap: 8px; font-size: 12.5px; } .dec-ic { color: var(--perigo); }
  .dec-fila { margin-left: auto; font-size: 10.5px; color: var(--text-dim); }
  .dec-cm { padding: 6px 8px; border-radius: var(--r-md); background: var(--surface-2); font-style: italic; line-height: 1.45; word-break: break-word; }
  .dec-op { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
  .dec-op button { padding: 4px 10px; border-radius: var(--r-md); font-size: 11.5px; font-weight: 600; border: 1px solid var(--border) !important; background: var(--surface) !important; color: var(--text); }
  .dec-op button:first-child { background: var(--accent) !important; color: var(--on-cor); border-color: transparent !important; }
  .dec-op .dec-nao { margin-left: auto; color: var(--perigo); border-color: color-mix(in srgb, var(--perigo) 50%, transparent) !important; }
  .passo.s-atencao { border-color: #f58a1f; background: color-mix(in srgb, #f58a1f 12%, var(--surface-2)); opacity: 1; filter: none; }
  .passo.s-atencao .num { background: #f58a1f; color: var(--on-cor); }
  .aten { flex: none; color: #f58a1f; font-size: 13px; cursor: help; }
  .tcard.tatencao { border-color: #f58a1f; background: color-mix(in srgb, #f58a1f 10%, var(--surface)); }
  .tcard .taten { color: #f58a1f; margin-right: 4px; cursor: help; }
  .mud-ok { margin-top: 6px; padding: 2px 10px; border: 1px solid var(--border) !important; border-radius: var(--r-md); font-size: 11px; }
  .trev { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: var(--r-sm); font-size: 10px; background: color-mix(in srgb, var(--ia) 25%, transparent); color: var(--ia); }
  .tm-rev { padding: 8px 10px; border-radius: var(--r-md); border: 1px solid var(--ia); background: color-mix(in srgb, var(--ia) 8%, transparent); }
  .tm-rev b { color: var(--ia); }
  .tqa { border-left: 3px solid var(--warn); }
  .selo-qa { display: inline-block; margin-right: 6px; padding: 0 5px; border-radius: var(--r-sm); font-size: 10px; font-weight: 700; background: var(--warn); color: var(--on-cor); vertical-align: 1px; }
  .tres { font-size: 11px; color: var(--text-dim); line-height: 1.4; }
  .tm-desc.md { white-space: normal; max-height: 50vh; overflow: auto; }
  .tm-desc.md h3, .tm-desc.md h4, .tm-desc.md h5 { margin: 10px 0 4px; }
  .md table { border-collapse: collapse; margin: 6px 0; font-size: 11.5px; }
  .md th, .md td { border: 1px solid var(--border); padding: 3px 7px; text-align: left; }
  .md th { background: var(--surface-2); }
  .tproc { display: flex; align-items: center; font-size: 11px; color: var(--ia); }
  .tmodal { position: fixed; inset: 0; z-index: 300; background: rgb(0 0 0 / 55%); display: flex; align-items: flex-start; justify-content: center; padding: 24px 10px; overflow: auto; }
  .tm-caixa { width: min(560px, 100%); display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: var(--r-lg); background: var(--surface);
    border: 1px solid var(--border); box-shadow: 0 12px 40px rgb(0 0 0 / 45%); font-size: 12.5px; line-height: 1.5; }
  .tm-cab { display: flex; align-items: center; gap: 8px; }
  .tm-x { margin-left: auto; width: 26px; height: 26px; border-radius: var(--r-md); }
  .tm-x:hover { background: var(--surface-2); }
  .tstatus { padding: 0 7px; border-radius: var(--r-pill); font-size: 10.5px; border: 1px solid var(--border); }
  .tstatus.ts-aprovada { color: var(--ok); border-color: var(--ok); } .tstatus.ts-reprovada { color: var(--danger); border-color: var(--danger); }
  .tstatus.ts-em_alteracao { color: var(--ia); border-color: var(--ia); }
  .tm-caixa h3 { margin: 0; font-size: 14px; }
  .tm-desc { white-space: pre-wrap; word-break: break-word; padding: 8px 10px; border-radius: var(--r-md); background: var(--surface-2); }
  .tm-ls { display: flex; flex-direction: column; gap: 4px; }
  .tm-l { display: flex; gap: 10px; font-size: 12px; } .tm-l > span { flex: none; width: 130px; color: var(--text-dim); }
  .tm-l a { color: var(--accent-soft); }
  .tm-campos { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
  .tm-campos label { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-dim); }
  .tm-campos input:not([type]) { flex: 1; max-width: 160px; height: 26px; padding: 0 8px; border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface-2); color: var(--text); font: inherit; }
  .tchk { cursor: pointer; } .tchk input { margin: 0; }
  .tm-acoes { display: flex; gap: 6px; flex-wrap: wrap; }
  .tm-acoes button { height: 28px; padding: 0 12px; border: 1px solid var(--border) !important; border-radius: var(--r-md); font-size: 12px; }
  .tm-acoes .aprovar { background: var(--ok) !important; border-color: var(--ok) !important; color: var(--on-cor); }
  .tm-acoes .reprovar { color: var(--danger); }
  .tm-alt textarea { width: 100%; min-height: 80px; box-sizing: border-box; margin-bottom: 6px; padding: 8px; border: 1px solid var(--border); border-radius: var(--r-md);
    background: var(--surface-2); color: var(--text); font: inherit; resize: vertical; }
  .tm-hist { font-size: 11px; color: var(--text-dim); border-top: 1px solid var(--border); padding-top: 6px; display: flex; flex-direction: column; gap: 2px; }
  .tm-hist span { margin-right: 6px; }
  .previa-acoes { display: flex; gap: 8px; padding: 6px 0 8px; }
  .previa-acoes button { height: 28px; padding: 0 12px; border: 1px solid var(--border) !important; border-radius: var(--r-md); font-size: 12px; }
  .previa-acoes .primario { border-color: transparent !important; }
  ${aoVivo.CSS}
  .duvida { padding: 4px 0 10px 12px; }
  .duvida .dlinha { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; }
  .duvida .dtexto { margin: 4px 0; font-size: 12.5px; line-height: 1.5; }
  .duvida .enviar { border: 1px solid var(--border); margin-top: 6px; }
  .duvida summary { text-transform: none; letter-spacing: 0; font-size: 11.5px; font-weight: 400; color: inherit; margin: 0; }
  .duvida .dtexto { display: block; margin-top: 4px; }
  .caixa-enviadas { margin-top: 14px; padding: 8px; border-radius: var(--r-md); background: var(--surface-2); }
  .caixa-enviadas .titulo-caixa { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); margin-bottom: 6px; }
  .duvida.enviada { opacity: .6; } .duvida.enviada:hover, .duvida.enviada[open] { opacity: .9; }
  .duvida .sug { border-left: 3px solid var(--accent); padding-left: 8px; }
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
  .erro { color: var(--danger); font-size: 12px; margin: 0 12px 8px; }
  ${abaDocs.CSS}
  ${listaTickets.CSS}
  ${configuracao.CSS}
</style><style>${jira.estiloDetalhe}</style>`;

// Visualização de um ticket vinculado (sem trazer para a lista): o mesmo conteúdo da aba Ticket.
const telaPrevia = (key, dados) => `${estilo}
  <header class="ct-cab"><div class="ct-linha">
    <button class="ct-ico" data-acao="previaFechar" title="Voltar para a lista">${IC.voltar}</button>
    <span class="ct-titulo"><span class="ct-chave">${esc(key)}</span>${dados?.resumo ? ` · ${esc(dados.resumo)}` : ''}</span>
    <button class="ct-ico" data-acao="previaJira" data-id="${esc(key)}" title="Ver no Jira">${IC.jira}</button></div>
    <div class="previa-acoes"><button class="primario" data-acao="meuPuxar" data-id="${esc(key)}">↑ Puxar para a lista</button>
      <button data-acao="meuRemover" data-id="${esc(key)}">✕ Remover dos vinculados</button></div></header>
  <main class="rolagem">${dados?.erro ? `<p class="erro">${esc(dados.erro)}</p>` : dados ? jira.folhaTicket(dados) : '<div class="folha"><div class="vazio-aba">Carregando do Jira…</div></div>'}</main>`;

function telaConstituicao(r, est, abertos, impactos = []) {
  if (!est) return `<div class="vazio-aba">A spec ainda não foi iniciada.<br>Clique em <b>▶</b> no topo: o Claude cria <code>specs/NNN-…/</code> em ${esc(path.basename(r.spec?.repo || 'repositório'))} e começa pelo passo 0.</div>`;
  const abertas = est.perguntas.filter((q) => q.status === 'aberta');
  const bloq = est.achados.filter((a) => a.severidade === 'bloqueante' && a.status === 'aberto');
  const ROTULO = { regras: 'regras', proibicoes: 'proibições', secoes: 'seções', rfs: 'requisitos', historias: 'histórias', bordas: 'casos de borda',
    tecnologias: 'tecnologias', endpoints: 'endpoints', entidades: 'entidades', violacoes: 'violações', tarefas: 'tarefas', feitas: 'feitas',
    ultimaTarefa: 'última tarefa', ultimoCommit: 'último commit' };
  const vivo = !maestro.rodando(pasta(r.id)); // Aprovar só com o Claude parado
  const atencao = mudancas.passosAfetados(impactos), decide = mudancas.pendentes(impactos).length > 0; // mudança pedida em comentário, ainda sem decisão
  const chip = (k, v, alerta) => `<span class="chip ${alerta ? 'alerta' : ''}">${esc(ROTULO[k] || k)}: ${esc(Array.isArray(v) ? v.join(', ') : v)}</span>`;
  return `<div class="sdd-topo"><b>${esc(est.feature)}</b> · ${esc(path.basename(r.spec.repo))}<br>Próxima ação: ${esc(est.proximaAcao || '')}</div>
  <div class="passos">${est.passos.map((p) => {
    const lido = abertos.has(`${r.id}:${p.n}:${p.hash}`);
    const portaoFechado = p.n === 2 ? abertas.length : p.n === 5 ? bloq.length : 0;
    const resumo = Object.entries(p.resumo || {}).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length));
    const extra = p.n === 2 && est.perguntas.length ? `<ul class="lista-mini">${est.perguntas.map((q) => `<li><b>${esc(q.id)}</b> ${esc(q.pergunta)} — ${q.status === 'respondida' ? esc(q.resposta) : `<i>${esc(q.status)}</i>`}</li>`).join('')}</ul>`
      : p.n === 5 && est.achados.length ? `<ul class="lista-mini">${est.achados.map((a) => `<li><b>${esc(a.id)}</b> [${esc(a.severidade)}] ${esc(a.descricao)} — <i>${esc(a.status)}</i></li>`).join('')}</ul>`
      : '';
    const aten = atencao.has(p.n) && p.status !== 'pendente';
    return `<div class="passo s-${esc(p.status)}${aten ? ' s-atencao' : ''}">
      <div class="cab"><span class="num">${p.n}</span>${aten ? '<span class="aten" title="Um comentário do Jira pediu uma mudança que pode atingir este passo. Nada foi alterado: decida na caixa vermelha acima.">⚠</span>' : ''}<span class="nome">${esc(p.titulo)}${p.portao ? ` · Portão ${p.portao}` : ''}</span>
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
          <button class="aprovar ${vivo && !decide ? '' : 'travado'}" data-acao="specAprovar" data-id="${p.n}" ${decide ? 'disabled' : !vivo || (lido && !portaoFechado) ? '' : 'disabled'}
            title="${decide ? 'Decida primeiro a mudança pedida em comentário do Jira (caixa vermelha acima)' : !vivo ? 'O Claude ainda está trabalhando: espere a etapa terminar' : !lido ? 'Abra o arquivo antes de aprovar: nunca aprove sem ler' : portaoFechado ? 'Resolva as pendências do portão' : 'Aprovar este passo'}">Aprovar</button>
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
// Cards que ainda esperam decisão para o passo poder ser aprovado: dev (tNN) no passo 4, o [QA] no passo 6.
const semDecisaoDo = (n, l) => l.filter((c) => (n === 6 ? c.tipo === 'qa' : c.tipo !== 'qa') && ['pendente', 'em_alteracao'].includes(c.status));

function cartaoAgora(t, est, rodandoAgora, tarefas = [], impactos = []) {
  const modo = t.refinamento?.estado;
  const passo = est && est.proximoPasso <= 6 ? est.passos[est.proximoPasso] : null;
  const abertas = est ? est.perguntas.filter((q) => q.status === 'aberta') : [];
  const duvidasAbertas = duvidasDe(pastaDe(t.id) || pasta(t.chave)).filter((x) => !x.resposta).length;
  let titulo, texto = '', acoes = '';
  if (rodandoAgora) [titulo, texto] = [`Claude trabalhando${passo ? ` · passo ${passo.n} · ${passo.titulo}` : ''}`, 'Acompanhe abaixo. ⏸ no topo pausa depois desta etapa.'];
  else if (!est) [titulo, texto] = ['Spec não iniciada', 'Clique em ▶ no topo para o Claude criar a spec.'];
  else if (abertas.length) {
    // Perguntas em pilha: um card por vez, as outras como bordas atrás. ‹ › passa sem responder; ▦ mostra todas em grade
    // (a navegação é só na página: script "Pilha de perguntas" em pagina()). Respondeu, o card sai e a pilha anda.
    const resto = Math.min(abertas.length - 1, 2);
    // Comentário do Jira que a triagem achou que responde a pergunta: só sugere, quem responde é você.
    const sugestaoDe = (id) => { const i = impactos.find((x) => x.pergunta?.id === id); return i ? `<div class="pctx">💬 Comentário de <b>${esc(i.autor)}</b> parece responder: ${esc(i.pergunta.motivo)} <a href="${esc(i.link)}">ver comentário</a></div>` : ''; };
    const card = (q, i) => `<div class="pcard" data-pq="${i}" data-qid="${esc(q.id)}" ${i ? 'hidden' : ''}>
      <div class="pcab"><b>${esc(q.id)}</b>${q.passo !== undefined ? `<span>passo ${esc(q.passo)}</span>` : ''}</div>
      <div class="ptexto">${esc(q.pergunta)}</div>
      ${q.contexto ? `<div class="pctx">${esc(q.contexto)}</div>` : ''}
      ${sugestaoDe(q.id)}
      <div class="popcoes">${(q.opcoes || []).map((o, k) => `<button data-acao="responder" data-id="${esc(q.id)}" data-op="${k}">${esc(o)}</button>`).join('')}</div>
      <div class="prod"><button data-acao="responder" data-id="${esc(q.id)}" data-op="outra">Outra resposta…</button>
        <button class="duv" data-acao="responder" data-id="${esc(q.id)}" data-op="duvida">Tirar dúvida</button></div>
    </div>`;
    return `<div class="pilha-t"><span>Perguntas do Claude</span>${abertas.length > 1 ? `<span class="pnav">
      <button data-pilha="ant" title="Pergunta anterior">‹</button><span id="pPos">1 de ${abertas.length}</span>
      <button data-pilha="prox" title="Próxima pergunta (sem responder esta)">›</button>
      <span class="ptam" hidden><button data-pilha="menor" title="Cards menores (mais por linha)">−</button><button data-pilha="maior" title="Cards maiores (menos por linha)">+</button></span>
      <button data-pilha="grade" title="Ver todas as perguntas">${IC.grade}</button></span>` : '<span>última</span>'}</div>
    <div class="pilha atras-${resto}" id="pilha">${abertas.map(card).join('')}</div>`;
  } else if (passo?.status === 'aguardando_revisao' && [4, 6].includes(passo.n) && semDecisaoDo(passo.n, tarefas).length) {
    const n = semDecisaoDo(passo.n, tarefas).length;
    [titulo, texto, acoes] = passo.n === 4
      ? [`Revise as tarefas · ${n} sem decisão`, 'Aprove (vira subtarefa no Jira), reprove ou peça alteração em cada card. Depois aprove o passo 4 aqui.', '<button class="primario" data-acao="aba" data-id="tarefas">Abrir Tarefas</button>']
      : ['Revise o plano de testes', 'O card [QA] está na aba Tarefas: aprove (cria a subtarefa [QA] no Jira com o plano), reprove ou peça alteração. Depois aprove o passo 6 aqui.', '<button class="primario" data-acao="aba" data-id="tarefas">Abrir Tarefas</button>'];
  } else if (passo?.status === 'aguardando_revisao') [titulo, texto] = [`Revise o passo ${passo.n} · ${passo.titulo}`, `Abra <b>${esc(path.basename(arquivoPasso(t, passo.n)))}</b> no cartão do passo, leia e clique em <b>Aprovar</b> ou <b>Pedir ajuste</b>.`];
  else if (!passo) [titulo, texto] = ['Spec concluída', 'Todos os passos aprovados.'];
  else if (modo === 'aguardando_inicio') [titulo, texto, acoes] = ['Spec criada', `Próximo: passo ${passo.n} · ${passo.titulo}.`, '<button class="primario" data-acao="darInicio">Dar início</button>'];
  else if (modo === 'pausado') [titulo, texto, acoes] = ['Refinamento pausado', `Para em: passo ${passo.n} · ${passo.titulo}.`, '<button class="primario" data-acao="retomar">▶ Retomar</button>'];
  else if (duvidasAbertas) [titulo, texto, acoes] = [`Passo ${passo.n} · ${passo.titulo} bloqueado`, `Há ${duvidasAbertas} dúvida(s) em aberto. A spec só avança quando todas forem respondidas.`, '<button class="primario" data-acao="aba" data-id="duvidas">Ver dúvidas</button>'];
  else [titulo, texto, acoes] = [`Pronto para o passo ${passo.n} · ${passo.titulo}`, 'O Claude não está rodando agora.', '<button class="primario" data-acao="retomar">Continuar</button>'];
  return `<div class="agora ${rodandoAgora ? 'trabalhando' : ''}"><div class="atitulo">${rodandoAgora ? '<span class="vivo-bola"></span>' : ''}${titulo}</div>
    ${texto ? `<div class="atexto">${texto}</div>` : ''}${acoes ? `<div class="aacoes">${acoes}</div>` : ''}</div>`;
}


// ── Tarefas: cards do passo 4 (como no Jira). Pendentes → você aprova (vira subtarefa no Jira), reprova ou pede
// alteração (o Claude ajusta em segundo plano). O detalhe abre por cima do quadro (script "Tarefas" em pagina()).
const STATUS_T = { pendente: 'Pendente', em_alteracao: 'Claude alterando', aprovada: 'Aprovada', reprovada: 'Reprovada' };
const COLUNAS_T = [['Pendentes', ['pendente', 'em_alteracao']], ['Aprovadas', ['aprovada']], ['Reprovadas', ['reprovada']]];
const iniciais = () => (os.userInfo().username.split(/[._-]/).map((x) => x[0]).join('').slice(0, 2) || 'EU').toUpperCase();
function telaTarefas(t, l, impactos = []) {
  const atencao = mudancas.cardsAfetados(impactos);
  if (!l.length) return `<div class="folha"><div class="vazio-aba">Nenhuma tarefa ainda.<br>No passo 4 da spec o Claude cria as tarefas e elas aparecem aqui como cards,
    para você aprovar (vira subtarefa no Jira em ${esc(t.chave)}), reprovar ou pedir alteração.</div></div>`;
  const chip = (c) => `${c.camada ? `<span class="tcam cam-${esc(c.camada)}">${esc(c.camada)}</span>` : ''}
    ${c.estimativa ? `<span class="test" title="Estimativa original">⏱ ${esc(c.estimativa)}</span>` : ''}
    ${c.jira ? `<span class="tjira">${esc(c.jira)}</span>` : ''}
    ${c.vinculado ? `<span class="tav" title="Vinculada a você">${esc(iniciais())}</span>` : ''}`;
  const card = (c) => `<div class="tcard ts-${esc(c.status)} ${c.tipo === 'qa' ? 'tqa' : ''} ${atencao.has(c.id) ? 'tatencao' : ''}" data-tcard="${esc(c.id)}" title="Abrir ${esc(c.id)}">
    <div class="ttit">${atencao.has(c.id) ? '<span class="taten" title="Uma mudança pedida em comentário do Jira pode atingir este card (aguarda sua decisão na aba Spec)">⚠</span>' : ''}${c.tipo === 'qa' ? '<span class="selo-qa">QA</span>' : ''}${esc(c.titulo || c.id)}${c.revisao ? '<span class="trev" title="Uma mudança no ticket atingiu esta subtarefa">↻ revisar</span>' : ''}</div>
    ${c.tipo === 'qa' && c.resumo ? `<div class="tres">${esc(c.resumo)}</div>` : ''}
    ${c.status === 'em_alteracao' ? '<div class="tproc"><span class="vivo-bola"></span>Claude alterando…</div>' : ''}
    <div class="tpe"><span class="tid">${esc(c.id)}</span>${chip(c)}</div></div>`;
  const linha = (rot, v) => (v ? `<div class="tm-l"><span>${rot}</span><div>${v}</div></div>` : '');
  const modal = (c) => {
    const aberta = c.status === 'pendente';
    return `<div class="tmodal" data-tmodal="${esc(c.id)}" hidden><div class="tm-caixa">
      <div class="tm-cab"><span class="tid">${esc(c.id)}</span><span class="tstatus ts-${esc(c.status)}">${STATUS_T[c.status] || esc(c.status)}</span>
        <button class="tm-x" data-tfechar title="Fechar (Esc)">✕</button></div>
      <h3>${esc(c.titulo || c.id)}</h3>
      ${c.status === 'em_alteracao' ? `<div class="tproc"><span class="vivo-bola"></span>Claude aplicando: “${esc(c.alteracao || '')}”</div>` : ''}
      ${c.tipo === 'qa' ? `<div class="tm-desc md">${markdown(lerTexto(c.arquivo || '') || 'Plano de testes não encontrado.')}</div>`
        : `<div class="tm-desc">${esc(c.descricao || 'Sem descrição.')}</div>`}
      <div class="tm-ls">
        ${linha('Pronto quando', esc(c.pronto || ''))}
        ${linha('Requisitos', esc((c.rf || []).join(', ')))}
        ${linha('Depende de', esc((c.depende || []).join(', ')))}
        ${linha('Camada', esc(c.camada || ''))}
        ${linha('Jira', c.jira ? `<a href="${esc(t.site)}/browse/${esc(c.jira)}">${esc(c.jira)}</a>` : '')}
        ${!aberta ? linha('Estimativa original', esc(c.estimativa || '—')) + linha('Responsável', c.vinculado ? 'você' : '—') : ''}
        ${c.motivo ? linha('Motivo', esc(c.motivo)) : ''}
      </div>
      ${aberta ? `<div class="tm-campos">
        <label>Estimativa original<input data-tcampo="estimativa" value="${esc(c.estimativa || '')}" placeholder="ex.: 30m, 2h, 1d"></label>
        <label class="tchk"><input type="checkbox" data-tcampo="vinculado" ${c.vinculado ? 'checked' : ''}>Vincular a mim (responsável no Jira)</label></div>
      <div class="tm-acoes"><button class="aprovar" data-tacao="tarefaAprovar">Aprovar</button>
        <button class="reprovar" data-tacao="tarefaReprovar">Reprovar</button><button data-talterar>Pedir alteração</button></div>
      <div class="tm-alt" hidden><textarea placeholder="O que o Claude deve mudar nesta tarefa?"></textarea>
        <div class="tm-acoes"><button class="primario" data-tenviar>Enviar para o Claude</button><button data-tcancelar>Cancelar</button></div></div>` : ''}
      ${c.revisao ? `<div class="tm-rev"><b>↻ Alteração proposta</b> — ${esc(c.revisao.motivo)}
        ${c.revisao.comentario ? ` · <a href="${esc(c.revisao.comentario)}">comentário</a>` : ''}
        ${Object.entries(c.revisao.campos || {}).map(([k, v]) => `<div class="tm-l"><span>${esc(k)} (novo)</span><div>${esc(v)}</div></div>`).join('')}
        ${c.tipo === 'qa' ? '<div class="tm-l"><span>Plano</span><div>testes.md atualizado (acima)</div></div>' : ''}
        <div class="tm-acoes"><button class="aprovar" data-tacao="revisaoAplicar">Aplicar no Jira</button><button data-tacao="revisaoDescartar">Descartar</button></div></div>` : ''}
      ${(c.historico || []).length ? `<div class="tm-hist">${c.historico.map((h) => `<div><span>${esc(quando(h.em))}</span> ${esc(h.texto || h.evento)}</div>`).join('')}</div>` : ''}
    </div></div>`;
  };
  return `<div class="tboard">${COLUNAS_T.map(([nome, sts]) => {
    const cs = l.filter((c) => sts.includes(c.status));
    return `<div class="tcol"><div class="tcol-t">${nome}<span>${cs.length}</span></div>${cs.map(card).join('') || '<div class="tvazio">—</div>'}</div>`;
  }).join('')}</div>${l.map(modal).join('')}`;
}

// Mudanças vindas de comentários do Jira: o vigia acha, o Claude mede (nível) e regride a spec; aqui você vê e dá ciência.
const NIVEL = { alto: ['ALTO', 'var(--danger)'], medio: ['MÉDIO', 'var(--warn)'], baixo: ['BAIXO', 'var(--ok)'], nenhum: ['SEM IMPACTO', 'var(--text-dim)'] };
// Mudança pedida em comentário que espera você: a spec NÃO foi alterada. Uma por vez, a mais antiga primeiro.
function caixaDecisao(l) {
  const p = mudancas.pendentes(l);
  if (!p.length) return '';
  const i = p[0], [rot, cor] = NIVEL[i.nivel] || [i.nivel, 'var(--perigo)'];
  const bt = (op, texto, cls = '') => `<button class="${cls}" data-acao="mudancaDecidir" data-id="${esc(i.id)}" data-op="${op}">${esc(texto)}</button>`;
  return `<div class="decisao"><div class="dec-t"><span class="dec-ic">⚠</span><b>Mudança pedida no ticket</b>
      <span class="mud-niv" style="--cor:${cor}">${esc(rot)}</span>${p.length > 1 ? `<span class="dec-fila">+${p.length - 1} na fila</span>` : ''}</div>
    <div class="mud-l1"><b>${esc(i.autor || 'alguém')}</b><span class="mud-q">${esc(quando(i.data))}</span><a href="${esc(i.link)}">ver comentário</a></div>
    <div class="dec-cm">${esc((i.texto || '').slice(0, 300))}</div>
    <div class="mud-tx">${esc(i.resumo || '')}</div>
    <div class="mud-ef"><b>A spec ainda não foi alterada.</b> ${Number.isInteger(i.passo) ? `Passo afetado: ${esc(i.passo)} (e os que dependem dele). ` : ''}${(i.cards || []).length ? `Cards atingidos: ${esc(i.cards.join(', '))}.` : ''}</div>
    <div class="dec-op">${(i.opcoes || []).map((o, k) => bt(k, o.rotulo)).join('')}${bt('nao', 'Não prosseguir', 'dec-nao')}</div></div>`;
}

const VISIVEIS = ['na_fila', 'triagem', 'triando', 'analisando', 'aplicando', 'aplicado', 'erro', 'analisado']; // os demais já foram decididos
function caixaMudancas(l) {
  const vis = l.filter((i) => VISIVEIS.includes(i.status) && !(i.status === 'analisado' && i.nivel === 'nenhum')).slice().reverse().slice(0, 5);
  if (!vis.length) return '';
  return `<div class="caixa-t">Mudanças por comentário<span>${vis.length}</span></div><div class="mudancas">${vis.map((i) => {
    const [rot, cor] = NIVEL[i.nivel] || ['ANALISANDO', 'var(--ia)'];
    return `<div class="mud" style="--cor:${cor}">
      <div class="mud-l1"><span class="mud-niv">${i.status === 'analisado' ? rot : i.status === 'aplicado' ? 'APLICADA' : i.status === 'erro' ? 'NÃO CONCLUÍDO' : `<span class="vivo-bola"></span>${i.status === 'aplicando' ? 'APLICANDO' : i.status === 'triagem' || i.status === 'triando' ? 'TRIANDO' : 'ANALISANDO'}`}</span>
        <b>${esc(i.autor || 'alguém')}</b><span class="mud-q">${esc(quando(i.data))}</span><a href="${esc(i.link)}">ver comentário</a></div>
      <div class="mud-tx">${esc(i.resumo || (i.texto || '').slice(0, 220))}</div>
      ${['analisado', 'aplicado'].includes(i.status) && i.nivel !== 'nenhum' ? `<div class="mud-ef">${i.passo !== null && i.passo !== undefined ? `Spec voltou ao passo ${esc(i.passo)}. ` : ''}${(i.cards || []).length ? `Cards atingidos: ${esc(i.cards.join(', '))} (revise na aba Tarefas).` : ''}</div>` : ''}
      ${!['na_fila', 'triagem', 'triando', 'analisando', 'aplicando'].includes(i.status) ? `<button class="mud-ok" data-acao="impactoCiente" data-id="${esc(i.id)}">Ciente</button>` : ''}
      ${['aplicado', 'erro'].includes(i.status) && i.snapshot ? `<button class="mud-ok" data-acao="mudancaDesfazer" data-id="${esc(i.id)}" title="Volta a spec e os cards ao estado de antes da aplicação">Desfazer</button>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function corpoAba(t, aba, d) {
  const semTicket = t.id === SEM_TICKET;
  if (aba === 'docs') return abaDocs.corpo(d, semTicket);
  if (aba === 'spec') return `${emRefino(t) || d.estado ? cartaoAgora(t, d.estado, d.vivoRodando, d.tarefas, d.impactos) : ''}${caixaDecisao(d.impactos)}${caixaMudancas(d.impactos)}${aoVivo.caixa(d.dir, d.vivoRodando, 'spec')}<div class="folha">${t.spec?.dir ? telaConstituicao(t, d.estado, d.abertos, d.impactos)
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
  if (aba === 'tarefas') return telaTarefas(t, d.tarefas, d.impactos);
  if (aba === 'massa') return require('./qa').massaHtml(pastaAba(t.id), vscode.workspace.getConfiguration('craftingTable').get('qaHoraRefresh') || '06:00');
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
  if (aba === 'duvidas') {
    const card = (x) => {
      const aberta = !x.resposta, ev = x.enviadaEm;
      const corpo = `${x.contexto ? `<div class="dtrecho"><b>Contexto:</b> ${esc(x.contexto)}</div>` : ''}
        ${x.resposta ? `<div class="dtrecho resp"><b>Resposta${x.resposta.origem === 'comentario' ? ` · comentário de ${esc(x.resposta.autor || '')}` : ' · dada por você'}:</b> ${esc(x.resposta.texto)}</div>` : ''}
        ${aberta && x.sugestao ? `<div class="dtrecho sug"><b>Possível resposta de ${esc(x.sugestao.autor || 'alguém')}:</b> “${esc(String(x.sugestao.texto).slice(0, 600))}”<br><i>${esc(x.sugestao.motivo)}</i>
          <div class="acoes-aba"><button class="fb-btn enviar" data-acao="duvidaConfirmar" data-id="${esc(x.id)}">Confirmar como resposta</button>
          <button class="fb-btn" data-acao="duvidaRejeitar" data-id="${esc(x.id)}">Não é a resposta</button></div></div>` : ''}
        <div class="acoes-aba">${!ev ? `<button class="fb-btn enviar" data-acao="duvidaEnviar" data-id="${esc(x.id)}">Enviar para os comentários do ticket</button>` : ''}
          ${aberta ? `<button class="fb-btn" data-acao="duvidaResponder" data-id="${esc(x.id)}">Dar resposta</button>` : ''}</div>`;
      const marca = x.resposta ? '✓ Respondida' : ev ? `Aguardando resposta${x.sugestao ? ' · resposta sugerida' : ''}` : 'Não enviada';
      return `<details class="decisao duvida${ev ? ' enviada' : ''}"${!ev || x.sugestao ? ' open' : ''}>
        <summary><span class="quando">${esc(quando(x.em))}</span> <b>${esc(x.id)}</b> <span class="origem">${marca}</span><span class="dtexto">${esc(x.texto)}</span></summary>${corpo}</details>`;
    };
    const l = d.duvidas.slice().reverse(), novas = l.filter((x) => !x.enviadaEm), enviadas = l.filter((x) => x.enviadaEm);
    return `<div class="folha">${l.length ? `${novas.length ? `<div class="hist">${novas.map(card).join('')}</div>` : ''}
      ${enviadas.length ? `<div class="caixa-enviadas"><div class="titulo-caixa">Enviadas ao ticket (${enviadas.length})</div><div class="hist">${enviadas.map(card).join('')}</div></div>` : ''}`
      : '<div class="vazio-aba">Nenhuma dúvida registrada ainda.<br>No modo refinamento, quando você escolher <b>Tirar dúvida</b> numa pergunta do Claude, ela aparece aqui.</div>'}</div>`;
  }
  return '';
}

const telaTicket = (t, aba, d) => `${estilo}${cabecalho(t, { aba, secao: PRINCIPAL, dentro: true })}
  <main class="rolagem">${corpoAba(t, aba, d)}</main>${rodape(t, true)}`;

// Aviso no topo quando o instalar.sh precisa rodar de novo (preenchido por conferirInstalacao).
const bannerInstalacao = () => (configuracao.aviso() ? `<div style="padding:8px 10px;background:var(--accent-soft);color:var(--on-cor);font:12px var(--fc-font)">
  <b>Atualização pendente</b><div style="margin:2px 0 6px;opacity:.85">${esc(configuracao.aviso().motivos.join(' · '))}</div>
  <button data-acao="atualizarExtensao" style="height:24px;padding:0 10px;border-radius:6px;background:var(--bg);color:var(--text);font-size:11.5px">Atualizar agora</button></div>` : '');
function pagina(nonce, corpo, nota) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>body { font-family: var(--fc-font); margin: 0; } button { font: inherit; cursor: pointer; border: 0; background: none; color: inherit; } [hidden] { display: none !important; }</style>
${nota ? notas.CSS_NOTAS : ''}</head><body>${bannerInstalacao()}${corpo}
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

  // Lista de tickets: pesquisa, ordem e os seletores da caixa de vinculados.
  ${listaTickets.script('ticketsAntigos')}
  ${vinculados.script()}

  // Pilha de perguntas: ‹ › troca o card de cima, ▦ alterna para a grade com todas. Lembra a pergunta e o modo.
  const pilha = document.getElementById('pilha');
  if (pilha) {
    const cards = [...pilha.querySelectorAll('.pcard')], pos = document.getElementById('pPos');
    const st = vscode.getState() || {};
    let i = Math.max(0, cards.findIndex((c) => c.dataset.qid === st.pqId));
    if (i === 0 && st.pqId && !cards.some((c) => c.dataset.qid === st.pqId)) i = Math.min(st.pq || 0, cards.length - 1); // respondida: fica na mesma posição
    let grade = !!st.pgrade && cards.length > 1;
    // Largura mínima do card na grade: o número de colunas se ajusta sozinho (auto-fill) à largura da tela.
    let largura = st.pw || 240;
    const tam = document.querySelector('.ptam');
    const mostrar = () => {
      pilha.classList.toggle('grade', grade);
      pilha.style.setProperty('--pw', largura + 'px');
      if (tam) tam.hidden = !grade;
      cards.forEach((c, k) => { c.hidden = !grade && k !== i; });
      if (pos) pos.textContent = grade ? cards.length + ' perguntas' : (i + 1) + ' de ' + cards.length;
      document.querySelector('[data-pilha="grade"]')?.classList.toggle('is-on', grade);
      vscode.setState({ ...(vscode.getState() || {}), pq: i, pqId: cards[i]?.dataset.qid, pgrade: grade, pw: largura });
    };
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pilha]');
      if (!b) return;
      if (b.dataset.pilha === 'maior' || b.dataset.pilha === 'menor') largura = Math.min(560, Math.max(160, largura + (b.dataset.pilha === 'maior' ? 40 : -40)));
      else if (b.dataset.pilha === 'grade') grade = !grade;
      else { grade = false; i = (i + (b.dataset.pilha === 'prox' ? 1 : -1) + cards.length) % cards.length; }
      mostrar();
    });
    mostrar();
  }

  // A página é redesenhada a cada linha nova do Ao vivo: a caixa e o corpo voltam para onde estavam.
  ${aoVivo.script('vivo')}
  const corpo = document.querySelector('main.rolagem');
  if (corpo) {
    corpo.scrollTop = (vscode.getState() || {}).rolagem || 0;
    corpo.addEventListener('scroll', () => vscode.setState({ ...(vscode.getState() || {}), rolagem: corpo.scrollTop }));
  }

  // Tarefas: clique no card abre o detalhe; Esc/✕/fundo fecha. Campos e ações vão para a extensão.
  // O detalhe aberto e o rascunho do pedido de alteração sobrevivem ao redesenho.
  if (document.querySelector('[data-tmodal]')) {
    const estado = () => vscode.getState() || {};
    const abrirT = (id) => {
      document.querySelectorAll('[data-tmodal]').forEach((m) => { m.hidden = m.dataset.tmodal !== id; });
      vscode.setState({ ...estado(), tmodal: id || null });
    };
    const rascunho = (id, texto) => { const r = { ...(estado().talt || {}) }; if (texto === null) delete r[id]; else r[id] = texto; vscode.setState({ ...estado(), talt: r }); };
    const camposDe = (m) => m.querySelectorAll('[data-tcampo]').forEach((i) =>
      enviar({ acao: 'tarefaCampo', id: m.dataset.tmodal, campo: i.dataset.tcampo, valor: i.type === 'checkbox' ? i.checked : i.value }));
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-tcard]');
      if (c) return abrirT(c.dataset.tcard);
      const m = e.target.closest('[data-tmodal]');
      if (!m) return;
      const id = m.dataset.tmodal, alt = m.querySelector('.tm-alt');
      if (e.target === m || e.target.closest('[data-tfechar]')) return abrirT(null);
      const a = e.target.closest('[data-tacao]');
      if (a) { camposDe(m); return enviar({ acao: a.dataset.tacao, id }); }
      if (e.target.closest('[data-talterar]')) { alt.hidden = false; alt.querySelector('textarea').focus(); return; }
      if (e.target.closest('[data-tcancelar]')) { alt.hidden = true; rascunho(id, null); return; }
      if (e.target.closest('[data-tenviar]')) {
        const texto = alt.querySelector('textarea').value.trim();
        if (!texto) return alt.querySelector('textarea').focus();
        enviar({ acao: 'tarefaAlterar', id, texto });
        rascunho(id, null);
        abrirT(null);
      }
    });
    document.querySelectorAll('[data-tcampo]').forEach((i) => i.addEventListener('change', () =>
      enviar({ acao: 'tarefaCampo', id: i.closest('[data-tmodal]').dataset.tmodal, campo: i.dataset.tcampo, valor: i.type === 'checkbox' ? i.checked : i.value })));
    document.querySelectorAll('.tm-alt textarea').forEach((ta) => ta.addEventListener('input', () => rascunho(ta.closest('[data-tmodal]').dataset.tmodal, ta.value)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrirT(null); });
    const st = estado();
    for (const [id, texto] of Object.entries(st.talt || {})) {
      const m = document.querySelector('[data-tmodal="' + id + '"] .tm-alt');
      if (m) { m.hidden = false; m.querySelector('textarea').value = texto; }
    }
    if (st.tmodal && document.querySelector('[data-tmodal="' + st.tmodal + '"]')) abrirT(st.tmodal);
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
    .filter((sid) => (lerTexto(jsonl(sid)) || '').includes(tickets.pasta(t.chave, t.pedidoLista)) && inicioDa(sid) >= desde)
    .sort((a, b) => inicioDa(a) - inicioDa(b))[0] || null;
}
// Título da conversa: a mesma linha que o /rename do Claude grava (custom-title vence o ai-title).
function titularConversa(sid, titulo, tentativas = 20) {
  const arq = jsonl(sid);
  if (!fs.existsSync(arq)) { if (tentativas) setTimeout(() => titularConversa(sid, titulo, tentativas - 1), 1500); return; }
  const atual = fs.readFileSync(arq, 'utf8');
  fs.appendFileSync(arq, (atual.endsWith('\n') ? '' : '\n') + JSON.stringify({ type: 'custom-title', sessionId: sid, customTitle: titulo }) + '\n');
}
const ultimaConversa = (t) => require('./claude').ultimaConversa(t, sessao.focoLista());


// Caixa de vinculados de cada módulo (componentes/vinculados.js): título, seletor do topo e quais status do Jira entram.
const VINCULADOS = {
  tickets: { titulo: 'Vinculados a você', seletor: 'etapa' },
  impl: { titulo: 'Vinculados a você', status: ['Buffer', 'Não iniciado', 'Em andamento|In progress'] },
  qa: { titulo: 'Com a label', seletor: 'label', status: ['Pronto para QA|Pronto p/ QA', 'Teste integrado'] }
};

exports.provider = (ctx) => {
  let view, aberto = null, aba = 'docs', lado = 'backend', observador;
  const abertos = new Set(); // passos cujo arquivo o humano abriu nesta sessão (ticket:passo:hash)
  const cacheJira = {}; // chave -> dados do Jira (ou { erro })
  // Lista mostrada: Tickets, Implementações ou QA (ticket.lista: 'impl' | 'qa'). Cada uma tem a sua caixa de vinculados.
  let modoLista = ctx.globalState.get('listaModo') || 'tickets';
  const naLista = (t, l = modoLista) => tickets.listasDe(t).includes(l);
  // Põe o ticket também nesta aba (não tira das outras); grava listas no lugar do lista/implementacao de antes.
  const porNaLista = (t) => (naLista(t) ? t : tickets.gravar({ ...t, listas: [...tickets.listasDe(t), modoLista], lista: undefined, implementacao: undefined }));
  const meusPor = {}; // modo -> { itens, etapas, filtro, erro, carregando, semCredencial, em }: caixa "Vinculados a você"
  let etapasJira = null; // colunas do board [{ nome, ids }] (buscadas uma vez por sessão)
  // Configurações (⚙): settings craftingTable.*; vazio cai nos valores de antes (primeiro ticket da lista).
  const cfg = () => vscode.workspace.getConfiguration('craftingTable');
  const projetoJira = () => cfg().get('jiraProjeto') || (tickets.listar()[0]?.chave || 'WMS').split('-')[0];
  // Mudou a configuração (aqui ou nas settings): esquece o que foi buscado com a configuração antiga.
  ctx.subscriptions?.push(vscode.workspace.onDidChangeConfiguration((ev) => {
    if (!ev.affectsConfiguration('craftingTable')) return;
    etapasJira = null; for (const k in meusPor) delete meusPor[k];
    if (conf.aberta()) render();
  }));
  const conf = configuracao.criar(ctx, { render: () => render(), voltar: IC.voltar, aoAbrir: () => { previa = null; aberto = null; sessao.focar(null); } });
  let previa = null; const cachePrevia = {}; // ticket vinculado aberto só para ver (chave) e os dados dele
  // Implementações: só os que estão em Buffer, Não iniciado ou Em andamento/In progress (pelo nome do status, sem acento).
  // QA: os com a label de QA (não o responsável) em Pronto para QA ou Teste integrado.
  const labelQA = () => ctx.globalState.get('labelQA') || '';
  let labelsQA = null; // labels do Jira com "QA" (buscadas uma vez por sessão)
  const carregarMeus = async (forcar) => {
    const k = modoLista, meus = meusPor[k], fixo = k !== 'tickets';
    if (meus?.carregando || (!forcar && meus?.em && Date.now() - meus.em < 120000)) return;
    if (!forcar && !(await ctx.secrets.get('jira.token'))) { meusPor[k] = { semCredencial: true, em: Date.now() }; return render(); }
    meusPor[k] = { ...(meus || {}), carregando: true, semCredencial: false };
    render();
    const filtro = fixo ? '' : ctx.globalState.get('meusFiltro') || '';
    const projeto = projetoJira();
    try {
      // Etapas = colunas do board Downstream (buscadas uma vez); a escolhida vira os status dela na busca.
      let avisoBoard = '';
      if (!etapasJira && !fixo) etapasJira = await jira.etapas(ctx.secrets, siteJira(), projeto, cfg().get('jiraBoard') || 'Downstream', cfg().get('etapasExtras') || []).catch((e) => { avisoBoard = e.message; return null; });
      const coluna = (etapasJira || []).find((c) => c.nome === filtro);
      if (k === 'qa' && (!labelsQA || forcar)) labelsQA = await jira.labels(ctx.secrets, siteJira(), 'qa');
      let itens = k === 'qa' && !labelQA() ? [] : await jira.meus(ctx.secrets, siteJira(), coluna?.ids, k === 'qa' ? labelQA() : '');
      itens = vinculados.filtrar(itens, VINCULADOS[k].status);
      meusPor[k] = { itens, label: labelQA(), labels: labelsQA, etapas: (etapasJira || []).map((c) => c.nome), filtro: coluna ? filtro : '', aviso: avisoBoard, ocultos: ctx.globalState.get('meusOcultos') || [], em: Date.now() };
    } catch (e) { meusPor[k] = { erro: e.message, label: labelQA(), labels: labelsQA, etapas: (etapasJira || []).map((c) => c.nome), filtro, em: Date.now() }; }
    render();
  };
  const baixando = new Set(); // ids de anexos sendo baixados
  let avisarMoldura = () => {}, pedirSecao = (/** @type {string} */ _secao) => {};
  for (const m of ['comandos', 'emulador']) require('./' + m).aoMudar(() => ((conf.aberta() && conf.aba() === 'comandos') || aberto ? render() : avisarMoldura()));
  // ⚙ na barra de título da view (ao lado de "Crafting Table"): volta para a seção principal e abre as configurações.
  ctx.subscriptions?.push(vscode.commands.registerCommand('claudeAbas.configuracoes', async () => {
    if (!require('./grupo').telaCheiaAberta()) await vscode.commands.executeCommand('claudeAbas.tickets.focus');
    pedirSecao(PRINCIPAL);
    acoes.config();
  }));

  const fechar = () => { observador?.close(); observador = null; };
  const render = () => {
    if (!view) return;
    fechar();
    const nonce = crypto.randomBytes(16).toString('hex');
    let t = aberto === SEM_TICKET ? { id: SEM_TICKET, conversas: [] } : aberto && comSpec(ticketDe(aberto));
    // Todos os passos aprovados: o modo refinamento termina sozinho.
    if (t && emRefino(t) && t.specPronta && estadoSpec(t).proximoPasso > 6) t = { ...t, refinamento: modo(t.id, 'concluido') };
    if (!t) {
      aberto = null; sessao.focar(null);
      if (conf.aberta()) { view.webview.html = pagina(nonce, estilo + conf.corpo()); avisarMoldura(); return; }
      if (previa) { view.webview.html = pagina(nonce, telaPrevia(previa, cachePrevia[previa])); avisarMoldura(); return; }
      const meus = meusPor[modoLista];
      view.webview.html = pagina(nonce, estilo + listaTickets.corpo(tickets.listar().filter((x) => naLista(x)).map((x) => ({ ...x, refinando: emRefino(x) })),
        meus ? { ...meus, ocultos: ctx.globalState.get('meusOcultos') || [] } : {}, { modo: modoLista, vinculados: VINCULADOS[modoLista] }));
      avisarMoldura();
      if (!meus?.carregando) carregarMeus(false);
      return;
    }
    if (!abasDe(t).some((a) => a.id === aba)) aba = 'docs';
    // Confere os arquivos da spec antes de desenhar: edição depois de aprovado volta o passo para revisão.
    if (aba === 'spec' && dirSpec(t) && fs.existsSync(path.join(dirSpec(t), 'sdd-state.json')) && sddState()) {
      try { require('child_process').execFileSync(sddState(), ['check', '--ref', pasta(t.id)], { timeout: 5000, stdio: 'ignore' }); } catch {}
    }
    const dir = pastaDe(t.id), dirAba = pastaAba(t.id);
    const d = {
      dir, lado, abertos,
      docs: t.id === SEM_TICKET ? docsDe(dir) : docsDoTicket(t),
      handoffs: t.id === SEM_TICKET ? {} : { backend: lerTexto(arqHandoff(t, 'backend')), mobile: lerTexto(arqHandoff(t, 'mobile')) },
      tarefas: t.id === SEM_TICKET ? [] : tarefasDe(dir),
      decisoes: decisoesDe(dirAba),
      duvidas: duvidasDe(dir),
      impactos: t.id === SEM_TICKET ? [] : impactosDe(dir),
      vivoRodando: t.id !== SEM_TICKET && maestro.rodando(dir),
      estado: dirSpec(t) ? estadoSpec(t) : null,
      jira: cacheJira[t.id],
      origens: dir ? ler(path.join(dir, ORIGEM), {}) : {},
      baixando
    };
    view.webview.html = pagina(nonce, telaTicket(t, aba, d), aba === 'docs' && dirAba
      ? { html: lerTexto(path.join(dirAba, NOTAS)) || '', sid: idAba(t.id), estilo: ler(path.join(dirAba, '.notas.json'), null) || notas.ESTILO_PADRAO } : null);
    avisarMoldura();
    // O Claude grava documentos, handoffs, decisões e o estado da spec por fora: redesenha quando muda
    // (as notas não, para não atropelar a digitação).
    let espera;
    const depois = (ms) => { clearTimeout(espera); espera = setTimeout(render, ms); };
    const obs = [];
    for (const p of new Set([dir, dirAba])) try { if (p) obs.push(fs.watch(p, (_, nome) => { if (nome !== NOTAS && nome !== '.notas.json' && nome !== '.decisoes.lock' && nome !== LIDAS) depois(300); })); } catch {}
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
  // Plugin "mapa" (mapeamento do código do passo 3): mora na extensão e só o maestro carrega (--plugin-dir).
  const MAPA = path.join(__dirname, 'plugins', 'mapa');
  const FOCO = path.join(__dirname, 'plugins', 'foco'); // texto curto em tudo que o Claude escreve (regras + medição dos .md)
  const FERRAMENTAS = () => [...binsSdd().map((b) => `Bash(${b}:*)`), `Bash(${MAPA}/bin/mapa-git:*)`, `Bash(${MAPA}/bin/mapa-conferir:*)`,
    `Bash(${MAPA}/bin/mapa-db:*)`, 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill',
    'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(git status:*)', 'Bash(git log:*)', 'Bash(git diff:*)'];
  const reposDe = (t) => {
    const lista = (cfg().get('repositorios') || []).filter((r) => r?.caminho && fs.existsSync(r.caminho));
    return lista.length ? lista : reposAuto(t?.spec?.repo || cfg().get('specsDir') || SPECS_PADRAO);
  };
  // Banco do mapeamento: conexão/ambiente vêm das configurações (o Claude não escolhe a base). Sem isso, mapa-db recusa.
  const bancoEnv = (t) => {
    const conexao = cfg().get('bancoConexao') || '', ambiente = cfg().get('bancoAmbiente') || '';
    return { MAPA_DB_CONEXAO: conexao, MAPA_DB_AMBIENTE: ambiente, MAPA_DB_SQLCL: cfg().get('bancoSqlcl') || '',
      MAPA_DB_SENSIVEIS: (cfg().get('bancoColunasSensiveis') || []).join(','), MAPA_DB_LOG: path.join(pasta(t.chave), '.mapa-db.jsonl') };
  };
  const etapa = (t, texto, continuar = false, cwd = t.spec?.repo, titulo) => {
    const repos = reposDe(t);
    const bd = bancoEnv(t);
    return maestro.rodar(pasta(t.chave), {
      cwd, continuar, titulo, ferramentas: FERRAMENTAS(), env: bd, aoMudar: () => { render(); depoisDaEtapa(t); },
      // O foco substitui o i-have-adhd global nestas execuções (as regras não entram duas vezes).
      extras: [...(cfg().get('modelo') ? ['--model', cfg().get('modelo')] : []), ...(cfg().get('esforco') ? ['--effort', cfg().get('esforco')] : []),
        '--plugin-dir', FOCO, '--plugin-dir', MAPA, '--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }), '--add-dir', pasta(t.chave), ...repos.map((r) => r.caminho)],
      prompt: `[segundo plano] [Crafting Table · ticket ${t.chave}] ${texto}\nPasta do ticket: ${pasta(t.chave)} · sdd-state: ${sddState()}`
        + ondeSalvar(t)
        + `\nRepositórios de código: ${repos.map((r) => `${r.camada}: ${r.caminho}${r.refRelease ? ` (ref de release: ${r.refRelease})` : ''}`).join(' · ') || 'nenhum configurado'}`
        + ` · plugin mapa: ${MAPA} (bin/mapa-git, bin/mapa-conferir, bin/mapa-db)`
        + `\nBanco de dados: ${bd.MAPA_DB_CONEXAO && bd.MAPA_DB_AMBIENTE && bd.MAPA_DB_AMBIENTE !== 'producao' ? `configurado (${bd.MAPA_DB_AMBIENTE === 'qas' ? 'QAS' : 'cópia de produção'}): use mapa-db (só leitura)` : 'NÃO configurado: não consulte banco; liste as consultas como pendência'}`
    });
  };
  // Execução terminou: card que o Claude não confirmou (sdd-state card editar) volta a Pendente; depois, a fila.
  const alterando = new Set();
  const depoisDaEtapa = (t) => {
    if (maestro.rodando(pasta(t.chave))) return;
    if (alterando.size) {
      const l = tarefasDe(pasta(t.chave));
      let mudou = false;
      for (const c of l) if (alterando.has(c.id) && c.status === 'em_alteracao' && !c.fila) {
        c.status = 'pendente';
        (c.historico ||= []).push({ em: new Date().toISOString(), evento: 'alteracao', texto: 'O Claude não confirmou a alteração: confira e peça de novo se precisar' });
        mudou = true;
      }
      alterando.clear();
      if (mudou) gravar(t.chave, TAREFAS, l);
    }
    avisarImpactos(t);
    filaTriagem(t);
    filaImpactos(t);
    filaTarefas(t);
  };
  // Execução terminou: o que ficou sem registro vira erro; a análise que mexeu na spec é desfeita; decisão pendente e
  // aplicação concluída avisam quem iniciou o refinamento (esta máquina).
  const avisarImpactos = (t) => {
    const l = impactosDe(pasta(t.chave));
    let mudou = false;
    const spec = dirSpec(ticketDe(t.chave) || t);
    for (const i of l) {
      const falta = { triando: 'a triagem (sdd-state comentario classificar)', analisando: 'a análise (sdd-state impacto registrar)', aplicando: 'a aplicação (sdd-state impacto aplicado): confira os arquivos ou desfaça' }[i.status];
      if (falta) { i.resumo = `O Claude não registrou ${falta} deste comentário.`; i.status = 'erro'; mudou = true; }
      if (i.snapAnalise) { // a análise é só leitura: se a spec mudou, volta ao que era
        const id = `a${i.id}`;
        if (mudancas.alterou(pasta(t.chave), spec, id) && mudancas.restaurar(pasta(t.chave), spec, id)) {
          Object.assign(i, { status: 'erro', resumo: 'A análise alterou a spec (era só para medir): desfeito automaticamente. Peça a análise de novo.' });
        }
        fs.rmSync(path.join(pasta(t.chave), 'snapshots', id), { recursive: true, force: true });
        delete i.snapAnalise; mudou = true;
      }
      if (['analisado', 'aguardando_decisao', 'aplicado'].includes(i.status) && !i.avisado) {
        i.avisado = true; mudou = true;
        if (i.nivel === 'nenhum') continue;
        const quem = tickets.ler(t.chave)?.refinamento?.iniciadoPor;
        const decide = i.status === 'aguardando_decisao';
        vscode.window.showWarningMessage(`${t.chave}: comentário de ${i.autor} — impacto ${(NIVEL[i.nivel] || [i.nivel])[0]}.${decide ? ' Nada foi alterado: decida na aba Spec.' : ''}${quem ? ` (refinamento de ${quem})` : ''}`,
          { detail: `${i.resumo}${i.passo !== null && i.passo !== undefined ? `
${decide ? 'Passo afetado' : 'A spec voltou ao passo'} ${i.passo}.` : ''}${(i.cards || []).length ? `
Subtarefas a revisar: ${i.cards.join(', ')}.` : ''}` }, 'Abrir')
          .then((b) => { if (b) { this_abrir(t.chave, 'spec'); } });
      }
    }
    if (mudou) gravar(t.chave, IMPACTOS, l);
  };
  // Etapa 0: comentário novo que pode responder uma dúvida enviada ao ticket ou uma pergunta aberta do Claude.
  // O Claude classifica (sdd-state comentario classificar): resposta (só sugere; o humano confirma), mudança (segue para
  // o impacto) ou ruído. Sem dúvida nem pergunta abertas não há o que responder: o comentário vai direto ao impacto.
  const abertasDe = (t) => ({
    duvidas: duvidasDe(pasta(t.chave)).filter((x) => x.enviadaEm && !x.resposta),
    perguntas: (estadoSpec(ticketDe(t.chave) || t)?.perguntas || []).filter((q) => q.status === 'aberta')
  });
  const filaTriagem = (t) => {
    if (maestro.rodando(pasta(t.chave))) return;
    const l = impactosDe(pasta(t.chave)), c = l.find((x) => x.status === 'triagem');
    if (!c) return;
    const { duvidas, perguntas } = abertasDe(t);
    c.status = 'triando';
    gravar(t.chave, IMPACTOS, l);
    etapa(ticketDe(t.chave), `[triagem] Comentário novo no ticket ${t.chave}: resposta, mudança ou ruído? Siga a seção "Triagem de comentário novo do Jira" da skill sdd.\n`
      + `Dúvidas enviadas sem resposta:\n${duvidas.filter((x) => !(x.descartados || []).includes(c.id)).map((x) => `- ${x.id}: ${x.texto}${x.contexto ? ` (contexto: ${x.contexto})` : ''}`).join('\n') || '(nenhuma)'}\n`
      + `Perguntas abertas do Claude:\n${perguntas.map((q) => `- ${q.id}: ${q.pergunta}${q.opcoes?.length ? ` (opções: ${q.opcoes.join(' / ')})` : ''}`).join('\n') || '(nenhuma)'}\n`
      + `Comentário id: ${c.id} · autor: ${c.autor} · data: ${c.data} · link: ${c.link}\nTexto:\n${c.texto}`, false, undefined, `Triando comentário de ${c.autor}`);
  };
  // Um comentário por vez, numa execução nova (o Claude lê o refinamento inteiro do disco).
  const filaImpactos = (t) => {
    if (maestro.rodando(pasta(t.chave)) || !estadoSpec(ticketDe(t.chave) || t)) return;
    const l = impactosDe(pasta(t.chave)), i = l.find((x) => x.status === 'na_fila');
    if (!i) return;
    i.status = 'analisando';
    try { mudancas.snapshot(pasta(t.chave), dirSpec(ticketDe(t.chave) || t), `a${i.id}`); i.snapAnalise = true; } catch {}
    gravar(t.chave, IMPACTOS, l);
    etapa(ticketDe(t.chave), `[impacto] Comentário novo no ticket ${t.chave}. Siga a seção "Mudança vinda de comentário do Jira" da skill sdd: SÓ ANÁLISE, não edite a spec nem os cards.\n`
      + `id: ${i.id} · autor: ${i.autor} · data: ${i.data} · link: ${i.link}\nTexto:\n${i.texto}`, false, undefined, `Analisando comentário de ${i.autor}`);
  };
  // Vigia: comentários de outras pessoas nos tickets com spec. Na primeira vez só marca o que já existe como visto.
  let vigiando = false;
  const vigiarComentarios = async () => {
    if (vigiando || !(await ctx.secrets.get('jira.token'))) return;
    vigiando = true;
    try {
      for (const t0 of tickets.listar().filter((x) => x.spec?.dir)) {
        let cs, eu;
        try { [cs, eu] = await Promise.all([jira.comentarios(ctx.secrets, { key: t0.chave, site: t0.site }), jira.eu(ctx.secrets, t0.site)]); } catch { continue; }
        const t = tickets.ler(t0.chave);
        const v = t.vigiaComentarios;
        if (!v) { tickets.gravar({ ...t, vigiaComentarios: { desde: new Date().toISOString(), vistos: cs.map((c) => c.id) } }); continue; }
        const novos = cs.filter((c) => !v.vistos.includes(c.id) && c.autorId !== eu.id && Date.parse(c.data) >= Date.parse(v.desde) - 60000);
        if (!novos.length) continue;
        const l = impactosDe(pasta(t.chave)), ab = abertasDe(t), temAberta = ab.duvidas.length || ab.perguntas.length;
        for (const c of novos) {
          if (!l.some((i) => i.id === c.id)) l.push({ ...c, status: temAberta ? 'triagem' : 'na_fila' });
          notificar(t.chave, 'impacto', `Comentário novo de ${c.autor}: analisando o impacto no refinamento`);
        }
        gravar(t.chave, IMPACTOS, l);
        tickets.gravar({ ...tickets.ler(t.chave), vigiaComentarios: { ...v, vistos: [...new Set([...v.vistos, ...novos.map((c) => c.id)])] } });
        filaTriagem(t);
        filaImpactos(t);
      }
    } finally { vigiando = false; }
  };
  const relogio = setInterval(vigiarComentarios, 5 * 60 * 1000);
  setTimeout(vigiarComentarios, 20000);
  ctx.subscriptions?.push({ dispose: () => clearInterval(relogio) });
  // Pedidos de alteração esperando: uma execução só para todos (mesma sessão do passo 4).
  const filaTarefas = (t) => {
    if (maestro.rodando(pasta(t.chave))) return;
    const l = tarefasDe(pasta(t.chave)), fila = l.filter((c) => c.status === 'em_alteracao' && c.fila);
    if (!fila.length) return;
    fila.forEach((c) => { c.fila = false; alterando.add(c.id); });
    gravar(t.chave, TAREFAS, l);
    etapa(t, `Pedidos de alteração nos cards da aba Tarefas: ${fila.map((c) => `${c.id}: "${c.alteracao}"`).join('; ')}. `
      + 'Para cada tNN: ajuste a linha em tasks.md e o card com sdd-state card editar <id> (só os campos que mudam). '
      + 'Para o card qa: ajuste testes.md (plano de testes) e rode sdd-state card editar qa (com --estimativa/--resumo se mudarem). '
      + 'Não mexa em outras tarefas, não conclua nem inicie passos.', true, undefined, `Alterando ${fila.map((c) => c.id).join(', ')}`);
  };
  const QA_EXISTENTE = /^\[QA\]\s*(Planejamento|Teste de Qualidade)/i; // subtarefa de QA que já existe no ticket
  const descricaoJira = (t, c) => [c.descricao || '', '',
    c.pronto && `Pronto quando: ${c.pronto}`, (c.rf || []).length && `Requisitos: ${c.rf.join(', ')}`,
    (c.depende || []).length && `Depende de: ${c.depende.join(', ')}`, c.camada && `Camada: ${c.camada}`,
    `Origem: spec ${t.spec?.dir || ''} · tarefa ${c.id} (Crafting Table)`].filter((x) => x !== false && x !== undefined && x !== 0).join('\n');
  const estadoDe = (chave) => tickets.ler(chave)?.refinamento?.estado;
  // Rodando e sem nada esperando o humano → próxima etapa numa execução nova (true se começou).
  // Passo 6: o método do plugin fcx-qa-test-planning (jira-qa-planner + test-estimation), lido do plugin instalado.
  const qaCaminhos = () => {
    const qa = pluginInstalado('fcx-qa-test-planning@');
    if (!qa) return ' Plugin fcx-qa-test-planning não instalado: siga as regras do passo 6 da skill sdd sem ele.';
    return ` Método de QA: ${path.join(qa, 'skills', 'jira-qa-planner', 'SKILL.md')} (Passos 3, 6 e 7) e ${path.join(qa, 'skills', 'jira-qa-planner', 'reference', 'test-plan-templates.md')};`
      + ` estimativa: ${path.join(qa, 'skills', 'test-estimation', 'reference', 'modelo-estimativa.md')} (modo detalhado). Não use twg nem Jira: o card [QA] é criado no Jira pela extensão.`;
  };
  const seguir = (t) => {
    const est = estadoSpec(t);
    if (!est || estadoDe(t.chave) !== 'rodando' || maestro.rodando(pasta(t.chave)) || esperaHumano(est) || duvidasDe(pasta(t.chave)).some((x) => !x.resposta) || mudancas.pendentes(impactosDe(pasta(t.chave))).length || est.proximoPasso > 6) return false;
    const novas = respondidas.splice(0).join('; ');
    const reprovadas = est.proximoPasso === 5 ? tarefasDe(pasta(t.chave)).filter((c) => c.status === 'reprovada') : [];
    return etapa(t, `Siga a skill sdd, protocolo de retomada, sem perguntar: rode status e trabalhe só o passo ${est.proximoPasso} (${est.passos[est.proximoPasso].titulo}).`
      + (est.proximoPasso === 6 ? qaCaminhos() : '')
      + (est.proximoPasso === 3 ? ' Comece pelo mapeamento do código com a skill mapa:mapear (camadas, ref de leitura, análises mapa-backend.md/mapa-mobile.md na pasta da spec, mapa-conferir) e só depois escreva o plan.md.' : '')
      + (novas ? ` Respostas do humano desde a última execução: ${novas}.` : '')
      + (reprovadas.length ? ` Tarefas reprovadas pelo humano (considere na análise de cobertura): ${reprovadas.map((c) => `${c.id}${c.motivo ? ` (${c.motivo})` : ''}`).join('; ')}.` : ''), false, undefined, `Passo ${est.proximoPasso} · ${est.passos[est.proximoPasso].titulo}`);
  };
  const pedido = (t) => (naRaiz() ? `Ticket ${t.chave}: ${t.titulo || ''}\n${t.link}\nPasta do ticket: ${pasta(t.chave)} (documentos, notas em ${NOTAS}, `
    + `análise do backend em ${HANDOFF.backend} e do mobile em ${HANDOFF.mobile} (na pasta da spec), tarefas do passo 4 da spec em ${TAREFAS})\n`
    // Implementações / QA: escreve só na pasta da aba; do refinamento recebe só o resultado (spec), sem as conversas dele.
    : `Ticket ${t.chave}: ${t.titulo || ''} · ${sessao.focoLista() === 'qa' ? 'QA (testes)' : 'Implementação'}\n${t.link}\n`
      + `Pasta desta etapa: ${pastaAba(t.chave)} (documentos, notas em ${NOTAS}). Grave só nela.\n`
      + (dirSpec(t) ? `Entrada, só leitura: a spec em ${dirSpec(t)}. ` : '')
      + `Anexos do Jira em ${pasta(t.chave)}. Não use as outras pastas nem conversas do ticket.\n`);
  // Abre a conversa mais recente do ticket com o texto; sem conversa, abre uma nova e vincula quando a 1ª mensagem chegar.
  const abrirConversa = async (t, texto) => {
    const sid = ultimaConversa(t);
    if (sid) return vscode.commands.executeCommand('claude-vscode.editor.open', sid, texto);
    tickets.gravar({ ...tickets.ler(t.chave), pedidoEm: Date.now(), pedidoLista: sessao.focoLista() });
    await vscode.commands.executeCommand('claude-vscode.editor.open', undefined, texto || pedido(t));
  };

  const respondidas = []; // respostas ainda não entregues ao Claude
  const sdd = (args) => new Promise((ok) => (sddState() ? require('child_process').execFile(sddState(), args, (e, out, err) => {
    if (e) vscode.window.showErrorMessage(String(err || e.message).replace(/^sdd-state: /, ''));
    ok(!e);
  }) : ok(false)));
  const this_abrir = (chave, a) => { acoes.abrir({ id: chave }); aba = a; render(); };
  // Dependências do qa.executar / análise do ambiente (Jira, Claude em segundo plano, gravação da tela, avisos).
  const depsQa = (t) => {
    const dir = pastaAba(t.id), emu = require('./emulador');
    return {
      chave: t.chave, backend: reposDe(t).find((r) => r.camada === 'backend')?.caminho, api: (rota) => jira.api(ctx.secrets, t.site, rota),
      horaRefresh: cfg().get('qaHoraRefresh') || '06:00', aoMudar: render,
      extras: ['--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }), '--add-dir', dir,
        ...(cfg().get('modelo') ? ['--model', cfg().get('modelo')] : [])],
      // Ambiente: primeiro os Comandos das Configurações (API, Metro) e o emulador padrão; o script da skill completa o que faltar.
      comandos: {
        lista: () => require('./comandos').api?.lista() || [],
        rodar: (nome) => { const api = require('./comandos').api, b = api?.lista().find((x) => x.nome === nome); if (b && !b.rodando) api?.alternar({ id: b.id }); }
      },
      emulador: { avd: cfg().get('avdPadrao'), aparelhos: () => emu.dispositivos(), ligar: () => emu.ligar(cfg().get('avdPadrao')) },
      adb: path.join(emu.SDK, 'platform-tools', 'adb'),
      confirmar: async (texto) => (await vscode.window.showWarningMessage(texto, { modal: true }, 'Usar')) === 'Usar',
      gravarTela: (destino) => { if (emu.emuladorRodando()) require('./evidencias').gravar?.({ destino, chave: t.chave, continuo: true }); },
      pararTela: () => require('./evidencias').pararGravacao?.(),
      avisar: (texto) => { try { fs.appendFileSync(path.join(dir, NOTIF), JSON.stringify({ em: new Date().toISOString(), tipo: 'fim', texto: `${t.chave} · ${texto}` }) + '\n'); } catch {} }
    };
  };
  const acoes = {
    ...conf.acoes,
    meusAtualizar() { carregarMeus(true); },
    async labelQA({ id }) { await ctx.globalState.update('labelQA', id || ''); carregarMeus(true); },
    async meusFiltro({ id }) { await ctx.globalState.update('meusFiltro', id || ''); carregarMeus(true); },
    // Vinculado: clique só mostra o ticket; Puxar traz para a lista (e já busca título, status e anexos); Remover esconde.
    async meuVer({ id }) {
      previa = id;
      render();
      if (cachePrevia[id] && !cachePrevia[id].erro) return;
      try { cachePrevia[id] = await jira.buscar(ctx.secrets, { key: id, site: siteJira() }); }
      catch (e) { cachePrevia[id] = { erro: e.message }; }
      if (previa === id) render();
    },
    previaFechar() { previa = null; render(); },
    previaJira({ id }) { vscode.env.openExternal(vscode.Uri.parse(`${siteJira()}/browse/${id}`)); },
    async listaModo({ id }) { modoLista = id; await ctx.globalState.update('listaModo', id); render(); },
    meuPuxar({ id }) {
      const t0 = tickets.ler(id);
      if (!t0) {
        try { tickets.criar(`${siteJira()}/browse/${id}`, { listas: [modoLista] }); } catch (e) { return vscode.window.showErrorMessage(e.message); }
      } else porNaLista(t0); // já está em outra aba: entra nesta também, cada aba com a sua pasta
      if (cachePrevia[id] && !cachePrevia[id].erro) cacheJira[id] = cachePrevia[id];
      previa = null;
      render();
      atualizarJira(id); // título, status e anexos (a aba Docs mostra os que faltam baixar)
      vscode.window.setStatusBarMessage(`$(arrow-up) ${id} foi para a lista de ${menuModulos.nome(modoLista)}`, 4000);
    },
    async meuRemover({ id }) {
      await ctx.globalState.update('meusOcultos', [...new Set([...(ctx.globalState.get('meusOcultos') || []), id])]);
      if (previa === id) previa = null;
      render();
    },
    async meusMostrar() { await ctx.globalState.update('meusOcultos', []); render(); },
    abrir(/** @type {{ id: string, key?: string }} */ { id, key }) {
      if (key) { const t = ticketAberto(); return t && vscode.env.openExternal(vscode.Uri.parse(`${t.site}/browse/${key}`)); } // subtarefa
      aberto = id;
      aba = 'docs';
      sessao.focar(id === SEM_TICKET ? null : id, modoLista);
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
      try { jira.lerLink(link); t = porNaLista(tickets.criar(link.trim(), { listas: [modoLista] })); } catch (e) { return vscode.window.showErrorMessage(e.message); }
      this.abrir({ id: t.chave });
    },
    async excluir({ id }) {
      const t = tickets.ler(id);
      // Em mais de uma aba: sai só desta (a pasta da aba fica, volta a aparecer se puxar de novo).
      if (t && tickets.listasDe(t).length > 1) {
        tickets.gravar({ ...t, listas: tickets.listasDe(t).filter((l) => l !== modoLista), lista: undefined, implementacao: undefined });
        if (aberto === id) { aberto = null; sessao.focar(null); }
        return render();
      }
      const ok = t && await vscode.window.showWarningMessage(`Excluir o ticket ${id}?`, { modal: true,
        detail: `Sai da lista. A pasta (documentos, notas, tarefas, evidências) vai para ${path.join(tickets.RAIZ, '_arquivados')} — nada é apagado. As conversas do Claude continuam, sem ticket.` }, 'Excluir');
      if (!ok) return;
      tickets.arquivar(id);
      if (aberto === id) { aberto = null; sessao.focar(null); }
      render();
    },
    atualizar() { if (ticketAberto()) { delete cacheJira[aberto]; render(); atualizarJira(aberto); vigiarComentarios(); } },
    vigiarAgora() { return vigiarComentarios(); }, // ⟳ e testes: olha os comentários agora
    cmdsAlternar() { cmdsAberto = !cmdsAberto; },
    cmdAlternar({ id }) { require('./comandos').api?.alternar({ id }); },
    emuAlternar({ id }) { require('./emulador').api?.alternar({ id }); },
    notifLidas() { const dir = aberto && pastaAba(aberto); if (dir) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, LIDAS), new Date().toISOString()); } },
    // Prévia + confirmação antes de publicar: o comentário fica visível para todo o time no Jira.
    async duvidaEnviar({ id }) {
      const t = ticketAberto();
      const l = t ? duvidasDe(pasta(t.chave)) : [];
      const x = l.find((y) => y.id === id);
      if (!x || x.enviadaEm) return;
      const mencoes = await escolherMencoes(t, ctx.secrets);
      if (!mencoes) return;
      const ok = await vscode.window.showWarningMessage(`Comentar no ${t.chave}?`, { modal: true, detail: (mencoes.length ? `Menciona: ${mencoes.map((m) => '@' + m.nome).join(', ')}` : 'Sem menção a ninguém.') + '\n\n' + textoDuvida(x) }, 'Enviar');
      if (!ok) return;
      try { await jira.comentar(ctx.secrets, { key: t.chave, site: t.site }, textoDuvida(x), mencoes); }
      catch (e) { return vscode.window.showErrorMessage(e.message); }
      x.enviadaEm = new Date().toISOString();
      gravar(t.chave, DUVIDAS, l);
      vscode.window.showInformationMessage(`${x.id} enviada para os comentários do ${t.chave}.`);
      atualizarJira(t.chave);
    },
    // Fecha a dúvida (só o humano) e, se era a última, a spec pode seguir.
    fecharDuvida(t, id, resposta) {
      const l = duvidasDe(pasta(t.chave)), x = l.find((y) => y.id === id);
      if (!x || x.resposta) return;
      x.resposta = { ...resposta, em: new Date().toISOString() }; x.sugestao = null;
      gravar(t.chave, DUVIDAS, l);
      respondidas.push(`${id} (dúvida) → ${resposta.texto}`);
      render();
      if (!l.some((y) => !y.resposta)) seguir(ticketDe(t.chave));
    },
    async duvidaResponder({ id }) {
      const t = ticketAberto(), x = t && duvidasDe(pasta(t.chave)).find((y) => y.id === id);
      if (!x || x.resposta) return;
      const texto = (await vscode.window.showInputBox({ title: `${id}: ${x.texto}`.slice(0, 120), prompt: 'Resposta da dúvida', ignoreFocusOut: true }))?.trim();
      if (texto) this.fecharDuvida(t, id, { texto, origem: 'manual' });
    },
    duvidaConfirmar({ id }) {
      const t = ticketAberto(), s = t && duvidasDe(pasta(t.chave)).find((y) => y.id === id)?.sugestao;
      if (s) this.fecharDuvida(t, id, { texto: s.texto, origem: 'comentario', autor: s.autor, comentarioId: s.comentarioId, link: s.link });
    },
    duvidaRejeitar({ id }) {
      const t = ticketAberto(), l = t ? duvidasDe(pasta(t.chave)) : [], x = l.find((y) => y.id === id);
      if (!x?.sugestao) return;
      (x.descartados ||= []).push(x.sugestao.comentarioId); x.sugestao = null;
      gravar(t.chave, DUVIDAS, l); render();
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
      tickets.gravar({ ...tickets.ler(t.chave), refinamento: { ...tickets.ler(t.chave).refinamento, iniciadoPor: os.userInfo().username } });
      aba = 'spec'; // o refinamento acontece na aba Spec
      atualizarJira(t.chave); // anexos do ticket aparecem em Docs para baixar
      // Maestro (prova): o Claude roda em segundo plano e a caixa Ao vivo da aba Spec mostra o que ele faz.
      etapa(t, `/sdd:iniciar ${pasta(t.chave)} ${repo}\nTicket aguardando início: só crie a spec (init + status) e termine dizendo para clicar em Dar início.`, false, repo, 'Criando a spec do ticket');
      render();
    },
    darInicio() { return this.retomar(); },
    // ▶ do QA: abre Evidências (Ao vivo) e confere o planejamento no Jira (qa.js). Sem plano, o cartão bloqueia e oferece criar.
    // ▶ do QA: só procura o planejamento (Ao vivo em Evidências). Executar é o Dar início do cartão.
    async qaPlay() {
      const t = ticketAberto();
      if (!t || sessao.focoLista() !== 'qa') return;
      pedirSecao(EVID);
      await require('./qa').verificarPlano(pastaAba(t.id), t.chave, (rota) => jira.api(ctx.secrets, t.site, rota));
      render();
    },
    // Dar início / Retomar: sobe o ambiente, confere a massa e executa os cenários da fila, um claude -p por cenário (qa.executar).
    async qaIniciar() {
      const t = ticketAberto();
      if (!t || sessao.focoLista() !== 'qa') return;
      await require('./qa').executar(pastaAba(t.id), depsQa(t));
      render();
    },
    async qaAmbAnalisar() { const t = ticketAberto(); if (t) { await require('./qa').analisarAmbiente(pastaAba(t.id), depsQa(t)); render(); } },
    // Log ao vivo: terminal acompanhando o log do preparo (tail -F); pelos Comandos, também os terminais da API e do Metro.
    // Ao vivo: Ver tudo / Recolher (Evidências do QA ou aba Spec).
    vivoExpandir({ id }) {
      const t = ticketAberto();
      if (!t || !['qa', 'spec'].includes(id)) return;
      aoVivo.alternarExpandido(id === 'qa' ? pastaAba(t.id) : pasta(t.chave));
      render();
    },
    // Modal do erro do ambiente: a análise do Claude (ou o erro cru, se ainda não houver análise), com log ao vivo e reanálise.
    async qaAmbErro() {
      const t = ticketAberto(), qa = require('./qa');
      if (!t) return;
      const dir = pastaAba(t.id), r = qa.resumoErroAmbiente(dir);
      if (!r) return;
      qa.analiseVista(dir); render();
      const detalhe = r.analise ? `Análise do Claude\n\n${r.analise}${r.detalhe ? `\n\n─────\n${r.detalhe}` : ''}` : `${r.detalhe || 'Sem detalhe.'}\n\nO Claude ainda não analisou este erro.`;
      const botoes = ['Log ao vivo', ...(qa.rodando(dir) ? [] : [r.analise ? 'Analisar de novo' : 'Analisar com o Claude'])];
      const escolha = await vscode.window.showErrorMessage(r.titulo, { modal: true, detail: detalhe }, ...botoes);
      if (escolha === 'Log ao vivo') this.qaAmbLog();
      else if (escolha) this.qaAmbAnalisar();
    },
    qaAmbLog() {
      const t = ticketAberto();
      if (!t) return;
      const qa = require('./qa'), dir = pastaAba(t.id), a = qa.ambiente(dir), cmds = require('./comandos').api;
      for (const nome of a?.terminais || []) { const b = cmds?.lista().find((x) => x.nome === nome); if (b?.rodando) cmds?.acao({ acao: 'mostrar', id: b.id }); }
      const nome = `QA ${t.chave} · log do ambiente`;
      const term = vscode.window.terminals.find((x) => x.name === nome)
        || vscode.window.createTerminal({ name: nome, shellPath: 'tail', shellArgs: ['-n', '+1', '-F', path.join(dir, qa.LOG_AMB)] });
      term.show();
    },
    qaPlanoAbrir() {
      const t = ticketAberto(), v = t && require('./qa').versaoAtual(pastaAba(t.id));
      if (!v) return;
      require('./qa').mudar(pastaAba(t.id), { lido: v.v }); // libera o Aprovar: só depois de ler
      vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path.join(pastaAba(t.id), v.arquivo)));
      render();
    },
    qaPlanoMencionar() { const t = ticketAberto(), v = t && require('./qa').versaoAtual(pastaAba(t.id)); if (v) mencionar(`@${path.join(pastaAba(t.id), v.arquivo)}`); },
    qaPlanoAprovar() { const t = ticketAberto(); if (t) { require('./qa').aprovar(pastaAba(t.id)); render(); } },
    // Pedir mudança: o Claude aplica na subtarefa do Jira; ao terminar, a versão nova volta para aprovação.
    async qaPlanoMudar() {
      const t = ticketAberto(), qa = require('./qa');
      if (!t) return;
      const dir = pastaAba(t.id), v = qa.versaoAtual(dir);
      if (!v) return;
      const pedido = await vscode.window.showInputBox({ title: `Mudança no planejamento ${v.subtarefa} · v${v.v}`, prompt: 'O Claude aplica na subtarefa do Jira e gera a versão nova para você aprovar', ignoreFocusOut: true });
      if (!pedido?.trim()) return;
      const ok = maestro.rodar(dir, { prompt: qa.promptMudanca(t.link, v.subtarefa, path.join(dir, v.arquivo), pedido.trim()), titulo: `QA · Aplicando mudança no planejamento (${v.subtarefa})`,
        ferramentas: qa.FERRAMENTAS_PLANO, extras: ['--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }), '--add-dir', dir],
        aoMudar: () => { render(); if (!maestro.rodando(dir)) qa.verificarPlano(dir, t.chave, (rota) => jira.api(ctx.secrets, t.site, rota)).then(render); } });
      if (ok) qa.mudar(dir, { fase: 'alterando', pedido: pedido.trim() });
      render();
    },
    // Publicar: comentário com o resultado na subtarefa de QA + evidências da última execução de cada cenário (anexos).
    async qaPublicar() {
      const t = ticketAberto(), qa = require('./qa');
      if (!t || sessao.focoLista() !== 'qa') return;
      const dir = pastaAba(t.id), sub = qa.estado(dir).subtarefa, r = qa.cenarios(dir);
      const feitos = r.cenarios.filter((c) => !c.arquivado && qa.RESULTADOS.includes(c.status));
      if (!sub || !feitos.length) return;
      const arqs = feitos.flatMap((c) => qa.arquivosDe(dir, c.execucoes.at(-1)).map((f) => [c.id, f]));
      const ok = await vscode.window.showWarningMessage(`Publicar no ${sub}: comentário com ${feitos.length} cenário(s) e ${arqs.length} evidência(s) anexada(s)?`, { modal: true }, 'Publicar');
      if (ok !== 'Publicar') return;
      const ROT = { passou: '✅ Passou', falhou: '❌ Falhou', bloqueado: '⛔ Bloqueado' };
      const md = [`**Resultado do QA · plano v${r.planoVersao}** (Crafting Table)`, '', '| Cenário | Resultado | Observação |', '| --- | --- | --- |',
        ...feitos.map((c) => `| ${c.id} · ${c.titulo.replace(/\|/g, '/')} | ${ROT[c.status]} | ${(c.execucoes.at(-1)?.nota || '').replace(/\|/g, '/')} |`)].join('\n');
      try {
        await jira.comentar(ctx.secrets, { key: sub, site: t.site }, md);
        if (arqs.length) await jira.anexar(ctx.secrets, t.site, sub, arqs.map(([id, f]) => ({ arquivo: f, nome: `${id}-${path.basename(f)}` })));
        aoVivo.anotar(dir, { tipo: 'fim', texto: `Publicado no ${sub}: resultado de ${feitos.length} cenário(s) e ${arqs.length} evidência(s)` });
      } catch (e) { aoVivo.anotar(dir, { tipo: 'erro', texto: `Não consegui publicar no Jira: ${e.message}` }); }
      render();
    },
    qaMassaEstado({ id, op }) { const t = ticketAberto(); try { if (t && typeof id === 'string') require('./qa').massaEstado(pastaAba(t.id), id, op); } catch (e) { vscode.window.showErrorMessage(e.message); } render(); },
    qaMassaEditar() {
      const t = ticketAberto(), qa = require('./qa');
      if (!t) return;
      const arq = path.join(pastaAba(t.id), qa.MASSA);
      if (!fs.existsSync(arq)) { fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, JSON.stringify({ itens: [] }, null, 2)); }
      vscode.commands.executeCommand('vscode.open', vscode.Uri.file(arq));
    },
    // Criar planejamento: jira-qa-planner em segundo plano; ao terminar, confere de novo.
    qaCriarPlano() {
      const t = ticketAberto(), qa = require('./qa');
      if (!t || sessao.focoLista() !== 'qa') return;
      const dir = pastaAba(t.id);
      const ok = maestro.rodar(dir, { prompt: qa.promptCriar(t.link), titulo: 'QA · Criando o planejamento (jira-qa-planner)', ferramentas: qa.FERRAMENTAS_PLANO,
        extras: ['--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } })],
        aoMudar: () => { render(); if (!maestro.rodando(dir)) this.qaPlay(); } });
      if (ok) qa.mudar(dir, { fase: 'criando' });
      render();
    },
    qaRefazer({ id }) { const t = ticketAberto(); if (t && typeof id === 'string') require('./qa').refazer(pastaAba(t.id), id); },
    qaParar() { const t = ticketAberto(); if (t) { require('./qa').pausar(pastaAba(t.id)); render(); } },
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
      if (mudancas.pendentes(impactosDe(pasta(r.id))).length) return vscode.window.showWarningMessage('Há uma mudança pedida em comentário do Jira esperando sua decisão (caixa vermelha acima): decida antes de aprovar.');
      const cards = tarefasDe(pasta(r.id));
      const semDecisao = [4, 6].includes(n) ? semDecisaoDo(n, cards) : [];
      if (semDecisao.length) { aba = 'tarefas'; render(); return vscode.window.showWarningMessage(n === 4 ? `Decida as tarefas antes de aprovar o passo 4: ${semDecisao.length} sem decisão (${semDecisao.map((x) => x.id).join(', ')}).` : 'Decida o card [QA] na aba Tarefas antes de aprovar o passo 6.'); }
      if (n === 6 && !cards.some((x) => x.tipo === 'qa')) return vscode.window.showWarningMessage('O Claude ainda não criou o card [QA] com o plano de testes: peça ajuste no passo 6.');
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
      etapa(r, `O humano pediu ajuste no passo ${n}: "${texto.trim()}". Faça o ajuste no arquivo do passo e rode concluir ${n} de novo.`, true, undefined, `Ajuste no passo ${n} · ${estadoSpec(r)?.passos[n]?.titulo || ''}`);
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
        etapa(r, `Respostas do humano na aba: ${respondidas.join('; ')}. Continue o passo ${est.proximoPasso} com elas.`, true, undefined, `Aplicando suas respostas · passo ${est.proximoPasso}`);
        respondidas.length = 0;
      }
      render();
    },
    docAbrir({ id }) {
      const d = (ticketDe(aberto) ? docsDoTicket(ticketDe(aberto)) : docsDe(pastaDe(aberto))).find((x) => x.nome === id);
      if (!d || d.quebrado) return;
      const uri = vscode.Uri.file(d.origem || d.full);
      if (/\.md$/i.test(d.nome)) vscode.commands.executeCommand('markdown.showPreview', uri);
      else if (/\.(html?|pdf|docx|xlsx|pptx)$/i.test(d.nome)) vscode.env.openExternal(uri);
      else vscode.commands.executeCommand('vscode.open', uri);
    },
    docMencionar({ id }) {
      const d = (ticketDe(aberto) ? docsDoTicket(ticketDe(aberto)) : docsDe(pastaDe(aberto))).find((x) => x.nome === id);
      if (d && !d.quebrado) mencionar(`@${d.origem || d.full}`);
    },
    handoffMencionar({ id }) { if (HANDOFF[id]) mencionar(`@${arqHandoff(ticketDe(aberto), id)}`); },
    handoffPrevia({ id }) { if (HANDOFF[id]) vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arqHandoff(ticketDe(aberto), id))); },
    handoffEditar({ id }) { if (HANDOFF[id]) vscode.commands.executeCommand('vscode.open', vscode.Uri.file(arqHandoff(ticketDe(aberto), id))); },
    handoffCriar({ id }) {
      const t = ticketAberto();
      if (!t || !HANDOFF[id]) return;
      const arq = arqHandoff(t, id);
      fs.mkdirSync(path.dirname(arq), { recursive: true });
      fs.writeFileSync(arq, `# Análise ${id} — ${t.chave} ${t.titulo || ''}\n\n## O que foi analisado\n\n## Arquivos e pontos de alteração\n\n## Riscos e dúvidas\n`);
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
    // ── Tarefas ──
    tarefaCampo({ id, campo, valor }) {
      const l = tarefasDe(pasta(aberto)), c = l.find((x) => x.id === id);
      if (!c || c.status !== 'pendente') return;
      if (campo === 'estimativa') {
        const v = String(valor || '').trim();
        if (v && !/^(\d+(\.\d+)?[wdhm]\s*)+$/i.test(v)) return vscode.window.showWarningMessage('Estimativa no formato do Jira: 30m, 2h, 1d ou 1d 4h.');
        if ((c.estimativa || '') === v) return;
        c.estimativa = v;
      } else if (campo === 'vinculado') {
        if (!!c.vinculado === !!valor) return;
        c.vinculado = !!valor;
      } else return;
      gravar(aberto, TAREFAS, l);
    },
    // Aprovar = criar a subtarefa no Jira (com confirmação). Só então o card vai para Aprovadas.
    async tarefaAprovar({ id }) {
      const t = ticketAberto();
      const c0 = t && tarefasDe(pasta(t.chave)).find((x) => x.id === id);
      if (!c0 || c0.status !== 'pendente') return;
      await new Promise((ok) => setTimeout(ok, 150)); // os campos do detalhe chegam antes
      const c = tarefasDe(pasta(t.chave)).find((x) => x.id === id);
      if (c.tipo === 'qa') return this.qaAprovar(t, c);
      const ok = await vscode.window.showWarningMessage(`Aprovar ${c.id}? A subtarefa será criada no Jira, no ticket ${t.chave}.`, { modal: true,
        detail: `“${c.titulo}”\nResponsável: ${c.vinculado ? 'você' : 'sem responsável'} · Estimativa original: ${c.estimativa || 'sem estimativa'}` }, 'Aprovar e criar no Jira');
      if (!ok) return;
      let r;
      try {
        r = await jira.criarSubtarefa(ctx.secrets, { key: t.chave, site: t.site }, { resumo: c.titulo, descricao: descricaoJira(t, c), estimativa: c.estimativa, atribuirAMim: c.vinculado });
      } catch (e) { return vscode.window.showErrorMessage(`Subtarefa não criada: ${e.message}`); }
      const l = tarefasDe(pasta(t.chave)), x = l.find((y) => y.id === id);
      Object.assign(x, { status: 'aprovada', jira: r.key });
      (x.historico ||= []).push({ em: new Date().toISOString(), evento: 'aprovada', texto: `Aprovada: subtarefa ${r.key} criada no Jira` });
      gravar(t.chave, TAREFAS, l);
      notificar(t.chave, 'jira', `subtarefa ${r.key} criada`);
      vscode.window.showInformationMessage(`${id} aprovada: subtarefa ${r.key} criada em ${t.chave}.${r.aviso ? ` Atenção: ${r.aviso}.` : ''}`);
      render();
    },
    async qaAprovar(t, c) {
      if (!t?.chave || c?.tipo !== 'qa') return; // só pelo tarefaAprovar
      const plano = lerTexto(c.arquivo || '');
      if (!plano) return vscode.window.showErrorMessage(`Plano de testes não encontrado: ${c.arquivo || '(sem arquivo)'}`);
      let existente = null;
      try {
        const j = cacheJira[t.chave] || await jira.buscar(ctx.secrets, { key: t.chave, site: t.site });
        existente = (j.subtarefas || []).find((s) => QA_EXISTENTE.test(s.resumo || ''));
      } catch (e) { return vscode.window.showErrorMessage(`Não consegui ler as subtarefas de ${t.chave}: ${e.message}`); }
      const ok = await vscode.window.showWarningMessage(existente
        ? `Aprovar o plano de testes? A subtarefa ${existente.key} (“${existente.resumo}”) já existe em ${t.chave}: a descrição dela será substituída pelo plano.`
        : `Aprovar o plano de testes? A subtarefa “${c.titulo}” será criada no Jira, no ticket ${t.chave}.`, { modal: true,
        detail: `${c.resumo || ''}\nResponsável: ${c.vinculado ? 'você' : 'sem responsável'} · Estimativa original: ${c.estimativa || 'sem estimativa'}` },
        existente ? 'Aprovar e atualizar no Jira' : 'Aprovar e criar no Jira');
      if (!ok) return;
      let key, aviso;
      try {
        if (existente) { await jira.atualizarDescricao(ctx.secrets, { site: t.site }, existente.key, plano); key = existente.key; }
        else ({ key, aviso } = await jira.criarSubtarefa(ctx.secrets, { key: t.chave, site: t.site }, { resumo: c.titulo, descricao: plano, estimativa: c.estimativa, atribuirAMim: c.vinculado }));
      } catch (e) { return vscode.window.showErrorMessage(`Plano de testes não enviado: ${e.message}`); }
      const l = tarefasDe(pasta(t.chave)), x = l.find((y) => y.id === c.id);
      Object.assign(x, { status: 'aprovada', jira: key });
      (x.historico ||= []).push({ em: new Date().toISOString(), evento: 'aprovada', texto: existente ? `Aprovada: descrição de ${key} atualizada` : `Aprovada: subtarefa ${key} criada no Jira` });
      gravar(t.chave, TAREFAS, l);
      notificar(t.chave, 'jira', `subtarefa ${key} [QA] ${existente ? 'atualizada' : 'criada'}`);
      vscode.window.showInformationMessage(`Plano de testes aprovado: ${existente ? `${key} atualizada` : `${key} criada`} em ${t.chave}.${aviso ? ` Atenção: ${aviso}.` : ''}`);
      delete cacheJira[t.chave];
      render();
    },
    // Decisão sobre a mudança pedida em comentário. "Não prosseguir" descarta (a spec nunca foi tocada); manter só registra;
    // consultar vira uma dúvida para o PO; aplicar guarda um snapshot e manda o Claude regredir ([aplicar]).
    async mudancaDecidir({ id, op }) {
      const t = ticketAberto();
      if (!t) return;
      const l = impactosDe(pasta(t.chave)), i = l.find((x) => x.id === id && x.status === 'aguardando_decisao');
      const o = op === 'nao' ? null : (i?.opcoes || [])[Number(op)];
      if (!i || (op !== 'nao' && !o)) return;
      if (o?.tipo === 'aplicar' && maestro.rodando(pasta(t.chave))) return vscode.window.showWarningMessage('O Claude ainda está trabalhando neste ticket: espere a etapa terminar para aplicar.');
      const ok = await vscode.window.showWarningMessage(`${o ? o.rotulo : 'Não prosseguir'}?`, { modal: true, detail: !o ? 'A mudança do comentário é descartada e a spec segue como estava (nada foi alterado).'
        : o.tipo === 'aplicar' ? `O Claude vai regredir a spec: ${o.instrucao || o.rotulo}
Um snapshot é guardado: dá para desfazer depois.`
        : o.tipo === 'consultar' ? 'Vira uma dúvida (aba Dúvidas) para você enviar ao ticket; a spec espera a resposta.' : 'Nada muda na spec.' }, 'Confirmar');
      if (!ok) return;
      i.decisao = { opcao: o ? o.rotulo : 'Não prosseguir', tipo: o ? o.tipo : 'nao_prosseguir', por: os.userInfo().username, em: new Date().toISOString() };
      if (!o) i.status = 'descartado';
      else if (o.tipo === 'aplicar') {
        mudancas.snapshot(pasta(t.chave), dirSpec(ticketDe(t.chave) || t), i.id);
        Object.assign(i, { snapshot: true, status: 'aplicando' });
      } else i.status = 'decidido';
      gravar(t.chave, IMPACTOS, l);
      if (o?.tipo === 'consultar') await sdd(['duvida', 'add', '--ref', pasta(t.chave), '--texto', o.instrucao || o.rotulo, '--contexto', `Comentário de ${i.autor}: ${i.resumo}`]);
      if (o?.tipo === 'aplicar') etapa(ticketDe(t.chave), `[aplicar] Mudança escolhida no ticket ${t.chave}. Siga a seção "Aplicar a mudança escolhida" da skill sdd.\n`
        + `Opção escolhida: ${o.rotulo}\nInstrução: ${o.instrucao || o.rotulo}\nImpacto: ${i.nivel} — ${i.resumo} (passo ${i.passo ?? '?'}; cards ${(i.cards || []).join(', ') || 'nenhum'})\n`
        + `Comentário id: ${i.id} · autor: ${i.autor} · data: ${i.data} · link: ${i.link}\nTexto:\n${i.texto}`, false, undefined, `Aplicando mudança de ${i.autor}`);
      render();
    },
    // "Não prosseguir" depois de aplicar: volta a spec e os cards ao snapshot de antes da aplicação.
    async mudancaDesfazer({ id }) {
      const t = ticketAberto();
      if (!t) return;
      const l = impactosDe(pasta(t.chave)), i = l.find((x) => x.id === id && ['aplicado', 'erro'].includes(x.status) && x.snapshot);
      if (!i) return;
      if (maestro.rodando(pasta(t.chave))) return vscode.window.showWarningMessage('O Claude ainda está trabalhando neste ticket: espere a etapa terminar.');
      const ok = await vscode.window.showWarningMessage('Desfazer a mudança?', { modal: true, detail: 'A spec e os cards voltam ao estado de antes de aplicar. Subtarefas já atualizadas no Jira não são mexidas.' }, 'Desfazer');
      if (!ok) return;
      if (!mudancas.restaurar(pasta(t.chave), dirSpec(ticketDe(t.chave) || t), i.id)) return vscode.window.showErrorMessage('Snapshot não encontrado: nada foi desfeito.');
      i.status = 'desfeito';
      gravar(t.chave, IMPACTOS, l);
      vscode.window.showInformationMessage('Mudança desfeita: spec e cards voltaram ao estado anterior.');
      render();
    },
    async impactoCiente({ id }) {
      const l = impactosDe(pasta(aberto)), i = l.find((x) => x.id === id);
      if (!i) return;
      i.status = 'ciente';
      gravar(aberto, IMPACTOS, l);
      render();
    },
    // Revisão de card já no Jira: aplica o texto novo (descrição/título/estimativa) e comenta na subtarefa o motivo,
    // quem pediu a mudança (autor do comentário, com o link) e quem aplicou.
    async revisaoAplicar({ id }) {
      const t = ticketAberto();
      const c = t && tarefasDe(pasta(t.chave)).find((x) => x.id === id);
      if (!c?.revisao || !c.jira) return;
      const novo = { ...c, ...c.revisao.campos };
      const descricao = c.tipo === 'qa' ? lerTexto(c.arquivo || '') : descricaoJira(t, novo);
      const origem = impactosDe(pasta(t.chave)).find((i) => i.link === c.revisao.comentario);
      const ok = await vscode.window.showWarningMessage(`Aplicar a alteração em ${c.jira}?`, { modal: true,
        detail: `A descrição de ${c.jira} será substituída${c.revisao.campos.titulo ? ' (e o título)' : ''} e um comentário vai registrar o motivo.\n\nMotivo: ${c.revisao.motivo}${origem ? `\nMudança pedida por: ${origem.autor}` : ''}` }, 'Aplicar no Jira');
      if (!ok) return;
      let r = {}, eu = { nome: os.userInfo().username };
      try {
        r = await jira.atualizarDescricao(ctx.secrets, { site: t.site }, c.jira, descricao, { titulo: c.revisao.campos.titulo, estimativa: c.revisao.campos.estimativa });
        try { eu = await jira.eu(ctx.secrets, t.site); } catch {}
        await jira.comentar(ctx.secrets, { key: c.jira, site: t.site }, ['🔄 **Descrição atualizada pela Crafting Table**', '',
          `**Motivo:** ${c.revisao.motivo}`,
          origem ? `**Mudança pedida por:** ${origem.autor} — [comentário em ${t.chave}](${origem.link})` : c.revisao.comentario ? `**Origem:** [comentário](${c.revisao.comentario})` : null,
          `**Alteração feita por:** ${eu.nome}`].filter((x) => x !== null).join('\n'));
      } catch (e) { return vscode.window.showErrorMessage(`Alteração não aplicada em ${c.jira}: ${e.message}`); }
      const l = tarefasDe(pasta(t.chave)), x = l.find((y) => y.id === id);
      Object.assign(x, x.revisao.campos);
      (x.historico ||= []).push({ em: new Date().toISOString(), evento: 'revisao', texto: `Alteração aplicada em ${c.jira} (${x.revisao.motivo.slice(0, 120)})` });
      delete x.revisao;
      gravar(t.chave, TAREFAS, l);
      notificar(t.chave, 'jira', `subtarefa ${c.jira} atualizada${origem ? ` por mudança de ${origem.autor}` : ''}`);
      vscode.window.showInformationMessage(`${c.jira} atualizada e comentada.${r.aviso ? ` Atenção: ${r.aviso}.` : ''}`);
      render();
    },
    async revisaoDescartar({ id }) {
      const t = ticketAberto();
      const l = t ? tarefasDe(pasta(t.chave)) : [], x = l.find((y) => y.id === id);
      if (!x?.revisao) return;
      const ok = await vscode.window.showWarningMessage(`Descartar a alteração proposta para ${x.jira || id}?`, { modal: true, detail: 'A subtarefa no Jira fica como está.' }, 'Descartar');
      if (!ok) return;
      (x.historico ||= []).push({ em: new Date().toISOString(), evento: 'revisao', texto: `Alteração descartada (${x.revisao.motivo.slice(0, 120)})` });
      delete x.revisao;
      gravar(t.chave, TAREFAS, l);
      render();
    },
    async tarefaReprovar({ id }) {
      const t = ticketAberto();
      if (!t?.chave || tarefasDe(pasta(t.chave)).find((x) => x.id === id)?.status !== 'pendente') return;
      const motivo = await vscode.window.showInputBox({ title: `Reprovar ${id}`, prompt: 'Motivo (opcional): vai para o Claude na análise de consistência', ignoreFocusOut: true });
      if (motivo === undefined) return;
      const l = tarefasDe(pasta(t.chave)), x = l.find((y) => y.id === id);
      Object.assign(x, { status: 'reprovada', motivo: motivo.trim() });
      (x.historico ||= []).push({ em: new Date().toISOString(), evento: 'reprovada', texto: `Reprovada${motivo.trim() ? `: ${motivo.trim()}` : ''}` });
      gravar(t.chave, TAREFAS, l);
      render();
    },
    // Pedido de alteração: o card fica "Claude alterando" e entra na fila; o Claude roda assim que estiver livre.
    tarefaAlterar({ id, texto }) {
      const t = ticketAberto();
      const l = t ? tarefasDe(pasta(t.chave)) : [], x = l.find((y) => y.id === id);
      if (!x || x.status !== 'pendente' || !String(texto || '').trim()) return;
      Object.assign(x, { status: 'em_alteracao', alteracao: texto.trim(), fila: true });
      (x.historico ||= []).push({ em: new Date().toISOString(), evento: 'alteracao', texto: `Alteração pedida: ${texto.trim()}` });
      gravar(t.chave, TAREFAS, l);
      render();
      filaTarefas(t);
    },
    async anexoTodos() {
      for (const a of abaDocs.pendentes(cacheJira[aberto]?.anexos, ler(path.join(pasta(aberto), ORIGEM), {}))) await this.anexoBaixar({ id: a.id });
    }
  };

  // Editor de notas (notas.js): o sid que vem da página é o ticket (ou Sem ticket) em que a nota foi aberta,
  // então um salvamento atrasado nunca cai em outro ticket.
  const daNota = (m) => {
    const dir = m.sid && pastaAba(m.sid);
    if (!dir) return;
    fs.mkdirSync(dir, { recursive: true });
    if (m.tipo === 'salvar' || m.tipo === 'mencionar') {
      try { fs.writeFileSync(path.join(dir, NOTAS), m.html); view?.webview.postMessage({ tipo: 'salvo', sid: m.sid, seq: m.seq }); }
      catch (e) { view?.webview.postMessage({ tipo: 'salvo', sid: m.sid, seq: m.seq, erro: e.message }); }
    }
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
        tickets.vincular(sid, t.chave, t.pedidoLista);
        const { pedidoEm, pedidoLista, ...resto } = tickets.ler(t.chave);
        tickets.gravar(resto);
        titularConversa(sid, `${t.chave}${{ impl: ' · Implementação', qa: ' · QA' }[pedidoLista] || ''} · ${t.titulo || ''}`.trim());
        mudou = true;
      } else if (Date.now() - t.pedidoEm > 24 * 3600e3) { const { pedidoEm, pedidoLista, ...resto } = t; tickets.gravar(resto); }
    }
    if (mudou) render();
  };

  const provider = {
    resolveWebviewView(v) {
      view = v;
      view.webview.options = { enableScripts: true };
      view.webview.onDidReceiveMessage((m) => (m.tipo ? daNota(m) : /^(cofre|comandos|emulador):/.test(m.acao) ? require('./' + m.acao.split(':')[0]).api?.acao({ ...m, acao: m.acao.split(':')[1] }) : acoes[m.acao]?.call(acoes, m)));
      view.onDidChangeVisibility(() => { if (view.visible) { reconciliar(); render(); } });
      reconciliar();
      render();
    },
    // Cabeçalho e rodapé do ticket em volta das seções de outros módulos (Comandos, Evidências…).
    moldura: (secao) => {
      const t = aberto === SEM_TICKET ? { id: SEM_TICKET } : aberto && comSpec(ticketDe(aberto));
      if (!t) return null;
      // Fora do painel o rodapé fica preso embaixo (a página do outro módulo rola o body).
      // !important: a seção de dentro pode zerar o padding do body depois (Evidências usa ESTILO_NOTAS no corpo) e o rodapé fixo cobriria o fim da página.
      return { css: CSS_MOLDURA + '<style>body { margin: 0; padding-bottom: 42px !important; } .ct-rod { position: fixed; left: 0; right: 0; bottom: 0; z-index: 100; }</style>',
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

exports._teste = { markdown, telaTicket, cabecalho, pagina, SEM_TICKET, caixaDecisao, caixaMudancas, telaConstituicao, telaTarefas };
