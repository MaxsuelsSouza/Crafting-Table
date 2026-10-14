// @ts-check
const vscode = require('vscode');
const jira = require('../infra/ticket').jira;
const { esc } = require('../infra/texto');
const tickets = require('../infra/tickets');
const { IC } = require('../componentes/icones');
const listaTickets = require('../componentes/lista-tickets'); // tela inicial: módulos, pesquisa, cards e vinculados
const vinculados = require('../componentes/vinculados'); // caixa de vinculados (filtro de status por módulo)
const implementacoes = require('../implementacoes/implementacoes');
const incidentes = require('../incidentes/incidentes');
const menuModulos = require('../componentes/menu-modulos');
const { siteJira, projetoJira, pendencias: pendenciasDe } = require('../configuracao/configuracao');
const variaveis = require('../provedores/variaveis');

// Lista de tickets (Refinamento, Implementações ou QA) e a caixa "Vinculados a você" de cada uma. Estado de módulo (singleton:
// o painel é criado uma vez); o painel lê por modo/resetar/fecharPrevia/corpo/carregarSeNecessario e iniciar().

// Caixa de vinculados de cada módulo (componentes/vinculados.js): título, seletor do topo e quais status do Jira entram.
const VINCULADOS = {
  refinamento: { titulo: 'Vinculados a você', seletor: 'etapa' },
  [implementacoes.ID]: implementacoes.VINCULADOS,
  [incidentes.ID]: incidentes.VINCULADOS,
  qa: { titulo: 'Com a label', seletor: 'label', variavel: 'etapasQA' }
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
const meusPor = {}; // modo -> { itens, etapas, filtro, erro, carregando, semCredencial, em }: caixa "Vinculados a você"
let etapasJira = null; // colunas do board [{ nome, ids }] (buscadas uma vez por sessão)
let previa = null; const cachePrevia = {}; // ticket vinculado aberto só para ver (chave) e os dados dele
let labelsQA = null; // labels do Jira com "QA" (buscadas uma vez por sessão)
// Mudou a configuração: esquece o que foi buscado com a configuração antiga.
const resetar = () => { etapasJira = null; for (const k in meusPor) delete meusPor[k]; };
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
  return estilo + listaTickets.corpo(tickets.listar().filter((x) => naLista(x)).map((x) => ({ ...x, refinando: emRefino(x) })),
    meus ? { ...meus, ocultos: s.globalState.get('meusOcultos') || [] } : {}, { modo: modoLista, vinculados: vinculadosDe(modoLista) });
};

// Implementações e QA: só os nos status das variáveis etapasImplementacao / etapasQA (pelo nome do status, sem acento).
// QA: os com a label de QA (não o responsável).
const labelQA = (s) => variaveis.ler('labelQA') || s.globalState.get('labelQA') || '';
const carregarMeus = async (s, forcar) => {
  const k = modoLista, meus = meusPor[k], fixo = k !== tickets.REFINAMENTO;
  if (meus?.carregando || (!forcar && meus?.em && Date.now() - meus.em < 120000)) return;
  const pendencias = await pendenciasDe(s.secrets, k); // sem Jira configurado, a caixa não busca nada
  if (pendencias.length) { meusPor[k] = { pendencias, em: Date.now() }; return s.render(); }
  if (!forcar && !(await jira.conectado(s.secrets))) { meusPor[k] = { semCredencial: true, em: Date.now() }; return s.render(); }
  meusPor[k] = { ...(meus || {}), carregando: true, semCredencial: false };
  s.render();
  const filtro = fixo ? '' : s.globalState.get('meusFiltro') || '';
  const projeto = projetoJira();
  try {
    // Etapas = colunas do board principal (buscadas uma vez); a escolhida vira os status dela na busca.
    let avisoBoard = '';
    if (!etapasJira && !fixo) etapasJira = await jira.etapas(s.secrets, siteJira(), projeto, String(variaveis.ler('boardPrincipal')), [].concat(variaveis.ler('etapasExtras'))).catch((e) => { avisoBoard = e.message; return null; });
    const coluna = (etapasJira || []).find((c) => c.nome === filtro);
    if (k === 'qa' && (!labelsQA || forcar)) labelsQA = await jira.labels(s.secrets, siteJira(), 'qa');
    const boardId = k === incidentes.ID ? (await jira.boardPorNome(s.secrets, siteJira(), projeto, String(variaveis.ler('boardPrincipal')))).id : undefined; // Incidentes: só o board das configurações
    let itens = k === 'qa' && !labelQA(s) ? [] : await jira.meus(s.secrets, siteJira(), { statusIds: coluna?.ids, label: k === 'qa' ? labelQA(s) : '', tipos: k === incidentes.ID ? String(variaveis.ler('tipoIncidente')) : '', boardId, projeto });
    itens = vinculados.filtrar(itens, vinculadosDe(k).status);
    meusPor[k] = { itens, label: labelQA(s), labels: labelsQA, etapas: (etapasJira || []).map((c) => c.nome), filtro: coluna ? filtro : '', aviso: avisoBoard, ocultos: s.globalState.get('meusOcultos') || [], em: Date.now() };
  } catch (e) { meusPor[k] = { erro: e.message, label: labelQA(s), labels: labelsQA, etapas: (etapasJira || []).map((c) => c.nome), filtro, em: Date.now() }; }
  s.render();
};
// Depois de desenhar a lista (não a prévia): busca os vinculados se ainda não estão carregando.
const carregarSeNecessario = (s) => { if (!previa && !meusPor[modoLista]?.carregando) carregarMeus(s, false); };

// Contrato: `acoes(servicos)` devolve { nome: handler }; o painel espalha no seu `acoes`. Sem `this`.
const acoes = (s) => ({
  meusAtualizar() { carregarMeus(s, true); },
  async labelQA({ id }) { await s.globalState.update('labelQA', id || ''); await variaveis.gravar('labelQA', id || '', 'manual'); carregarMeus(s, true); },
  async meusFiltro({ id }) { await s.globalState.update('meusFiltro', id || ''); carregarMeus(s, true); },
  // Vinculado: clique só mostra o ticket; Puxar traz para a lista (e já busca título, status e anexos); Remover esconde.
  async meuVer({ id }) {
    previa = id;
    s.render();
    if (cachePrevia[id] && !cachePrevia[id].erro) return;
    try { cachePrevia[id] = await jira.buscar(s.secrets, { key: id, site: siteJira() }); }
    catch (e) { cachePrevia[id] = { erro: e.message }; }
    if (previa === id) s.render();
  },
  previaFechar() { previa = null; s.render(); },
  previaJira({ id }) { vscode.env.openExternal(vscode.Uri.parse(jira.linkDo(siteJira(), id))); },
  async listaModo({ id }) { modoLista = id; await s.globalState.update('listaModo', id); s.render(); },
  meuPuxar({ id }) {
    const t0 = tickets.ler(id);
    if (!t0) {
      try { tickets.criar(jira.linkDo(siteJira(), id), { listas: [modoLista] }); } catch (e) { return vscode.window.showErrorMessage(e.message); }
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
