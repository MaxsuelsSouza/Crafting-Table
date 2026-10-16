// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { esc } = require('../infra/texto');
const jira = require('../infra/ticket').jira;
const sessao = require('../infra/sessao');
const tickets = require('../infra/tickets');
const { ler, lerTexto, NOTAS, ORIGEM, decisoesDe, ticketDe } = require('../infra/pasta-ticket'); // onde cada coisa mora
const { comSpec } = require('../infra/spec');
const { IC } = require('../componentes/icones');
const { markdown } = require('../componentes/markdown');
const { LIDAS, notificar } = require('./notificacoes'); // sino do ticket
const maestro = require('./maestro');
const vigia = require('./vigia');
const aoVivo = require('../componentes/ao-vivo'); // caixa "Ao vivo": só as ações (Ver tudo / Recolher)
const abaDocs = require('../componentes/aba-docs'); // aba Docs (documentos, anexos do Jira e notas)
const abaDecisoes = require('../componentes/aba-decisoes'); // aba Decisões
const configuracao = require('../configuracao/configuracao'); // tela do ⚙ com os cliques e testes; também lê as settings e os plugins
const refinamento = require('../refinamento/refinamento'); // registro do Refinamento: abas, dados, ações, orquestrador e vigia de comentários
const qa = require('../qa/qa'); // registro do QA: aba Massa e ações
const conversas = require('../modulos/conversas'); // conversas do Claude: vínculo com o ticket, abrir e ações do botão Claude
const lista = require('./lista'); // lista de tickets (Refinamento, Implementações, QA) e vinculados
const notas = require('./notas').editor; // o mesmo editor da antiga aba Notas (fonte, tamanho, cores, alinhamento, busca)
const { SEM_TICKET } = require('../componentes/card-ticket');
const { pasta, pastaDe, pastaAba, naRaiz, idAba, gravar } = require('../infra/pastas'); // pastas do ticket
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
  const ref = refinamento.corpoAba(aba, t, d); // Spec, Análise, Tarefas e Dúvidas do Refinamento
  if (ref !== undefined) return ref;
  if (aba === 'ticket' && jira.ehDocumento(t)) return require('../componentes/folha-documento').folhaDocumento(t, undefined, d.uri);
  if (aba === 'ticket') return d.jira?.erro ? `<p class="erro">${esc(d.jira.erro)}</p><div class="barras"><button class="primario" data-acao="atualizar">Tentar de novo</button></div>`
    : d.jira ? jira.folhaTicket(d.jira) : `<div class="folha"><div class="vazio-aba">Carregando do ${jira.nome}…</div></div>`;
  const doQa = qa.corpoAba(aba, t, d, pastaAba(t.id)); // aba Massa do QA
  if (doQa !== undefined) return doQa;
  const inc = require('../incidentes/incidentes').corpoAba(aba, t, d, pastaAba(t.id)); // Mergulho e Evidências do Incidente
  if (inc !== undefined) return inc;
  if (aba === 'esteira') return require('../implementacoes/esteira').corpo(t, d, pastaAba(t.id));
  if (aba === 'dossie') return require('../implementacoes/esteira').corpoDossie(t, d, pastaAba(t.id));
  if (aba === 'reproducao') return require('../implementacoes/reproducao').corpo(t, d, pastaAba(t.id));
  if (aba === 'decisoes') return abaDecisoes.corpoAba(d);
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
  // Notas em foco: redesenhos que vêm de fora (Ao Vivo, arquivos) esperam o editor perder o foco, para não tirar
  // o cursor de quem digita. Navegação da própria pessoa chama render() direto.
  // Ao vivo: linha nova do log não recarrega a página (perderia a rolagem de quem está lendo); só manda a caixa nova para o webview.
  let notasEmFoco = false, renderAdiado = false, pedirVivo = false, ultimaPagina = null;
  const renderVivo = () => { pedirVivo = true; try { render(); } finally { pedirVivo = false; } };
  const renderSuave = () => { if (notasEmFoco) renderAdiado = true; else render(); };
  const render = () => {
    if (!view) return;
    notasEmFoco = false; renderAdiado = false;
    const soVivo = pedirVivo; pedirVivo = false;
    fechar();
    const nonce = crypto.randomBytes(16).toString('hex');
    let t = aberto === SEM_TICKET ? { id: SEM_TICKET, conversas: [] } : aberto && comSpec(ticketDe(aberto));
    // diz em que módulo (e ticket) a pessoa está
    view.title = (conf.aberta() ? 'Configuração' : require('../componentes/menu-modulos').nome(lista.modo())) + (t && t.id !== SEM_TICKET ? ' / ' + t.id : '');
    t = refinamento.aoDesenhar(t); // Refinamento: todos os passos aprovados, o modo termina sozinho
    if (!t) {
      aberto = null; sessao.focar(null); ultimaPagina = null;
      if (conf.aberta()) { view.webview.html = pagina(nonce, estilo + conf.corpo()); avisarMoldura(); return; }
      view.webview.html = pagina(nonce, lista.corpo(servicos, estilo, refinamento.emRefino));
      avisarMoldura();
      lista.carregarSeNecessario(servicos);
      return;
    }
    if (!abasDe(t).some((a) => a.id === aba)) aba = 'docs';
    refinamento.antesDaAba(aba, t); // Refinamento: confere os arquivos da spec antes de desenhar a aba Spec
    const dir = pastaDe(t.id), dirAba = pastaAba(t.id);
    const d = {
      dir, lado,
      ...refinamento.dadosAba(t, dir), // Refinamento: passos lidos, análises, tarefas, dúvidas, impactos e o estado da spec
      uri: (f) => view.webview.asWebviewUri(vscode.Uri.file(f)).toString(), // miniaturas e vídeo da aba Evidências dos Incidentes
      docs: t.id === SEM_TICKET ? abaDocs.docsDe(dir) : abaDocs.docsDoTicket(servicos, t),
      decisoes: decisoesDe(dirAba),
      vivoRodando: t.id !== SEM_TICKET && maestro.rodando(dir),
      jira: cacheJira[t.id],
      origens: dir ? ler(path.join(dir, ORIGEM), {}) : {},
      baixando: abaDocs.baixando
    };
    if (aba === 'ticket' && jira.ehDocumento(t)) view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.file(pasta(t.id))] };
    else if ([...require('../incidentes/incidentes').ABAS_MIDIA, 'reproducao'].includes(aba) && dirAba) view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.file(dirAba)] }; // grupo.js soma à raiz da extensão
    const corpoTicket = telaTicket(t, aba, d), paginaAtual = `${t.id}|${aba}`;
    if (soVivo && paginaAtual === ultimaPagina) view.webview.postMessage({ tipo: 'vivo', html: corpoTicket });
    else view.webview.html = pagina(nonce, corpoTicket, aba === 'docs' && dirAba
      ? { html: lerTexto(path.join(dirAba, NOTAS)) || '', sid: idAba(t.id), estilo: ler(path.join(dirAba, '.notas.json'), null) || notas.ESTILO_PADRAO } : null);
    ultimaPagina = paginaAtual;
    avisarMoldura();
    // O Claude grava documentos, handoffs, decisões e o estado da spec por fora: redesenha quando muda
    // (as notas não, para não atropelar a digitação).
    let espera, soAoVivo = true;
    const depois = (ms, vivo) => {
      if (!vivo) soAoVivo = false;
      clearTimeout(espera);
      espera = setTimeout(() => { const v = soAoVivo; soAoVivo = true; if (!v) renderSuave(); else if (notasEmFoco) renderAdiado = true; else renderVivo(); }, ms);
    };
    const obs = [];
    for (const p of new Set([dir, dirAba])) try { if (p) obs.push(fs.watch(p, (_, nome) => { if (nome !== NOTAS && nome !== '.notas.json' && nome !== '.decisoes.lock' && nome !== LIDAS) depois(300, nome === '.ao-vivo.jsonl'); })); } catch {}
    refinamento.observar(t, depois, obs); // Refinamento: a pasta da spec e a constituição
    observador = { close: () => { clearTimeout(espera); obs.forEach((o) => o.close()); } };
  };

  // Título e status do Jira: guardados no .ticket.json (a lista mostra sem buscar de novo).
  const atualizarJira = async (chave) => {
    const t = tickets.ler(chave);
    if (!t) return;
    if (jira.ehDocumento(t)) { render(); return confirmarTipo(chave); } // ticket-documento: a fonte é a pasta; sem busca nem rede
    try {
      const j = await jira.buscar(ctx.secrets, jira.alvo(t));
      cacheJira[chave] = j;
      tickets.gravar({ ...tickets.ler(chave), titulo: j.resumo, status: j.status, tipo: j.tipo });
    } catch (e) { cacheJira[chave] = { erro: e.message }; }
    render();
    confirmarTipo(chave);
  };
  // Tipo do ticket não reconhecido (sem tipo ou nome fora das listas): pergunta uma vez por sessão; a escolha fica no .ticket.json.
  const perguntados = new Set();
  const confirmarTipo = async (chave) => {
    const tt = require('../infra/tipo-ticket'), t = tickets.ler(chave);
    if (!t || tt.categoriaDe(t) || perguntados.has(chave)) return;
    perguntados.add(chave);
    const op = Object.entries(tt.CATEGORIAS).map(([valor, label]) => ({ label, valor }));
    const r = await vscode.window.showQuickPick(op, { title: `Que tipo de ticket é ${chave}?`, placeHolder: t.tipo ? `O tipo "${t.tipo}" não foi reconhecido` : 'O tipo do ticket não veio da ferramenta', ignoreFocusOut: true });
    if (!r) return;
    tickets.gravar({ ...tickets.ler(chave), categoria: r.valor, categoriaOrigem: 'usuario' });
    render();
  };

  const mencionar = (texto) => require('../infra/claude').mencionar(texto);
  const ticketAberto = () => (aberto && aberto !== SEM_TICKET ? ticketDe(aberto) : null);

  const this_abrir = (chave, a) => { acoes.abrir({ id: chave }); aba = a; render(); };
  // Serviços que os módulos recebem em `acoes(servicos)` (ver teste-acoes.js). Só o que algum módulo já usa.
  const servicos = {
    render: () => renderSuave(), ticketAberto: () => ticketAberto(), get aberto() { return aberto; },
    pasta, pastaAba, gravar, notificar, reposDe: require('../infra/repos').reposDe, orq: refinamento.orq(), abrirAba: (chave, a) => this_abrir(chave, a), pedirSecao: (s) => pedirSecao(s), mudarAba: (nome) => { aba = nome; },
    secrets: ctx.secrets, globalState: ctx.globalState, cacheJira, atualizarJira: (c) => atualizarJira(c)
  };
  vigia.configurar({ render: () => render() }); // observador global: depois de responder a caixa, redesenha
  refinamento.iniciar(servicos, ctx); // liga o vigia de comentários do Jira (relógio de 5 min, dispose no ctx)
  const modulosAcoes = [require('./notificacoes'), qa, lista, abaDocs, refinamento, conversas, aoVivo, require('../incidentes/incidentes'), require('../componentes/fluxo-passos'), require('../implementacoes/esteira'), require('./documento')].reduce((o, m) => ({ ...o, ...m.acoes(servicos) }), {});
  const acoes = {
    ...conf.acoes,
    ...modulosAcoes,
    abrir(/** @type {{ id: string, key?: string }} */ { id, key }) {
      if (key) { const t = ticketAberto(); if (t && jira.ehDocumento(t)) return vscode.window.showInformationMessage('Este ticket é um documento: não há ferramenta de gestão para abrir.'); return t && vscode.env.openExternal(vscode.Uri.parse(jira.linkDo(t.site, key))); } // subtarefa
      aberto = id;
      aba = 'docs';
      if (id !== SEM_TICKET) { const tk = tickets.ler(id); if (tk) tickets.gravar({ ...tk, usos: { ...tk.usos, [lista.modo()]: Date.now() } }); } // sobe para o topo da lista do módulo
      sessao.focar(id === SEM_TICKET ? null : id, lista.modo());
      render();
      if (id !== SEM_TICKET && !cacheJira[id]) atualizarJira(id);
      else if (id !== SEM_TICKET) confirmarTipo(id); // já em cache: só confere o tipo
    },
    voltar() { aberto = null; sessao.focar(null); pedirSecao(PRINCIPAL); render(); },
    aba({ id }) { aba = id; render(); if (id === 'ticket' && aberto !== SEM_TICKET && cacheJira[aberto]?.erro) atualizarJira(aberto); },
    lado({ id }) { lado = id; render(); },
    async novo() {
      const via = await require('./novo-ticket').pedir(vscode); // link (padrão) ou "Anexar documento" (opcional)
      if (!via) return;
      let t;
      if (via.documento) {
        const doc = require('../provedores/documento');
        const r = await vscode.window.showOpenDialog({ canSelectMany: false, title: 'Anexar documento ao ticket', filters: { Documentos: doc.ACEITAS } });
        if (!r?.length) return;
        try { t = lista.porNaLista(doc.criarPorDocumento(r[0].fsPath, { listas: [lista.modo()] })); } catch (e) { return vscode.window.showErrorMessage(e.message); }
        require('../infra/contexto').prepararDocumento(t).then(() => render(), () => {}); // extrai o texto sem bloquear a abertura
      } else {
        try { const ident = jira.identidade(via.link); t = lista.porNaLista(tickets.criar(via.link, { listas: [lista.modo()] }, ident)); } catch (e) { return vscode.window.showErrorMessage(e.message); }
      }
      this.abrir({ id: t.chave });
    },
    async excluir({ id }) {
      const t = tickets.ler(id);
      // Em mais de uma aba: sai só desta (a pasta da aba fica, volta a aparecer se puxar de novo).
      if (t && tickets.listasDe(t).length > 1) {
        tickets.gravar({ ...t, listas: tickets.listasDe(t).filter((l) => l !== lista.modo()), lista: undefined, implementacao: undefined });
        if (aberto === id) { aberto = null; sessao.focar(null); pedirSecao(PRINCIPAL); }
        return render();
      }
      const ok = t && await vscode.window.showWarningMessage(`Excluir o ticket ${id}?`, { modal: true,
        detail: `Sai da lista. A pasta (${t && jira.ehDocumento(t) ? 'o documento, anexos, ' : 'documentos, '}notas, tarefas, evidências) vai para ${path.join(tickets.RAIZ, '_arquivados')} — nada é apagado. As conversas do Claude continuam, sem ticket.` }, 'Excluir');
      if (!ok) return;
      tickets.arquivar(id);
      if (aberto === id) { aberto = null; sessao.focar(null); pedirSecao(PRINCIPAL); }
      render();
    },
    atualizar() { if (ticketAberto() && jira.ehDocumento(ticketAberto())) return render(); if (ticketAberto()) { delete cacheJira[aberto]; render(); atualizarJira(aberto); refinamento.aoAtualizar(); } },
    // 🗑 do cabeçalho: tira o ticket deste módulo (a pasta do ticket só vai para _arquivados se não estiver em outro) ou, na 2ª opção,
    // também leva os registros dele neste módulo (documentos, notas, decisões, evidências, estado). Nada é apagado de verdade.
    async excluirTicket() {
      const t = ticketAberto();
      if (!t || t.id === SEM_TICKET) return;
      const foco = sessao.focoLista(), nomeModulo = require('../componentes/menu-modulos').nome(foco), outros = tickets.listasDe(tickets.ler(t.id) || t).length > 1;
      const tudo = `Excluir e apagar registros de ${nomeModulo}`;
      const r = await vscode.window.showWarningMessage(`Excluir o ticket ${t.chave}?`, { modal: true,
        detail: `Excluir: sai da lista de ${nomeModulo}${outros ? ' (continua nos outros módulos)' : ' e a pasta inteira vai para _arquivados'}.\n${tudo}: além disso, os documentos, notas, decisões e evidências do ticket em ${nomeModulo} também vão para ${path.join(tickets.RAIZ, '_arquivados')}. Nada é apagado de verdade.` }, 'Excluir', tudo);
      if (!r) return;
      if (r === tudo) tickets.arquivarRegistros(t.chave, foco);
      const reg = tickets.ler(t.id);
      if (reg && outros) tickets.gravar({ ...reg, listas: tickets.listasDe(reg).filter((l) => l !== foco), lista: undefined, implementacao: undefined });
      else if (reg) tickets.arquivar(t.id);
      aberto = null; sessao.focar(null); pedirSecao(PRINCIPAL); // volta à lista do módulo (como o ←): a seção em que a pessoa estava (Evidências, Massa…) fica sem ticket
      render();
    },
    jira() { const t = ticketAberto(); if (t && jira.ehDocumento(t)) return vscode.window.showInformationMessage('Este ticket é um documento: não há ferramenta de gestão para abrir.'); if (t?.link) vscode.env.openExternal(vscode.Uri.parse(t.link)); }
  };

  const provider = {
    resolveWebviewView(v) {
      view = v;
      view.webview.options = { enableScripts: true };
      view.webview.onDidReceiveMessage((m) => (m.tipo === 'foco' ? ((notasEmFoco = !!m.ativo), !m.ativo && renderAdiado && setTimeout(() => !notasEmFoco && renderAdiado && render(), 400)) : m.tipo ? notas.receber(m, { pastaAba, postar: (x) => view?.webview.postMessage(x), mencionar }) : /^(cofre|comandos|emulador):/.test(m.acao) ? require('../modulos/' + m.acao.split(':')[0]).api?.acao({ ...m, acao: m.acao.split(':')[1] }) : (() => { const t = ticketAberto(); vigia.clique(m.acao, t && (naRaiz() ? pasta(t.chave) : pastaAba(t.id))); return acoes[m.acao]?.call(acoes, m); })()));
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
