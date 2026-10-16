// @ts-check
const vscode = require('vscode');
const jira = require('../infra/provedores/fachada').jira;
const { esc } = require('../infra/texto');
const tickets = require('../infra/ticket/tickets');
const { IC } = require('../componentes/icones');
const listaTickets = require('../componentes/lista-tickets'); // tela inicial: módulos, pesquisa, cards e vinculados
const vinculados = require('../componentes/vinculados'); // caixa de vinculados (filtro de status por módulo)
const implementacoes = require('../implementacoes/implementacoes');
const incidentes = require('../incidentes/incidentes');
const refinamento = require('../refinamento/refinamento');
const qa = require('../qa/qa');
const menuModulos = require('../componentes/menu-modulos');
const { siteJira, projetoJira, boardsJira, pendencias: pendenciasDe } = require('../configuracao/configuracao');
const variaveis = require('../infra/provedores/variaveis');

// Lista de tickets (Refinamento, Implementações ou QA) e a caixa "Vinculados a você" de cada uma. Estado de módulo (singleton:
// o painel é criado uma vez); o painel lê por modo/resetar/fecharPrevia/corpo/carregarSeNecessario e iniciar().

// Caixa de vinculados de cada módulo (componentes/vinculados.js): título, seletor do topo e quais status do Jira entram.
const VINCULADOS = {
  [refinamento.ID]: refinamento.VINCULADOS,
  [implementacoes.ID]: implementacoes.VINCULADOS,
  [incidentes.ID]: incidentes.VINCULADOS,
  [qa.ID]: qa.VINCULADOS
};
// Status de cada caixa vêm das variáveis do provedor (variavel: chave); sem variável, a caixa não filtra (e a pendência avisa).
const vinculadosDe = (k) => { const v = VINCULADOS[k]; return v?.variavel ? { ...v, status: [].concat(variaveis.ler(v.variavel)) } : v; };

// Lista mostrada: Refinamento, Implementações, QA ou Incidentes (ticket.lista: 'impl' | 'qa' | 'incidentes'). Cada uma tem a sua caixa de vinculados.
let modoLista = tickets.REFINAMENTO;
const iniciar = (globalState) => { variaveis.vincular(globalState); modoLista = tickets.modulo(globalState.get('listaModo')) || tickets.REFINAMENTO; };
const modo = () => modoLista;
const naLista = (t, l = modoLista) => tickets.listasDe(t).includes(l);
// Põe o ticket também nesta aba (não tira das outras); grava listas no lugar do lista/implementacao de antes.
const porNaLista = (t) => (naLista(t) ? t : tickets.gravar({ ...t, listas: [...tickets.listasDe(t), modoLista], lista: undefined, implementacao: undefined }));
const meusPor = {}; // modo -> { itens, etapas, filtro, erro, carregando, pendencias, em }: caixa "Vinculados a você"
let etapasJira = null; // colunas do board [{ nome, ids }] (buscadas uma vez por sessão)
let previa = null; const cachePrevia = {}; // ticket vinculado aberto só para ver (chave) e os dados dele
let labelsQA = null; // labels do Jira com "QA" (buscadas uma vez por sessão)
// Mudou a configuração: esquece o que foi buscado com a configuração antiga.
const resetar = () => { etapasJira = null; ferramenta = null; for (const k in meusPor) delete meusPor[k]; };
// Ferramenta de gestão cadastrada (provedor ativo com conta conectada): só então a caixa de vinculados existe. null = ainda não avaliado
// (a caixa fica oculta); reavaliada a cada desenho da lista, então conectar/sair da conta em Configurações aparece sem recarregar.
let ferramenta = null;
const avaliarFerramenta = async (s) => {
  const ok = !!(await jira.conectado(s.secrets).catch(() => false));
  if (ok !== ferramenta) { const antes = ferramenta; resetar(); ferramenta = ok; if (antes !== null || !ok) s.render(); }
  return ok;
};
// Ticket por documento (chave reservada DOC-N ou ticket local do provedor documento): nunca vai ao provedor; a lista local vence.
const ehChaveDoc = (id) => /^DOC-\d+$/i.test(String(id || '')) || require('../infra/provedores/documento').ehDocumento(tickets.ler(id));
const avisoDoc = () => { vscode.window.showInformationMessage('Este ticket é um documento: não há ferramenta de gestão para abrir.'); };
const fecharPrevia = () => { previa = null; };

// Visualização de um ticket vinculado (sem trazer para a lista): o mesmo conteúdo da aba Ticket.
const telaPrevia = (estilo, key, dados) => `${estilo}
  <header class="ct-cab"><div class="ct-linha">
    <button class="ct-ico" data-acao="previaFechar" title="Voltar para a lista">${IC.voltar}</button>
    <span class="ct-titulo"><span class="ct-chave">${esc(key)}</span>${dados?.resumo ? ` · ${esc(dados.resumo)}` : ''}</span>
    <button class="ct-ico" data-acao="previaJira" data-id="${esc(key)}" title="Ver no ${esc(jira.nome)}">${IC.jira}</button></div>
    <div class="previa-acoes"><button class="primario" data-acao="meuPuxar" data-id="${esc(key)}">↑ Puxar para a lista</button>
      <button data-acao="meuRemover" data-id="${esc(key)}">✕ Remover dos vinculados</button></div></header>
  <main class="rolagem">${dados?.erro ? `<p class="erro">${esc(dados.erro)}</p>` : dados ? jira.folhaTicket(dados) : `<div class="folha"><div class="vazio-aba">Carregando do ${jira.nome}…</div></div>`}</main>`;

// Corpo da tela inicial (prévia de vinculado ou lista); `estilo` é o CSS do painel, `emRefino(t)` marca os cards em refinamento.
const corpo = (s, estilo, emRefino) => {
  if (previa) return telaPrevia(estilo, previa, cachePrevia[previa]);
  const meus = meusPor[modoLista];
  // Mais recente (aberto por último neste módulo) no topo; ticket nunca aberto vale pela data de criação.
  const uso = (x) => x.usos?.[modoLista] || x.criado || 0;
  return estilo + listaTickets.corpo(tickets.listar().filter((x) => naLista(x)).sort((a, b) => uso(b) - uso(a))
    .map((x) => ({ ...x, refinando: modoLista === refinamento.ID && emRefino(x), situacao: require('../infra/ticket/situacao').situacaoDe(x, modoLista) })),
    ferramenta !== true ? null : meus ? { ...meus, itens: meus.itens?.filter((i) => !ehChaveDoc(i.key)), ocultos: s.globalState.get('meusOcultos') || [] } : {}, { modo: modoLista, vinculados: vinculadosDe(modoLista) });
};

// Implementações e QA: só os nos status das variáveis etapasImplementacao / etapasQA (pelo nome do status, sem acento).
// QA: os com a label de QA (não o responsável).
const labelQA = (s) => variaveis.ler('labelQA') || s.globalState.get('labelQA') || '';
const carregarMeus = async (s, forcar) => {
  const k = modoLista, fixo = k !== tickets.REFINAMENTO;
  if (meusPor[k]?.carregando) return;
  if (!(await avaliarFerramenta(s))) return; // sem ferramenta cadastrada: nada é buscado nem desenhado
  const meus = meusPor[k]; // depois de avaliar: conectar/sair da conta já limpou o cache
  if (meus?.carregando || (!forcar && meus?.em && Date.now() - meus.em < 120000)) return;
  const pendencias = await pendenciasDe(s.secrets, k); // conectada mas incompleta: a caixa avisa e não busca
  if (pendencias.length) { meusPor[k] = { pendencias, em: Date.now() }; return s.render(); }
  meusPor[k] = { ...(meus || {}), carregando: true };
  s.render();
  const filtro = fixo ? '' : s.globalState.get('meusFiltro') || '';
  const projeto = projetoJira(); // um ou vários
  try {
    // Etapas = colunas dos boards escolhidos (buscadas uma vez; colunas de mesmo nome se juntam); a escolhida vira os status dela na busca.
    let avisoBoard = '';
    if (!etapasJira && !fixo) etapasJira = await jira.etapas(s.secrets, siteJira(), projeto, boardsJira(), [].concat(variaveis.ler('etapasExtras'))).catch((e) => { avisoBoard = e.message; return null; });
    const coluna = (etapasJira || []).find((c) => c.nome === filtro);
    const porLabel = VINCULADOS[k]?.seletor === 'label'; // QA: a caixa é a dos tickets com a label escolhida
    if (porLabel && (!labelsQA || forcar)) labelsQA = await jira.labels(s.secrets, siteJira(), 'qa');
    const inc = k === incidentes.ID ? await incidentes.filtroBusca({ jira, secrets: s.secrets, site: siteJira(), projeto, boards: boardsJira(), variaveis }) : null; // Incidentes: boards das configurações e tipos de incidente
    let itens = porLabel && !labelQA(s) ? [] : await jira.meus(s.secrets, siteJira(), { statusIds: coluna?.ids, label: porLabel ? labelQA(s) : '', tipos: inc?.tipos || '', boardId: inc?.boardId, projeto });
    itens = vinculados.filtrar(itens, vinculadosDe(k).status);
    meusPor[k] = { itens, label: labelQA(s), labels: labelsQA, etapas: (etapasJira || []).map((c) => c.nome), filtro: coluna ? filtro : '', aviso: avisoBoard, ocultos: s.globalState.get('meusOcultos') || [], em: Date.now() };
  } catch (e) { meusPor[k] = { erro: e.message, label: labelQA(s), labels: labelsQA, etapas: (etapasJira || []).map((c) => c.nome), filtro, em: Date.now() }; }
  s.render();
};
// Depois de desenhar a lista (não a prévia): busca os vinculados se ainda não estão carregando.
const carregarSeNecessario = (s) => { if (!previa && !meusPor[modoLista]?.carregando) carregarMeus(s, false).catch(() => {}); };

// Contrato: `acoes(servicos)` devolve { nome: handler }; o painel espalha no seu `acoes`. Sem `this`.
const acoes = (s) => ({
  meusAtualizar() { carregarMeus(s, true); },
  async labelQA({ id }) { await s.globalState.update('labelQA', id || ''); await variaveis.gravar('labelQA', id || '', 'manual'); carregarMeus(s, true); },
  async meusFiltro({ id }) { await s.globalState.update('meusFiltro', id || ''); carregarMeus(s, true); },
  // Vinculado: clique só mostra o ticket; Puxar traz para a lista (e já busca título, status e anexos); Remover esconde.
  async meuVer({ id }) {
    if (ehChaveDoc(id)) return avisoDoc();
    previa = id;
    s.render();
    if (cachePrevia[id] && !cachePrevia[id].erro) return;
    try { cachePrevia[id] = await jira.buscar(s.secrets, { key: id, site: siteJira() }); }
    catch (e) { cachePrevia[id] = { erro: e.message }; }
    if (previa === id) s.render();
  },
  previaFechar() { previa = null; s.render(); },
  previaJira({ id }) { if (ehChaveDoc(id)) return avisoDoc(); vscode.env.openExternal(vscode.Uri.parse(jira.linkDo(siteJira(), id))); },
  async listaModo({ id }) { modoLista = id; await s.globalState.update('listaModo', id); s.render(); },
  meuPuxar({ id }) {
    if (ehChaveDoc(id) && !tickets.ler(id)) return avisoDoc(); // chave de documento sem ticket local: não vira ticket do provedor
    const t0 = tickets.ler(id);
    if (!t0) {
      try { const link = jira.linkDo(siteJira(), id); tickets.criar(link, { listas: [modoLista] }, jira.identidade(link)); } catch (e) { return vscode.window.showErrorMessage(e.message); }
    } else porNaLista(t0); // já está em outra aba: entra nesta também, cada aba com a sua pasta
    if (cachePrevia[id] && !cachePrevia[id].erro) s.cacheJira[id] = cachePrevia[id];
    previa = null;
    s.render();
    s.atualizarJira(id); // título, status e anexos (a aba Docs mostra os que faltam baixar)
    vscode.window.setStatusBarMessage(`$(arrow-up) ${id} foi para a lista de ${menuModulos.nome(modoLista)}`, 4000);
  },
  async meuRemover({ id }) {
    await s.globalState.update('meusOcultos', [...new Set([...(s.globalState.get('meusOcultos') || []), id])]);
    if (previa === id) previa = null;
    s.render();
  },
  async meusMostrar() { await s.globalState.update('meusOcultos', []); s.render(); }
});

module.exports = { acoes, iniciar, modo, naLista, porNaLista, resetar, fecharPrevia, corpo, carregarSeNecessario, VINCULADOS };
