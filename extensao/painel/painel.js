// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { esc } = require('../infra/ticket')._teste;
const jira = require('../infra/ticket').jira;
const sessao = require('../infra/sessao');
const tickets = require('../infra/tickets');
const { dirSpec, arqHandoff, ler, lerTexto, NOTAS, ORIGEM, decisoesDe, duvidasDe, tarefasDe, impactosDe, ticketDe, estadoSpec, comSpec } = require('../refinamento/locais'); // onde cada coisa mora
const { IC } = require('../componentes/icones');
const { markdown } = require('../componentes/markdown');
const { LIDAS, notificar } = require('./notificacoes'); // sino do ticket
const maestro = require('./maestro');
const aoVivo = require('../componentes/ao-vivo'); // caixa "Ao vivo": só as ações (Ver tudo / Recolher)
const abaDocs = require('../componentes/aba-docs'); // aba Docs (documentos, anexos do Jira e notas)
const abaDecisoes = require('../componentes/aba-decisoes'); // aba Decisões
const configuracao = require('../configuracao/configuracao'); // tela do ⚙ com os cliques e testes; também lê as settings e os plugins
const { sddState } = configuracao;
const tarefas = require('../refinamento/tarefas'); // cards de tarefas: tela, script do modal, CSS e ações
const mudancas = require('../refinamento/mudancas'); // mudanças pedidas em comentário: caixas da aba Spec, ações e CSS
const orq = require('../refinamento/orquestrador'); // o Maestro dirigido pela extensão: etapa, seguir, filas e vigia de comentários
const spec = require('../refinamento/spec'); // aba Spec: passos, cartão Agora, pilha de perguntas, modo refinamento e ações
const analise = require('../refinamento/analise'); // aba Análise (handoff backend/mobile): tela, CSS e ações
const { emRefino, modo } = spec;
const acoesQa = require('../qa/acoes'); // ações e peças de UI do módulo QA
const duvidas = require('../refinamento/duvidas'); // aba Dúvidas e as ações de dúvida
const conversas = require('../modulos/conversas'); // conversas do Claude: vínculo com o ticket, abrir e ações do botão Claude
const lista = require('./lista'); // lista de tickets (Refinamento, Implementações, QA) e vinculados
const notas = require('./notas').editor; // o mesmo editor da antiga aba Notas (fonte, tamanho, cores, alinhamento, busca)
const { SEM_TICKET } = require('../componentes/card-ticket');
const { pasta, pastaDe, pastaAba, idAba, gravar } = require('../infra/pastas'); // pastas do ticket
const { PRINCIPAL, CSS_MOLDURA, abasDe, cabecalho, estilo, pagina } = require('./moldura');
const rodape = require('../componentes/rodape'); // cabeçalho, rodapé, CSS e página da webview

// Módulo Refinamento: a lista e, com um ticket aberto, o ticket ocupando a view inteira —
// cabeçalho fixo (voltar, status no board, ▶ ✦ 🎫, menu), corpo com rolagem própria e rodapé (notificações).
// Comandos, Emulador, Evidências, Cofre e Conversas são de outros módulos: o grupo.js mostra cada um dentro
// da moldura deste painel (moldura()), com o mesmo cabeçalho e rodapé.
// Pasta do ticket: ver pastas.js. "Sem ticket": a pasta da conversa atual do Claude (conversas que não são de nenhum ticket).

// aba -> corpo (cada módulo desenha a sua)
function corpoAba(t, aba, d) {
  if (aba === 'docs') return abaDocs.corpo(d, t.id === SEM_TICKET);
  if (aba === 'spec') return spec.corpoAba(t, d);
  if (aba === 'ticket') return d.jira?.erro ? `<p class="erro">${esc(d.jira.erro)}</p><div class="barras"><button class="primario" data-acao="atualizar">Tentar de novo</button></div>`
    : d.jira ? jira.folhaTicket(d.jira) : '<div class="folha"><div class="vazio-aba">Carregando do Jira…</div></div>';
  if (aba === 'analise') return analise.corpoAba(d);
  if (aba === 'tarefas') return tarefas.telaTarefas(t, d.tarefas, d.impactos);
  if (aba === 'massa') return require('../qa/qa').massaHtml(pastaAba(t.id), vscode.workspace.getConfiguration('craftingTable').get('qaHoraRefresh') || '06:00');
  if (aba === 'decisoes') return abaDecisoes.corpoAba(d);
  if (aba === 'duvidas') return duvidas.corpo(d);
  return '';
}

const telaTicket = (t, aba, d) => `${estilo}${cabecalho(t, { aba, secao: PRINCIPAL, dentro: true })}
  <main class="rolagem">${corpoAba(t, aba, d)}</main>${rodape.rodape(t, true)}`;

exports.provider = (ctx) => {
  let view, aberto = null, aba = 'docs', lado = 'backend', observador;
  const cacheJira = {}; // chave -> dados do Jira (ou { erro })
  lista.iniciar(ctx.globalState);
  // Mudou a configuração (aqui ou nas settings): esquece o que foi buscado com a configuração antiga.
  ctx.subscriptions?.push(vscode.workspace.onDidChangeConfiguration((ev) => {
    if (!ev.affectsConfiguration('craftingTable')) return;
    lista.resetar();
    if (conf.aberta()) render();
  }));
  const conf = configuracao.criar(ctx, { render: () => render(), voltar: IC.voltar, aoAbrir: () => { lista.fecharPrevia(); aberto = null; sessao.focar(null); } });
  let avisarMoldura = () => {}, pedirSecao = (/** @type {string} */ _secao) => {};
  for (const m of ['comandos', 'emulador']) require('../modulos/' + m).aoMudar(() => ((conf.aberta() && conf.aba() === 'comandos') || aberto ? render() : avisarMoldura()));
  // ⚙ na barra de título da view (ao lado de "Crafting Table"): volta para a seção principal e abre as configurações.
  ctx.subscriptions?.push(vscode.commands.registerCommand('claudeAbas.configuracoes', async () => {
    if (!require('../infra/grupo').telaCheiaAberta()) await vscode.commands.executeCommand('claudeAbas.tickets.focus');
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
      view.webview.html = pagina(nonce, lista.corpo(servicos, estilo, emRefino));
      avisarMoldura();
      lista.carregarSeNecessario(servicos);
      return;
    }
    if (!abasDe(t).some((a) => a.id === aba)) aba = 'docs';
    // Confere os arquivos da spec antes de desenhar: edição depois de aprovado volta o passo para revisão.
    if (aba === 'spec' && dirSpec(t) && fs.existsSync(path.join(dirSpec(t), 'sdd-state.json')) && sddState()) {
      try { require('child_process').execFileSync(sddState(), ['check', '--ref', pasta(t.id)], { timeout: 5000, stdio: 'ignore' }); } catch {}
    }
    const dir = pastaDe(t.id), dirAba = pastaAba(t.id);
    const d = {
      dir, lado, abertos: spec.abertos,
      docs: t.id === SEM_TICKET ? abaDocs.docsDe(dir) : abaDocs.docsDoTicket(servicos, t),
      handoffs: t.id === SEM_TICKET ? {} : { backend: lerTexto(arqHandoff(t, 'backend')), mobile: lerTexto(arqHandoff(t, 'mobile')) },
      tarefas: t.id === SEM_TICKET ? [] : tarefasDe(dir),
      decisoes: decisoesDe(dirAba),
      duvidas: duvidasDe(dir),
      impactos: t.id === SEM_TICKET ? [] : impactosDe(dir),
      vivoRodando: t.id !== SEM_TICKET && maestro.rodando(dir),
      estado: dirSpec(t) ? estadoSpec(t) : null,
      jira: cacheJira[t.id],
      origens: dir ? ler(path.join(dir, ORIGEM), {}) : {},
      baixando: abaDocs.baixando
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

  const mencionar = (texto) => require('../infra/claude').mencionar(texto);
  const ticketAberto = () => (aberto && aberto !== SEM_TICKET ? ticketDe(aberto) : null);

  const this_abrir = (chave, a) => { acoes.abrir({ id: chave }); aba = a; render(); };
  // Serviços que os módulos recebem em `acoes(servicos)` (ver teste-acoes.js). Só o que algum módulo já usa.
  const servicos = {
    render: () => render(), ticketAberto: () => ticketAberto(), get aberto() { return aberto; },
    pasta, pastaAba, gravar, notificar, reposDe: orq.reposDe, orq, abrirAba: (chave, a) => this_abrir(chave, a), pedirSecao: (s) => pedirSecao(s), mudarAba: (nome) => { aba = nome; },
    secrets: ctx.secrets, globalState: ctx.globalState, cacheJira, atualizarJira: (c) => atualizarJira(c)
  };
  orq.iniciar(servicos, ctx); // liga o vigia de comentários do Jira (relógio de 5 min, dispose no ctx)
  const modulosAcoes = [require('./notificacoes'), acoesQa, lista, abaDocs, analise, spec, conversas, duvidas, mudancas, tarefas, aoVivo].reduce((o, m) => ({ ...o, ...m.acoes(servicos) }), {});
  const acoes = {
    ...conf.acoes,
    ...modulosAcoes,
    abrir(/** @type {{ id: string, key?: string }} */ { id, key }) {
      if (key) { const t = ticketAberto(); return t && vscode.env.openExternal(vscode.Uri.parse(`${t.site}/browse/${key}`)); } // subtarefa
      aberto = id;
      aba = 'docs';
      sessao.focar(id === SEM_TICKET ? null : id, lista.modo());
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
      try { jira.lerLink(link); t = lista.porNaLista(tickets.criar(link.trim(), { listas: [lista.modo()] })); } catch (e) { return vscode.window.showErrorMessage(e.message); }
      this.abrir({ id: t.chave });
    },
    async excluir({ id }) {
      const t = tickets.ler(id);
      // Em mais de uma aba: sai só desta (a pasta da aba fica, volta a aparecer se puxar de novo).
      if (t && tickets.listasDe(t).length > 1) {
        tickets.gravar({ ...t, listas: tickets.listasDe(t).filter((l) => l !== lista.modo()), lista: undefined, implementacao: undefined });
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
    atualizar() { if (ticketAberto()) { delete cacheJira[aberto]; render(); atualizarJira(aberto); orq.vigiarComentarios(); } },
    vigiarAgora() { return orq.vigiarComentarios(); }, // ⟳ e testes: olha os comentários agora
    jira() { const t = ticketAberto(); if (t?.link) vscode.env.openExternal(vscode.Uri.parse(t.link)); }
  };

  const provider = {
    resolveWebviewView(v) {
      view = v;
      view.webview.options = { enableScripts: true };
      view.webview.onDidReceiveMessage((m) => (m.tipo ? notas.receber(m, { pastaAba, postar: (x) => view?.webview.postMessage(x), mencionar }) : /^(cofre|comandos|emulador):/.test(m.acao) ? require('../modulos/' + m.acao.split(':')[0]).api?.acao({ ...m, acao: m.acao.split(':')[1] }) : acoes[m.acao]?.call(acoes, m)));
      view.onDidChangeVisibility(() => { if (view.visible) { conversas.reconciliar(servicos); render(); } });
      conversas.reconciliar(servicos);
      render();
    },
    // Cabeçalho e rodapé do ticket em volta das seções de outros módulos (Comandos, Evidências…).
    moldura: (secao) => {
      const t = aberto === SEM_TICKET ? { id: SEM_TICKET } : aberto && comSpec(ticketDe(aberto));
      if (!t) return null;
      return { css: CSS_MOLDURA + rodape.CSS_FIXO, topo: cabecalho(t, { aba, secao }), rodape: rodape.rodape(t) };
    },
    aoMudarMoldura: (f) => { avisarMoldura = f; },
    aoPedirSecao: (f) => { pedirSecao = f; }
  };

  return vscode.Disposable.from(
    sessao.onDidChange(() => { setTimeout(conversas.reconciliar, 1500, servicos); if (aberto === SEM_TICKET) render(); }), // dá tempo de o Claude gravar a 1ª mensagem
    { dispose: fechar },
    require('../infra/grupo').registrar(PRINCIPAL, provider)
  );
};

exports._teste = { markdown, telaTicket, SEM_TICKET };
