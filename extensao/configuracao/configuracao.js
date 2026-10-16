// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { esc } = require('../infra/texto');
const jira = require('../infra/provedores/fachada').jira;
const variaveis = require('../infra/provedores/variaveis');
const maestro = require('../infra/agentes/maestro');
const banco = require('../infra/plugins/mapa/lib/banco');
const { botao } = require('../componentes/botao');
const menuAbas = require('../componentes/menu-abas');
const cardConfig = require('./card-config');
const { card, cardTeste, selo, linha, dica, acoes } = cardConfig;
const conexao = require('./conexao');
const etapas = require('../infra/agentes/etapas');
const { agenteAtivo } = require('../infra/agentes');

// Tela "Configurações": a tela do ⚙ (menu Geral · Comandos · Plugins · Cofre e um card por seção), com os cliques e os testes de cada seção.
// Usado pelo painel.js: criar(ctx, ganchos) devolve { corpo, acoes, aberta, aba, checar }; o painel põe corpo() na página, espalha `acoes`
// nas suas e chama render quando algo mudar. CSS no <style>. Cliques por data-acao: config, configFechar, cfgAba, cfgEditar, cfgTestar, provedor*,
// cfgRepo*, cfgBanco*, cfgTeams*, pluginAlternar, atualizarExtensao. Cofre e Comandos são telas de outros módulos, com os
// cliques prefixados (cofre:, comandos:, emulador:). Redesenhe quando mudar aba, valor salvo, resultado de um teste, comandos/terminais ou cofre.
// Também guarda o que o painel lê das settings craftingTable.* (cfg, siteJira, projetoJira, reposAuto, SPECS_PADRAO), os plugins
// (sddState) e o aviso de instalação (aviso). A aba Plugins só existe para agente com plugins (infra/agentes/index.js); as etapas
// e o plugin de cada uma vêm de infra/agentes/etapas.js. Cliques dela: mkt*, plugin*, plug* (Editar → verificação por IA → Usar).
//   criar(ctx, { render, aoAbrir, voltar }): aoAbrir roda ao abrir (o painel solta o ticket aberto) · voltar = HTML da seta do cabeçalho
//   tela(v): só o HTML; v: { aba, valores, estado: { agente, jira, board, specs, repos, banco, teams }, reposAuto, plugins, avisoInstalacao, versao, voltar }

const ler = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
// O plugin guarda o estado em <repo>/<spec.dir>/sdd-state.json; aprovar um passo é só por aqui (o hook dele bloqueia o Claude).
// sdd-state do plugin que ocupa a vaga da spec (Configurações > Plugins; padrão: sdd@crafting-local).
function sddState() { const r = etapas.raiz('refinamento.sdd'), b = r && path.join(r, 'bin', 'sdd-state'); return b && fs.existsSync(b) ? b : null; }
// Versão instalada de um plugin do Claude Code ('' se não instalado).
function versaoInstalada(id) {
  const reg = ler(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'), {}), v = (reg.plugins || reg)[id];
  return (Array.isArray(v) ? v[0] : v)?.version || '';
}

const SPECS_PADRAO = path.join(os.homedir(), 'specs');
// Settings craftingTable.*; vazio cai nos valores de antes (primeiro ticket da lista).
const cfg = () => vscode.workspace.getConfiguration('craftingTable');
// Site e projeto vêm das variáveis do provedor (Configurações > Variáveis); sem elas, '' (pendência), nunca um valor da empresa.
// Projetos e boards são listas (a pessoa pode trabalhar em mais de um).
const projetoJira = () => [].concat(variaveis.ler('projeto') || []);
const boardsJira = () => [].concat(variaveis.ler('boardPrincipal') || []);
const siteJira = () => String(variaveis.ler('site') || '');
// Variável que cada módulo exige além das comuns (modo = id do módulo da lista).
const EXIGE = { [require('../qa/qa').ID]: require('../qa/qa').EXIGE, [require('../implementacoes/implementacoes').ID]: require('../implementacoes/implementacoes').EXIGE, [require('../incidentes/incidentes').ID]: require('../incidentes/incidentes').EXIGE };
const ROTULO_VAR = Object.fromEntries(variaveis.definicoes.map((d) => [d.chave, d.rotulo.toLowerCase()]));
// O que falta configurar para os vinculados buscarem no provedor: site, projeto, conta (e-mail + token), board principal e as
// variáveis do módulo (modo). Cada item vira o aviso de configuração na caixa.
const pendencias = async (secrets, modo = '') => [
  !siteJira() && 'site', !projetoJira().length && 'projeto',
  !(await jira.conectado(secrets)) && 'conta',
  !boardsJira().length && 'board',
  ...(EXIGE[modo] || []).filter((c) => !variaveis.ler(c).length).map((c) => ROTULO_VAR[c])].filter(Boolean);
const jiraPendencias = pendencias; // nome antigo
// Repositórios de código: ao lado do repositório de specs (…/WMS/specs → …/WMS/novo-wms-backend e …/WMS/wms-mobile).
const reposAuto = (specs) => [['backend', 'novo-wms-backend'], ['mobile', 'wms-mobile']]
  .map(([camada, n]) => ({ caminho: path.join(path.dirname(specs), n), camada })).filter((r) => fs.existsSync(r.caminho));
const salvarCfg = (k, v) => cfg().update(k, v, vscode.ConfigurationTarget.Global);
const exec = (cmd, args, opts = {}) => new Promise((ok) => require('child_process').execFile(cmd, args, { timeout: 20000, ...opts }, (e, out, err) => ok({ ok: !e, out: String(out || '').trim(), err: String(err || e?.message || '').trim() })));
const REPO = path.resolve(fs.realpathSync(__dirname), '..', '..');
let avisoInstalacao = null; // { motivos: string[] } | null: o instalar.sh precisa rodar de novo (preenchido por conferirInstalacao)
const aviso = () => avisoInstalacao;

// Plugins só aparece para agente com plugins/marketplace (infra/agentes/index.js).
const ABAS = (comPlugins = true) => [{ id: 'geral', nome: 'Geral' }, { id: 'comandos', nome: 'Comandos' }, ...(comPlugins ? [{ id: 'plugins', nome: 'Plugins' }] : []), { id: 'cofre', nome: 'Cofre' }, { id: 'variaveis', nome: 'Variáveis' }];
const AMB_BANCO = { 'copia-producao': 'cópia de produção', qas: 'QAS', producao: 'produção (bloqueada)' };

// Card "Ferramenta de gestão de trabalho". Sem conexão: lista dos provedores (os sem adaptador ficam "em breve", desabilitados).
// Conectado: provedor, conta, site e os botões Trocar ferramenta / Sair da conta / Mapear com IA. Os campos antigos (site, projeto…) ficam na aba Variáveis.
// v.conexao = { ativo?: { id, nome }, trocando?: boolean, provedores?: lista de conexao.listaProvedores() }; o estado vem de v.estado.jira (CHECAR.jira).
const TITULO_FERRAMENTA = 'Ferramenta de gestão de trabalho';
const ferramenta = (v) => {
  const x = (v.estado || {}).jira, c = v.conexao || {};
  const lista = () => `<div class="cfg-provs">${(c.provedores || conexao.listaProvedores()).map((p) => `<button class="cfg-prov${p.disponivel ? '' : ' cfg-prov-off'}"${p.disponivel ? ` data-acao="provedorEscolher" data-id="${esc(p.id)}"` : ' disabled'} title="${p.disponivel ? `Conectar ao ${esc(p.nome)}` : 'Em breve'}">
      <span class="cfg-prov-ic">${esc(p.sigla)}</span><span>${esc(p.nome)}</span>${p.disponivel ? '' : '<small>em breve</small>'}</button>`).join('')}</div>`;
  if (!x) return card({ titulo: TITULO_FERRAMENTA, selo: selo(undefined) });
  if (x.conectado === false || c.trocando) {
    return card({ titulo: TITULO_FERRAMENTA, acao: c.trocando ? botao('Cancelar', { variante: 'contorno', acao: 'provedorTrocar' }) : '',
      corpo: dica(c.trocando ? 'Escolha a ferramenta. Ao conectar, a conta atual é substituída.' : 'Nenhuma ferramenta conectada. Escolha a ferramenta onde ficam os tickets do time.') + lista() });
  }
  const b = (v.estado || {}).board, val = v.valores;
  return cardTeste('jira', TITULO_FERRAMENTA, x, linha('Ferramenta', esc((c.ativo || {}).nome || 'Jira')) + linha('Conta', esc(x.conta || '')) + linha('Site', esc(val.jiraSite))
    + linha('Projeto', esc(val.jiraProjeto), 'jiraProjeto') + linha('Board principal', esc(val.jiraBoard), 'jiraBoard') + linha('Etapas extras', esc(val.etapasExtras.join(', ')), 'etapasExtras')
    + (b?.colunas ? linha('Etapas no filtro', esc(b.colunas.join(' → '))) : b && !b.ok && val.jiraBoard ? linha('Etapas no filtro', `<span class="cfg-mal">${esc(b.texto || '')}</span>`) : '')
    + dica('Projeto, etapas de cada módulo e as demais variáveis ficam na aba Variáveis.')
    + acoes(botao('Trocar ferramenta', { variante: 'contorno', acao: 'provedorTrocar' }) + botao('Sair da conta', { variante: 'contorno', acao: 'provedorSair' })
      + botao('Mapear com IA', { variante: 'principal', acao: 'provedorMapear', desligado: !val.jiraProjeto,
        titulo: val.jiraProjeto ? 'A IA lê só os metadados dos projetos escolhidos (nunca o token) e sugere boards, etapas e labels' : 'Escolha os projetos primeiro' })));
};

const geral = (v) => {
  const e = v.estado || {}, val = v.valores, aviso = v.avisoInstalacao;
  const repos = val.repositorios.length ? val.repositorios : v.reposAuto;
  const repo = (r, i) => `<div class="cfg-repo"><div><b>${esc(path.basename(r.caminho))}</b> <span class="cfg-cam">${esc(r.camada)}</span>
      ${r.refRelease ? `<span class="cfg-dim">release: ${esc(r.refRelease)}</span>` : ''}
      ${r.branchPrincipal ? `<span class="cfg-dim">principal: ${esc(r.branchPrincipal)}</span>` : '<span class="cfg-mal">sem branch principal</span>'}<br><span class="cfg-dim">${esc(r.caminho.replace(os.homedir(), '~'))}</span>
      ${(e.repos?.itens || [])[i] ? `<br><span class="${e.repos.itens[i].ok ? 'cfg-dim' : 'cfg-mal'}">${esc(e.repos.itens[i].texto)}</span>` : ''}</div>
      ${val.repositorios.length ? `<span class="cfg-acoes">${botao('Editar', { variante: 'contorno', acao: 'cfgRepoEditar', id: String(i) })}
      ${botao('Remover', { variante: 'contorno', acao: 'cfgRepoRemover', id: String(i) })}</span>` : ''}</div>`;
  return [
    card({ titulo: 'Instalação', selo: aviso ? `<span class="cfg-st cfg-mal">⚠ ${esc(aviso.motivos.join(' · '))}</span>` : '<span class="cfg-st cfg-ok">✅ em dia</span>',
      acao: botao('Atualizar agora', { variante: 'contorno', acao: 'atualizarExtensao', titulo: 'Roda o instalar.sh (faz git pull antes se houver novidades)' }) }),
    cardTeste('agente', 'Agente de IA', e.agente, linha('Agente', `${esc(v.agente || 'Claude Code')} <span class="cfg-dim">(outros agentes em breve)</span>`)
      + linha('Modelo', esc(val.modelo || 'padrão do Claude Code'), 'modelo') + linha('Esforço', esc(val.esforco || 'padrão do Claude Code'), 'esforco')
      + dica('Valem para as etapas do refinamento em segundo plano. A conversa aberta pelo botão do Claude segue o ~/.claude/settings.json.')),
    ferramenta(v),
    cardTeste('specs', 'Repositório de specs', e.specs, linha('Pasta local', esc(val.specsDir), 'specsDir') + linha('Remoto (GitLab)', esc(val.specsRemoto), 'specsRemoto')),
    cardTeste('repos', 'Repositórios de código', e.repos, dica('O Claude lê os repositórios desta lista no refinamento e nos incidentes; a esteira de Implementação também os altera, numa branch de trabalho criada a partir da branch principal de cada um. A camada diz onde ele olha cada requisito.')
      + (repos.length ? repos.map(repo).join('') : '<div class="cfg-dim">Nenhum repositório.</div>')
      + (!val.repositorios.length && repos.length ? dica('Detectados automaticamente ao lado da pasta de specs. Adicionar outro salva a lista.') : '')
      + botao('＋ Adicionar repositório', { variante: 'contorno', acao: 'cfgRepoAdicionar', classe: 'cfg-add' })),
    cardTeste('banco', 'Banco de dados (opcional)', e.banco, linha('Conexão', esc(val.bancoConexao), 'bancoConexao')
      + linha('Ambiente', esc(AMB_BANCO[val.bancoAmbiente] || ''), val.bancoConexao ? 'bancoAmbiente' : '')
      + linha('SQLcl', esc(e.banco?.sqlcl || val.bancoSqlcl || '(procura sozinho)'), 'bancoSqlcl')
      + linha('Dados protegidos', esc(val.bancoSensiveis.join(', ')), 'bancoSensiveis')
      + dica('O mapeamento do passo 3 só <b>lê</b> (sessão somente leitura, até 50 linhas). A IA vê números, estrutura e IDs; colunas pessoais aparecem como <b>***</b>. Sem banco, as premissas de dado ficam como pendência.')
      + acoes(botao('Detectar conexões', { variante: 'contorno', acao: 'cfgBancoDetectar' }) + botao('＋ Nova conexão', { variante: 'contorno', acao: 'cfgBancoAdicionar' })
        + (val.bancoConexao ? botao('Desligar banco', { variante: 'contorno', acao: 'cfgBancoLimpar' }) : ''))),
    cardTeste('teams', 'Teams (opcional)', e.teams, linha('Webhook', e.teams?.ok ? 'guardado no Cofre (TEAMS_WEBHOOK)' : 'não configurado')
      + dica('Mudanças de impacto médio/alto, perguntas do Claude e eventos da spec chegam como card no Teams (só com o VS Code aberto). A URL vem de um fluxo do app Workflows e fica no Cofre como TEAMS_WEBHOOK.')
      + acoes(botao('ⓘ Como criar o webhook', { variante: 'contorno', acao: 'cfgTeamsAjuda', titulo: 'Como criar o fluxo no Workflows' })
        + botao('Abrir Power Automate', { variante: 'contorno', acao: 'cfgTeamsAbrir' }))),
    `<div class="cfg-dim cfg-versao">Crafting Table v${esc(v.versao)}</div>`
  ].join('\n');
};

// Aba Variáveis: o que muda de empresa para empresa. v.variaveis = variaveis.todas(); o selo diz quem preencheu (manual, IA ou migrada dos settings antigos).
const seloVar = (x) => (!x.definida ? '<span class="cfg-st cfg-mal">⚠ falta configurar</span>'
  : x.migrada ? '<span class="cfg-st cfg-esp">migrada dos settings antigos</span>' : `<span class="cfg-st cfg-esp">${x.origem === 'ia' ? 'IA' : 'manual'}</span>`);
const variaveisTela = (v) => {
  const conectado = !!(v.estado || {}).jira?.conectado;
  const intro = card({ titulo: 'O que são as variáveis', corpo: dica('Cada empresa organiza a ferramenta de um jeito: nomes de board, de etapas, de labels. As variáveis dizem à extensão'
    + ' <b>quais nomes da sua conta</b> usar para montar a lista de tickets de cada módulo (QA, Implementações, Incidentes) e o filtro por etapa.'
    + ' Os valores são escolhidos da sua conta, por isso pedem a ferramenta conectada. Para preencher tudo de uma vez, use <b>Mapear com IA</b> na aba Geral.')
    + (conectado ? '' : `<div class="cfg-mal">Conecte a ferramenta na aba Geral para editar.</div>`) });
  return intro + (v.variaveis || []).map((x) => card({ titulo: esc(x.rotulo), selo: seloVar(x),
  acao: conectado ? botao('Editar', { variante: 'contorno', acao: 'varEditar', id: x.chave }) : '',
  corpo: `<div class="cfg-var">${[].concat(x.valor).join(', ') ? esc([].concat(x.valor).join(', ')) : '<i>—</i>'}</div>` + dica(esc(x.descricao))
    + (x.usadaEm ? `<div class="cfg-dim">Usada em: ${esc(x.usadaEm)}</div>` : '')
    + (x.atualizado && x.definida ? `<div class="cfg-dim">atualizado em ${esc(x.atualizado.slice(0, 10))}</div>` : '') })).join('\n');
};

// Aba Plugins (só para agente com plugins: hoje o Claude Code). v.plug = { marketplaces, instalados: { id: { versao, ligado } }, nova: { id: true },
// checando, erro, auto, verif: { vaga: { estado: 'verificando' | 'pronto' | 'erro', candidato, resultado?, erro? } } }.
const autoBtn = (p) => botao(p.auto ? '⟳ Automático: ligado' : '⟳ Automático: desligado', { variante: 'contorno', acao: 'pluginAuto',
  titulo: 'Instala os plugins escolhidos nas etapas que faltarem e atualiza quando a origem tem versão nova' });
const marketplaces = (p) => card({ titulo: 'Marketplaces', acao: botao(p.checando ? 'Verificando…' : '↻ Recarregar', { variante: 'contorno', acao: 'mktRecarregar', desligado: !!p.checando }),
  corpo: dica('De onde vêm os plugins do Claude Code. Vale qualquer marketplace: URL do marketplace.json, pasta local ou repositório GitHub (dono/repo). '
    + 'Recarregar busca o catálogo e confere se há versão nova dos plugins instalados (<span class="cfg-bol"></span>).')
    + (p.marketplaces ? (p.marketplaces.length ? p.marketplaces.map((m) => linha(esc(m.nome), `<span class="cfg-dim">${esc(m.origem)}</span>`, '',
      botao('Remover', { variante: 'contorno', acao: 'mktRemover', id: m.nome }))).join('') : '<div class="cfg-dim">Nenhum marketplace adicionado.</div>')
      : '<div class="cfg-dim">verificando…</div>')
    + acoes(botao('＋ Adicionar marketplace', { variante: 'contorno', acao: 'mktAdicionar' }) + autoBtn(p))
    + (p.erro ? `<div class="cfg-mal">${esc(p.erro)}</div>` : '') });

// Quem ocupa a vaga e como está na máquina, numa linha: "nome · versão" (o jeito de uso fica na dica do mouse).
const ocupante = (vaga, p) => {
  const e = etapas.escolha(vaga), inst = e.tipo === 'plugin' && (p.instalados || {})[e.id];
  const est = e.tipo === 'plugin' ? (inst ? `${esc(inst.versao)}${inst.ligado ? '' : ' · <b>desligado</b>'}` : '<b>não instalado</b>')
    : etapas.raiz(vaga) && fs.existsSync(etapas.raiz(vaga)) ? (e.tipo === 'local' ? 'da extensão' : 'skill na máquina') : '<b>não encontrado</b>';
  return `<span title="${esc(etapas.VAGAS[vaga].como)}"><b>${esc(etapas.rotulo(vaga))}</b>${p.nova?.[e.id] ? ' <span class="cfg-bol" title="Atualização disponível no marketplace"></span>' : ''}`
    + ` <span class="cfg-dim">· ${est}${etapas.ehPadrao(vaga) ? '' : ` · trocado (padrão: ${esc(etapas.VAGAS[vaga].padrao.nome)})`}</span></span>`;
};
const botoesVaga = (vaga, p) => {
  const e = etapas.escolha(vaga), inst = e.tipo === 'plugin' && (p.instalados || {})[e.id];
  return (p.nova?.[e.id] ? botao('Atualizar', { acao: 'pluginAtualizar', id: e.id }) : '')
    + (inst && !inst.ligado ? botao('Ligar', { variante: 'contorno', acao: 'pluginAlternar', id: e.id }) : '')
    + (etapas.ehPadrao(vaga) ? '' : botao('Padrão', { variante: 'contorno', acao: 'plugPadrao', id: vaga, titulo: `Volta para ${etapas.VAGAS[vaga].padrao.nome}` }))
    + botao('Editar', { variante: 'contorno', acao: 'plugEditar', id: vaga, desligado: p.verif?.[vaga]?.estado === 'verificando', titulo: 'Trocar por outro plugin ou skill (a IA confere se atende)' });
};
const VEREDITO = { atende: ['cfg-ok', '✅ atende'], parcial: ['cfg-mal', '⚠ atende em parte'], nao_atende: ['cfg-mal', '✖ não atende'] };
// Resultado da verificação do candidato escolhido no Editar.
const verificacao = (vaga, x) => {
  const nome = esc(x.candidato.skill && x.candidato.tipo !== 'skill' ? `${x.candidato.nome}:${x.candidato.skill}` : x.candidato.nome);
  if (x.estado === 'verificando') return `<div class="cfg-verif"><span class="cfg-st cfg-esp">verificando ${nome} com a IA…</span></div>`;
  if (x.estado === 'erro') return `<div class="cfg-verif"><div class="cfg-mal">Não consegui verificar ${nome}: ${esc(x.erro)}</div>${acoes(botao('Descartar', { variante: 'contorno', acao: 'plugDescartar', id: vaga }))}</div>`;
  const r = x.resultado, [cls, txt] = VEREDITO[r.veredito] || VEREDITO.parcial, usos = etapas.usos(vaga);
  return `<div class="cfg-verif"><div><b>${nome}</b> <span class="cfg-st ${cls}">${txt}</span></div><div>${esc(r.resumo)}</div>`
    + (r.falta.length ? `<div class="cfg-dim">Falta para atender:</div><ul>${r.falta.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '')
    + (r.observacoes ? `<div class="cfg-dim">${esc(r.observacoes)}</div>` : '')
    + (usos.length > 1 ? dica(`A troca vale para: ${esc(usos.join(' · '))}.`) : '')
    + acoes(botao(r.veredito === 'atende' ? `Usar ${nome}` : 'Usar mesmo assim', { variante: r.veredito === 'atende' ? 'principal' : 'contorno', acao: 'plugUsar', id: vaga,
      titulo: x.candidato.origem === 'marketplace' ? 'Instala pelo marketplace e passa a usar nesta etapa' : 'Passa a usar nesta etapa' })
      + botao('Descartar', { variante: 'contorno', acao: 'plugDescartar', id: vaga })) + '</div>';
};
// Uma linha por etapa: "Etapa N. Nome · plugin · estado" e os botões à direita.
const modulo = (m, p) => {
  const vistas = new Set(), marcas = etapas.marcas(m); // vaga repetida em várias etapas: a verificação aparece só na primeira
  // Uma linha de etapa ou subetapa: marca, nome, plugin da vaga e os botões; a verificação por IA aparece só na primeira linha da vaga.
  const linhaVaga = (marca, nome, vaga, { todas = false, obs = '', sub = false, semVaga = false } = {}) => {
    const verif = vaga && !vistas.has(vaga) && p.verif?.[vaga];
    if (vaga) vistas.add(vaga);
    return `<div class="cfg-etp${sub ? ' cfg-sub' : ''}"><div class="cfg-etp-p"><span class="cfg-etp-num${todas ? ' cfg-etp-todas' : ''}">${esc(marca)}</span>`
      + `<span class="cfg-etp-nome">${esc(nome)}</span>${semVaga ? '' : ` <span class="cfg-dim">·</span> ${vaga ? ocupante(vaga, p) : `<span class="cfg-dim">sem plugin${obs ? ` · ${esc(obs)}` : ''}</span>`}`}</div>`
      + `<span class="cfg-acoes">${vaga ? botoesVaga(vaga, p) : ''}</span></div>${verif ? verificacao(vaga, verif) : ''}`;
  };
  const corpo = m.etapas.length ? m.etapas.map((e, i) => linhaVaga(marcas[i].marca, marcas[i].nome, e.vaga, { todas: e.todas, obs: e.obs, semVaga: !e.vaga && !!e.subetapas })
    + marcas[i].subs.map((x) => linhaVaga(x.marca, x.nome, x.vaga, { sub: true })).join('')).join('') : '<div class="cfg-dim">Ainda não roda etapas com o agente: o módulo só abre a conversa do ticket.</div>';
  return card({ titulo: m.nome, corpo: corpo + (m.id === 'refinamento' ? dica('O i-have-adhd fica desligado nas execuções da extensão: as regras de escrita vêm do plugin da última linha.') : '') });
};

const plugins = (v) => {
  const p = v.plug || {};
  return [
    marketplaces(p),
    dica(`Etapas de cada módulo e o plugin ou skill que cada uma usa no ${esc(v.agente || 'agente')}. Editar lista o que está instalado e o catálogo dos marketplaces; a IA confere se o escolhido atende antes da troca.`),
    ...etapas.MODULOS.map((m) => modulo(m, p))
  ].join('\n');
};

// Cofre e Comandos (+ Emuladores) são telas de outros módulos: o clique volta com o prefixo do dono (cofre:, comandos:, emulador:).
const outras = (v) => (v.aba === 'cofre' ? ['cofre'] : ['comandos', 'emulador']).map((m) => (require('../modulos/' + m).api?.html() || '<div class="cfg-dim">Indisponível.</div>').replace(/data-acao="/g, `data-acao="${m}:`)).join('');

const tela = (v) => `<header class="ct-cab"><div class="ct-linha">
    ${botao(v.voltar, { variante: 'icone', acao: 'configFechar', titulo: 'Voltar para a lista' })}
    <span class="ct-titulo">Configurações</span></div>
    ${menuAbas.menu(ABAS(v.comPlugins !== false), { aba: v.aba || 'geral', secao: 'cfg', principal: 'cfg', dentro: true, acao: 'cfgAba' })}</header>
  <main class="rolagem cfg">${v.aba === 'plugins' && v.comPlugins !== false ? plugins(v) : v.aba === 'variaveis' ? variaveisTela(v) : v.aba === 'cofre' || v.aba === 'comandos' ? outras(v) : geral(v)}</main>`;

const CSS = `
  ${cardConfig.CSS}
  .ct-cab .ct-menu { margin: 8px 0; }
  .cfg { padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
  .cfg-versao { text-align: center; margin: 14px 0 6px; }
  .cfg-repo { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-top: 1px solid var(--border); }
  .cfg-repo > div { flex: 1; min-width: 0; word-break: break-all; } .cfg-acoes { display: flex; gap: 4px; }
  .cfg-cam { padding: 0 5px; border-radius: var(--r-sm); font-size: 10px; background: var(--surface-2); }
  .cfg-add { margin-top: 6px; }
  .cfg-var { word-break: break-word; }
  .cfg-etp { display: flex; gap: 8px; align-items: center; padding: 5px 0; border-top: 1px solid var(--border); }
  .cfg-sub { margin-left: 22px; border-top-style: dashed; }
  .cfg-etp-p { flex: 1; min-width: 0; word-break: break-word; }
  .cfg-etp-num { display: inline-block; margin-right: 6px; padding: 1px 7px; border-radius: var(--r-pill); font-size: 10px; font-weight: 700; letter-spacing: .3px;
    text-transform: uppercase; color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
  .cfg-etp-todas { color: var(--text-dim); background: var(--surface-2); border-color: var(--border); }
  .cfg-etp-nome { font-weight: 600; margin-right: 4px; }
  .cfg-verif { margin: 0 0 6px; padding: 8px; border-radius: var(--r-md); background: var(--surface-2); border: 1px solid var(--border); }
  .cfg-verif ul { margin: 2px 0 4px; padding-left: 18px; }
  .cfg-provs { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 6px; }
  .cfg-prov { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--surface-2); color: inherit; font: inherit; cursor: pointer; text-align: left; }
  .cfg-prov:hover:not(:disabled) { border-color: var(--accent); }
  .cfg-prov-off { opacity: .5; cursor: not-allowed; } .cfg-prov small { margin-left: auto; font-size: 9.5px; color: var(--text-dim); }
  .cfg-prov-ic { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; background: var(--surface); border: 1px solid var(--border); }
`;


// Controle da tela: estado (aberta, aba, resultado dos testes) e os cliques. Um por painel.
const criar = (ctx, { render, aoAbrir, voltar }) => {
  variaveis.vincular(ctx.globalState);
  let cfgAberta = false, trocando = false, cfgEstado = {}, cfgAba = 'geral', aposPull = false;
  // Aba Plugins: marketplaces, instalados, novidades e as verificações por IA em andamento (uma por vaga). Só com agente que tem plugins.
  let plug = { marketplaces: null, instalados: {}, nova: {}, checando: false, erro: '', verif: {} };
  const agp = () => agenteAtivo().plugins;
  async function plugChecar(recarregar) {
    const a = agp();
    if (!a || plug.checando) return;
    plug = { ...plug, checando: true, erro: '' }; render();
    let erro = '';
    if (recarregar) { const u = await a.atualizarMarketplaces(); if (!u.ok) erro = u.err; }
    const [mks, inst, nova] = await Promise.all([a.marketplaces(), a.instalados(), a.novidades()]);
    plug = { ...plug, marketplaces: mks, instalados: Object.fromEntries(inst.map((x) => [x.id, x])), nova };
    if (cfg().get('pluginsAuto') !== false) erro = (await plugAuto(nova)) || erro;
    plug = { ...plug, checando: false, erro }; render();
  }
  // Automático: plugin escolhido numa etapa que falta é instalado (do marketplace dele, que precisa estar adicionado); com versão nova, atualizado.
  async function plugAuto(nova) {
    const ids = [...new Set(Object.keys(etapas.VAGAS).map((vg) => etapas.escolha(vg)).filter((e) => e.tipo === 'plugin').map((e) => e.id))];
    for (const id of ids) {
      const falta = !plug.instalados[id];
      if (!falta && !nova[id]) continue;
      const mk = id.split('@')[1];
      if (falta && mk && !(plug.marketplaces || []).some((m) => m.nome === mk)) return `${id} não instalado: adicione o marketplace ${mk} ou troque o plugin da etapa.`;
      const r =await agp()[falta ? 'instalar' : 'atualizar'](id);
      if (!r.ok) return `${id}: ${r.err.split('\n').pop()}`;
      delete nova[id];
    }
    plug.instalados = Object.fromEntries((await agp().instalados()).map((x) => [x.id, x]));
    return '';
  }
  // Plugins da extensão (não passam pelo marketplace), oferecidos no Editar.
  const LOCAIS = () => [...new Map(Object.values(etapas.VAGAS).map((x) => x.padrao).filter((e) => e.tipo === 'local').map((e) => [e.id + (e.skill || ''), e])).values()];
  const mesmaEscolha = (a, b) => a.tipo === b.tipo && a.id === b.id && (a.skill || '') === (b.skill || '') && (a.caminho || '') === (b.caminho || '');
  const salvarVaga = async (vaga, e) => {
    const t = { ...(cfg().get('pluginsEtapa') || {}) };
    if (!e || mesmaEscolha(e, etapas.VAGAS[vaga].padrao)) delete t[vaga];
    else t[vaga] = Object.fromEntries(Object.entries({ tipo: e.tipo, id: e.id, nome: e.nome, caminho: e.caminho, skill: e.skill }).filter(([, x]) => x));
    await salvarCfg('pluginsEtapa', t);
  };
  // Verifica o candidato com a IA (baixa antes se ainda não está na máquina) e guarda o resultado para o card.
  async function plugVerificar(vaga, op) {
    plug.verif = { ...plug.verif, [vaga]: { estado: 'verificando', candidato: op } }; render();
    try {
      const pasta = op.origem === 'marketplace' ? await agp().baixar(op) : op.tipo === 'plugin' ? etapas.instalado(op.id) : op.caminho;
      if (!pasta || !fs.existsSync(pasta)) throw new Error('não achei os arquivos do plugin');
      const resultado = await agp().verificar({ etapas: etapas.usos(vaga), contrato: etapas.VAGAS[vaga].contrato, modelo: cfg().get('modelo') || '',
        atual: { rotulo: etapas.rotulo(vaga), pasta: etapas.raiz(vaga) }, candidato: { rotulo: op.skill ? `${op.nome}:${op.skill}` : op.nome, pasta } });
      plug.verif = { ...plug.verif, [vaga]: { estado: 'pronto', candidato: op, resultado } };
    } catch (e) { plug.verif = { ...plug.verif, [vaga]: { estado: 'erro', candidato: op, erro: e.message } }; }
    render();
  }
  const valoresCfg = () => ({ modelo: cfg().get('modelo') || '', esforco: cfg().get('esforco') || '', jiraSite: siteJira(), jiraProjeto: projetoJira().join(', '), jiraBoard: boardsJira().join(', '),
    etapasExtras: [].concat(variaveis.ler('etapasExtras')), specsDir: cfg().get('specsDir') || SPECS_PADRAO, specsRemoto: cfg().get('specsRemoto') || '',
    repositorios: cfg().get('repositorios') || [],
    bancoConexao: cfg().get('bancoConexao') || '', bancoAmbiente: cfg().get('bancoAmbiente') || '', bancoSqlcl: cfg().get('bancoSqlcl') || '',
    bancoSensiveis: cfg().get('bancoColunasSensiveis')?.length ? cfg().get('bancoColunasSensiveis') : banco.SENSIVEIS_PADRAO });
  // O instalar.sh precisa rodar de novo? (commits novos no remoto, plugin sdd desatualizado, hooks faltando)
  const conferirInstalacao = async () => {
    if (!fs.existsSync(path.join(REPO, 'instalar.sh'))) return;
    const motivos = [];
    const git = (...a) => exec('git', ['-C', REPO, ...a], { timeout: 25000 });
    await git('fetch', '--quiet');
    const atras = await git('rev-list', '--count', 'HEAD..@{u}');
    if (atras.ok && Number(atras.out) > 0) { motivos.push(`${atras.out} novidade(s) no repositório`); aposPull = true; } else aposPull = false;
    const novo = ler(path.join(REPO, 'plugin', 'plugins', 'sdd', '.claude-plugin', 'plugin.json'), {}).version;
    const inst = versaoInstalada('sdd@crafting-local');
    if (!inst) motivos.push('plugin sdd não instalado');
    else if (novo && inst !== novo) motivos.push(`plugin sdd ${inst} → ${novo}`);
    if (['documentos', 'decisoes', 'crafting-testes', 'notificacoes'].some((h) => !fs.existsSync(path.join(os.homedir(), '.claude', 'hooks', `${h}.py`)))) motivos.push('hooks faltando');
    const antes = JSON.stringify(avisoInstalacao);
    avisoInstalacao = motivos.length ? { motivos } : null;
    if (JSON.stringify(avisoInstalacao) !== antes) render();
  };
  setTimeout(conferirInstalacao, 5000);
  const timerInst = setInterval(conferirInstalacao, 30 * 60 * 1000);
  ctx.subscriptions?.push({ dispose: () => clearInterval(timerInst) }, vscode.window.onDidCloseTerminal((t) => { if (t.name === 'Atualizar Crafting Table') conferirInstalacao(); }));
  const CHECAR = {
    async agente() {
      const v = await exec(maestro.claudeBin(), ['--version']);
      if (!v.ok) return { ok: false, curto: 'Claude não encontrado', texto: 'Instale o Claude Code e faça login (claude no terminal).' };
      const qa = etapas.raiz('refinamento.metodoQa'), nomeQa = etapas.rotulo('refinamento.metodoQa'), nomeSdd = etapas.rotulo('refinamento.sdd');
      return { ok: !!sddState(), curto: sddState() ? '' : `${nomeSdd} faltando`,
        texto: `${v.out} · spec (${nomeSdd}) ${sddState() ? '✅' : '❌ (Configurações → Plugins)'} · plano de testes (${nomeQa}) ${qa ? '✅' : '⚠ sem ele o passo 6 segue sem o método de QA'}` };
    },
    async jira() {
      if (!(await jira.conectado(ctx.secrets))) return { ok: false, conectado: false, curto: 'sem credenciais', texto: 'Escolha a ferramenta e conecte a conta.' };
      try {
        const eu = await jira.eu(ctx.secrets, siteJira());
        const ps = (await Promise.all(projetoJira().map((c) => jira.projetoInfo(ctx.secrets, siteJira(), c).catch(() => null)))).filter(Boolean);
        const p = ps.length ? { chave: ps.map((x) => x.chave).join(', '), nome: ps.map((x) => x.nome).join(', ') } : null;
        return { ok: true, conectado: true, conta: eu.nome, texto: `Conectado como ${eu.nome}${p ? ` · ${p.chave.includes(',') ? 'projetos' : 'projeto'} ${p.chave}` : ' · projeto ainda não escolhido'}` };
      } catch (e) { return { ok: false, conectado: true, curto: 'falhou', texto: e.message }; }
    },
    async board() {
      try {
        const cols = await jira.etapas(ctx.secrets, siteJira(), projetoJira(), boardsJira(), [].concat(variaveis.ler('etapasExtras')));
        return { ok: true, colunas: cols.map((c) => c.nome), texto: `${cols.length} etapas no filtro dos vinculados` };
      } catch (e) { return { ok: false, curto: 'falhou', texto: e.message }; }
    },
    async specs() {
      const dir = cfg().get('specsDir') || SPECS_PADRAO, remoto = cfg().get('specsRemoto') || '';
      if (!fs.existsSync(dir)) return { ok: false, curto: 'pasta não existe', texto: remoto ? 'A pasta ainda não existe: o clone pelo remoto entra no próximo passo da configuração.' : 'Escolha a pasta local (Editar).' };
      if (!fs.existsSync(path.join(dir, '.git'))) return { ok: false, curto: 'não é git', texto: `${dir} não é um repositório git.` };
      const o = await exec('git', ['-C', dir, 'remote', 'get-url', 'origin']);
      if (remoto) {
        const r = await exec('git', ['ls-remote', '--heads', remoto], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
        if (!r.ok) return { ok: false, curto: 'remoto inacessível', texto: `Sem acesso a ${remoto}: ${r.err.split('\n')[0]}` };
        if (o.ok && o.out !== remoto) return { ok: false, curto: 'origin diferente', texto: `A pasta aponta para ${o.out}, não para o remoto configurado.` };
      }
      return { ok: true, texto: `branch ${(await exec('git', ['-C', dir, 'symbolic-ref', '--short', 'HEAD'])).out || '?'} · ${o.ok ? `origin ${o.out}` : 'sem origin (só local)'}` };
    },
    async repos() {
      const lista = (cfg().get('repositorios') || []).length ? cfg().get('repositorios') : reposAuto(cfg().get('specsDir') || SPECS_PADRAO);
      const itens = await Promise.all(lista.map(async (r) => {
        if (!fs.existsSync(r.caminho)) return { ok: false, texto: 'pasta não existe' };
        if (!(await exec('git', ['-C', r.caminho, 'rev-parse', '--is-inside-work-tree'])).ok) return { ok: false, texto: 'não é um repositório git' };
        const b = await exec('git', ['-C', r.caminho, 'symbolic-ref', '--short', 'HEAD']);
        b.out ||= 'HEAD destacado';
        if (r.refRelease && !(await exec('git', ['-C', r.caminho, 'rev-parse', '--verify', '--quiet', r.refRelease])).ok) return { ok: false, texto: `branch atual ${b.out} · ref ${r.refRelease} não encontrada` };
        return { ok: true, texto: `branch atual ${b.out}` };
      }));
      return { ok: lista.length > 0 && itens.every((i) => i.ok), curto: lista.length ? 'verifique os itens' : 'nenhum', itens, texto: lista.length ? '' : 'Adicione ao menos um repositório.' };
    },
    async banco() {
      const conexao = cfg().get('bancoConexao') || '', ambiente = cfg().get('bancoAmbiente') || '';
      const sqlcl = banco.acharSqlcl(cfg().get('bancoSqlcl'));
      if (!conexao) return { ok: false, curto: 'opcional', sqlcl, texto: 'Sem banco: as premissas de dado ficam como pendência (🟡). Clique em Detectar conexões para ligar.' };
      if (!sqlcl) return { ok: false, curto: 'SQLcl não encontrado', texto: 'Instale o SQLcl ou informe o caminho em SQLcl → Editar.' };
      if (!ambiente) return { ok: false, curto: 'defina o ambiente', sqlcl, texto: 'Diga o que a conexão é (cópia de produção ou QAS) em Ambiente → Editar.' };
      if (ambiente === 'producao') return { ok: false, curto: 'produção bloqueada', sqlcl, texto: 'O mapeamento não consulta produção: use a cópia de produção ou o QAS.' };
      const t = await banco.testar({ conexao, ambiente, sqlcl, sensiveis: cfg().get('bancoColunasSensiveis') });
      return { ...t, sqlcl, curto: t.ok ? '' : t.curto, texto: [t.texto, t.aviso && `⚠ ${t.aviso}`].filter(Boolean).join('\n') };
    },
    async teams() { return (await ctx.secrets.get('cofre:TEAMS_WEBHOOK')) ? { ok: true } : { ok: false, curto: 'opcional', texto: '' }; }
  };
  const checar = async (ids = Object.keys(CHECAR)) => {
    for (const id of ids) delete cfgEstado[id];
    render();
    await Promise.all(ids.map(async (id) => { try { cfgEstado[id] = await CHECAR[id](); } catch (e) { cfgEstado[id] = { ok: false, curto: 'erro', texto: e.message }; } render(); }));
  };
  // Liga uma conexão ao mapeamento e pergunta o ambiente. Função interna (não é ação da tela): só aceita o nome como texto.
  const escolherBanco = async (nome) => {
  if (typeof nome !== 'string' || !nome) return;
    const amb = await vscode.window.showQuickPick([
      { label: 'Cópia de produção', description: 'recomendado para tirar dúvidas de dado', v: 'copia-producao' },
      { label: 'QAS', description: 'ambiente de testes (massa parcial: não conclui regra de negócio)', v: 'qas' },
      { label: 'Produção', description: 'bloqueada: o mapeamento não consulta produção', v: 'producao' }], { title: `${nome} é…`, placeHolder: 'O que é esta conexão?' });
    if (!amb) return;
    await salvarCfg('bancoConexao', nome); await salvarCfg('bancoAmbiente', amb.v);
    if (amb.v === 'producao') vscode.window.showWarningMessage('Marcada como produção: o mapeamento vai recusar consultar. Escolha a cópia de produção ou o QAS.');
    checar(['banco']);
  };
  const acoes = {
    cfgAba({ id }) {
      cfgAba = ['cofre', 'comandos', 'plugins', 'variaveis'].includes(id) ? id : 'geral';
      require('../modulos/cofre').api?.aoMudar(() => cfgAberta && cfgAba === 'cofre' && render());
      if (cfgAba === 'plugins' && !agp()) cfgAba = 'geral';
      if (cfgAba === 'plugins') plugChecar(false);
      if (cfgAba === 'comandos') { require('../modulos/comandos').api?.atualizar(); require('../modulos/emulador').api?.atualizar(); }
      render();
    },
    atualizarExtensao() {
      const t = vscode.window.createTerminal({ name: 'Atualizar Crafting Table', cwd: REPO });
      t.show();
      t.sendText(`${aposPull ? 'git pull --ff-only && ' : ''}./instalar.sh; echo; echo "Feche TODAS as janelas do VS Code e abra de novo. (Enter fecha este terminal)"; read; exit`);
    },
    async mktAdicionar() {
      const origem = await vscode.window.showInputBox({ title: 'Adicionar marketplace', ignoreFocusOut: true, placeHolder: 'https://…/marketplace.json · /caminho/local · dono/repositorio',
        prompt: 'URL do marketplace.json, pasta local ou repositório GitHub. Marketplace privado usa a credencial git da máquina.' });
      if (!origem?.trim()) return;
      const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Adicionando marketplace…' }, () => agp().adicionarMarketplace(origem.trim()));
      if (!r.ok) vscode.window.showErrorMessage(`Não consegui adicionar o marketplace: ${r.err.split('\n').pop()}`);
      plugChecar(false);
    },
    async mktRemover({ id }) {
      const usados = Object.keys(etapas.VAGAS).filter((vg) => etapas.escolha(vg).id.endsWith(`@${id}`)).flatMap((vg) => etapas.usos(vg));
      const ok = await vscode.window.showWarningMessage(`Remover o marketplace ${id}?`, { modal: true,
        detail: usados.length ? `Plugins dele são usados em: ${usados.join(' · ')}. Eles param de receber atualização.` : 'Os plugins instalados dele param de receber atualização.' }, 'Remover');
      if (!ok) return;
      const r = await agp().removerMarketplace(id);
      if (!r.ok) vscode.window.showErrorMessage(`Não consegui remover ${id}: ${r.err.split('\n').pop()}`);
      plugChecar(false);
    },
    async pluginAuto() { await salvarCfg('pluginsAuto', cfg().get('pluginsAuto') === false); render(); if (cfg().get('pluginsAuto') !== false) plugChecar(false); },
    mktRecarregar() { plugChecar(true); },
    async pluginAtualizar({ id }) {
      const r = await agp().atualizar(id);
      if (!r.ok) vscode.window.showErrorMessage(`Não consegui atualizar ${id}: ${r.err}`);
      else vscode.window.showInformationMessage(`${id} atualizado. Reabra as conversas para usar a versão nova.`);
      plugChecar(false);
    },
    async pluginAlternar({ id }) {
      const p = plug.instalados[id];
      if (!p) return;
      const r = await agp().alternar(id, !p.ligado);
      if (!r.ok) vscode.window.showErrorMessage(`Não consegui ${p.ligado ? 'desligar' : 'ligar'} ${id}: ${r.err}`);
      plugChecar(false);
    },
    // Editar: lista instalados (cada skill), skills avulsas, plugins da extensão e o catálogo; o escolhido passa pela verificação da IA.
    async plugEditar({ id: vaga }) {
      if (!etapas.VAGAS[vaga] || plug.verif[vaga]?.estado === 'verificando') return;
      const ops = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Buscando plugins e skills…' }, () => agp().opcoes(LOCAIS()));
      const atual = etapas.escolha(vaga);
      const GRUPO = { instalado: 'Instalados', skill: 'Skills na máquina', extensao: 'Da extensão', marketplace: 'Nos marketplaces (instala ao usar)' };
      const itens = Object.keys(GRUPO).flatMap((g) => {
        const l = ops.filter((o) => o.origem === g);
        return l.length ? [{ label: GRUPO[g], kind: vscode.QuickPickItemKind.Separator }, ...l.map((o) => ({
          label: `${mesmaEscolha(o, atual) ? '$(check) ' : ''}${o.skill && o.tipo !== 'skill' ? `${o.nome}:${o.skill}` : o.nome}`,
          description: g === 'marketplace' ? o.id : o.descricao, detail: g === 'marketplace' ? o.descricao.slice(0, 160) : undefined, op: o }))] : [];
      });
      const esc_ = await vscode.window.showQuickPick(itens, { title: `${etapas.usos(vaga).join(' · ')} · usa hoje: ${etapas.rotulo(vaga)}`, placeHolder: 'Escolha o substituto (a IA confere se atende antes de trocar)', matchOnDescription: true, matchOnDetail: true, ignoreFocusOut: true });
      const op = /** @type {any} */ (esc_)?.op;
      if (!op || mesmaEscolha(op, atual)) return;
      plugVerificar(vaga, op);
    },
    // Usar o verificado: instala se veio do catálogo, escolhe a skill (plugin com várias) e grava a troca. Vale na próxima execução da etapa.
    async plugUsar({ id: vaga }) {
      const x = plug.verif[vaga];
      if (!x || x.estado !== 'pronto') return;
      const op = { ...x.candidato };
      if (op.origem === 'marketplace') {
        const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Instalando ${op.id}…` }, () => agp().instalar(op.id));
        if (!r.ok) return vscode.window.showErrorMessage(`Não consegui instalar ${op.id}: ${r.err.split('\n').pop()}`);
      }
      if (op.tipo === 'plugin' && !op.skill) {
        const sk = agp().skillsDoPlugin(etapas.instalado(op.id));
        op.skill = sk.length > 1 ? await vscode.window.showQuickPick(sk, { title: `Qual skill de ${op.nome} usar?`, ignoreFocusOut: true }) : sk[0];
        if (sk.length > 1 && !op.skill) return;
      }
      await salvarVaga(vaga, op);
      delete plug.verif[vaga];
      vscode.window.showInformationMessage(`${etapas.rotulo(vaga)} passa a ser usado em: ${etapas.usos(vaga).join(' · ')}. Vale a partir da próxima execução.`);
      plugChecar(false);
    },
    plugDescartar({ id: vaga }) { delete plug.verif[vaga]; render(); },
    async plugPadrao({ id: vaga }) {
      const ok = await vscode.window.showWarningMessage(`Voltar para ${etapas.VAGAS[vaga].padrao.nome}?`, { modal: true, detail: `Vale para: ${etapas.usos(vaga).join(' · ')}.` }, 'Voltar ao padrão');
      if (!ok) return;
      await salvarVaga(vaga, null); render();
    },
    config() { cfgAba = 'geral'; cfgAberta = true; aoAbrir(); checar(); },
    configFechar() { cfgAberta = false; render(); },
    cfgTestar({ id }) { if (CHECAR[id]) checar(id === 'jira' ? ['jira', 'board'] : [id]); }, // o card da ferramenta mostra o board também
    // Edita uma variável do provedor: escolhe numa lista do provedor (boards, status, labels) quando dá, senão digita.
    async varEditar({ id }) {
      const d = variaveis.definicoes.find((x) => x.chave === id);
      if (!d) return;
      if (!(await jira.conectado(ctx.secrets))) return vscode.window.showWarningMessage('Conecte a ferramenta na aba Geral antes de editar as variáveis.');
      if ((d.escolha === 'boards' || d.escolha === 'status') && !projetoJira().length) {
        const r = await vscode.window.showInformationMessage(`${d.rotulo} depende do Projeto, que ainda não foi escolhido.`, 'Escolher projeto');
        if (r !== 'Escolher projeto') return;
        await acoes.varEditar({ id: 'projeto' });
        if (!projetoJira().length) return;
      }
      const atual = variaveis.ler(id), site = siteJira(), proj = projetoJira();
      const digitar = async () => {
        const v = await vscode.window.showInputBox({ title: d.rotulo, value: [].concat(atual).join(d.tipo === 'lista' ? ', ' : ''), ignoreFocusOut: true,
          prompt: d.tipo === 'lista' ? `${d.descricao} Separe por vírgula.` : d.descricao });
        return v === undefined ? undefined : v.trim();
      };
      let novo;
      try {
        // Projetos e boards: escolha múltipla (a pessoa pode trabalhar em mais de um).
        const marcados = new Set([].concat(atual));
        if (d.escolha === 'projetos' && site) {
          const p = await vscode.window.showQuickPick((await jira.projetos(ctx.secrets, site)).map((x) => ({ label: x.chave, description: x.nome, picked: marcados.has(x.chave) })),
            { canPickMany: true, title: d.rotulo, placeHolder: d.descricao });
          novo = p?.map((x) => x.label);
        } else if (d.escolha === 'boards' && site && proj.length) {
          const lista = await jira.boards(ctx.secrets, site, proj);
          const p = await vscode.window.showQuickPick([...new Map(lista.map((b) => [b.nome, b])).values()].map((b) => ({ label: b.nome, description: `${b.projeto || ''} · ${b.tipo}`, picked: marcados.has(b.nome) })),
            { canPickMany: true, title: d.rotulo, placeHolder: d.descricao });
          novo = p?.map((x) => x.label);
        } else if (d.escolha === 'labels' && site) {
          const p = await vscode.window.showQuickPick((await jira.labels(ctx.secrets, site, '')).map((l) => ({ label: l })), { title: d.rotulo, placeHolder: d.descricao });
          novo = p?.label;
        } else if (d.escolha === 'tipos' && site) {
          // Tipos de item da conta. Tipos que se quebram vão do mais alto ao mais baixo: ordena pelo nível da hierarquia do Jira.
          const tipos = (await jira.descobrir(ctx.secrets, site, proj)).tiposItem || [];
          const nivel = new Map(tipos.map((x) => [x.nome, x.nivel ?? -9]));
          const nomes = [...new Set([...[...marcados].map((x) => String(x).split('|')[0]), ...tipos.map((x) => x.nome)])];
          const p = await vscode.window.showQuickPick(nomes.map((n) => ({ label: n, description: tipos.find((x) => x.nome === n)?.subtarefa ? 'subtarefa' : '', picked: [...marcados].some((m) => String(m).split('|')[0] === n) })),
            { canPickMany: true, title: d.rotulo, placeHolder: d.descricao });
          novo = id === 'tiposQuebrar' ? p?.map((x) => x.label).sort((a, b) => (nivel.get(b) ?? -9) - (nivel.get(a) ?? -9)) : p?.map((x) => x.label);
        } else if (d.escolha === 'status' && site && proj.length) {
          const DIGITAR = 'Digitar à mão…';
          const nomes = await jira.statusDoProjeto(ctx.secrets, site, proj);
          const itens = [...[...marcados].filter((n) => !nomes.includes(n)), ...nomes].map((n) => ({ label: n, picked: marcados.has(n) })).concat([{ label: DIGITAR, picked: false }]);
          const p = await vscode.window.showQuickPick(itens, { canPickMany: true, title: d.rotulo, placeHolder: d.descricao });
          novo = !p ? undefined : p.some((x) => x.label === DIGITAR) ? await digitar() : p.map((x) => x.label);
        } else novo = await digitar();
      } catch (e) {
        vscode.window.showWarningMessage(`Não consegui listar as opções (${e.message}). Digite o valor.`);
        novo = await digitar();
      }
      if (novo === undefined) return;
      await variaveis.gravar(id, novo, 'manual');
      checar(['jira', 'board']);
      render();
    },
    // Conexão com a ferramenta de gestão de trabalho.
    provedorTrocar() { trocando = !trocando; render(); },
    async provedorEscolher({ id }) {
      const antes = await jira.conectado(ctx.secrets).catch(() => false);
      const eu = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Conectando…' }, () => conexao.conectar(ctx, id));
      trocando = false;
      checar(['jira', 'board']);
      if (!eu) return;
      // Primeiro os projetos (a pessoa escolhe); só com eles o mapeamento por IA tem o que mapear.
      if (!projetoJira().length) {
        const p = await vscode.window.showInformationMessage(`Conectado como ${eu.nome}. Escolha os projetos em que você trabalha.`, 'Escolher projetos', 'Depois');
        if (p === 'Escolher projetos') await acoes.varEditar({ id: 'projeto' });
      }
      if (!projetoJira().length) return antes ? render() : undefined;
      const r = await vscode.window.showInformationMessage('Quer que a IA mapeie boards, etapas e labels dos projetos escolhidos?', 'Mapear com IA', 'Depois');
      if (r === 'Mapear com IA') await acoes.provedorMapear();
      else render();
    },
    async provedorSair() {
      const ok = await vscode.window.showWarningMessage(`Sair da conta do ${jira.nome}?`, { modal: true,
        detail: 'Apaga o e-mail e o token guardados e TODAS as variáveis (site, projeto, board, etapas, label de QA…). Ao conectar de novo, preencha-as outra vez ou use "Mapear com IA".' }, 'Sair e limpar');
      if (!ok) return;
      await jira.sairConta(ctx.secrets);
      await variaveis.limpar();
      checar(['jira', 'board']);
    },
    async provedorMapear() { await conexao.mapear(ctx, { aoTerminar: () => { checar(['jira', 'board']); render(); } }); },
    async cfgEditar({ id }) {
      const site = siteJira(), proj = projetoJira();
      if (id === 'jiraSite') {
        const v = await vscode.window.showInputBox({ title: `Site do ${jira.nome}`, value: site, prompt: 'https://<org>.atlassian.net', ignoreFocusOut: true,
          validateInput: (x) => (/^https:\/\/[\w-]+\.atlassian\.net\/?$/.test(x.trim()) ? null : 'Use https://<org>.atlassian.net') });
        if (v) { await variaveis.gravar('site', v.trim().replace(/\/+$/, '')); checar(['jira', 'board']); }
      } else if (id === 'jiraProjeto' || id === 'jiraBoard' || id === 'etapasExtras') {
        await acoes.varEditar({ id: { jiraProjeto: 'projeto', jiraBoard: 'boardPrincipal', etapasExtras: 'etapasExtras' }[id] }); // o card da ferramenta edita as variáveis
      } else if (id === 'jiraConta') {
        await jira.sairConta(ctx.secrets);
        if (await jira.credenciais(ctx.secrets)) checar(['jira', 'board']);
      } else if (id === 'specsDir') {
        const u = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, title: 'Pasta local do repositório de specs', openLabel: 'Usar esta pasta' });
        if (u) { await salvarCfg('specsDir', u[0].fsPath); checar(['specs', 'repos']); }
      } else if (id === 'modelo') {
        const PADRAO = 'padrão do Claude Code', OUTRO = 'Outro…';
        const p = await vscode.window.showQuickPick([PADRAO, 'opus', 'sonnet', 'fable', 'haiku', OUTRO], { title: 'Modelo do refinamento', placeHolder: cfg().get('modelo') || PADRAO });
        const v = p === OUTRO ? await vscode.window.showInputBox({ title: 'Modelo do refinamento', prompt: 'Alias ou nome completo (ex.: claude-opus-5-5)', ignoreFocusOut: true }) : p;
        if (v !== undefined) { await salvarCfg('modelo', v === PADRAO ? '' : v.trim()); checar(['agente']); }
      } else if (id === 'esforco') {
        const PADRAO = 'padrão do Claude Code';
        const p = await vscode.window.showQuickPick([PADRAO, 'low', 'medium', 'high', 'xhigh', 'max'], { title: 'Esforço do refinamento', placeHolder: cfg().get('esforco') || PADRAO });
        if (p) { await salvarCfg('esforco', p === PADRAO ? '' : p); checar(['agente']); }
      } else if (id === 'bancoConexao') { return acoes.cfgBancoDetectar();
      } else if (id === 'bancoAmbiente') { return escolherBanco(cfg().get('bancoConexao'));
      } else if (id === 'bancoSqlcl') {
        const u = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, title: 'Executável do SQLcl (…/sqlcl/bin/sql)', openLabel: 'Usar este' });
        if (u) { await salvarCfg('bancoSqlcl', u[0].fsPath); checar(['banco']); }
      } else if (id === 'bancoSensiveis') {
        const atual = (cfg().get('bancoColunasSensiveis')?.length ? cfg().get('bancoColunasSensiveis') : banco.SENSIVEIS_PADRAO).join(', ');
        const v = await vscode.window.showInputBox({ title: 'Colunas com dados pessoais', value: atual, ignoreFocusOut: true,
          prompt: 'Separadas por vírgula. Reconhece pelo nome da coluna (ex.: cpf casa com NR_CPF). O valor vira *** antes da IA ver.' });
        if (v !== undefined) { await salvarCfg('bancoColunasSensiveis', v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)); checar(['banco']); }
      } else if (id === 'specsRemoto') {
        const v = await vscode.window.showInputBox({ title: 'Repositório de specs no GitLab', value: cfg().get('specsRemoto') || '', prompt: 'URL do git (ssh ou https)', ignoreFocusOut: true });
        if (v !== undefined) { await salvarCfg('specsRemoto', v.trim()); checar(['specs']); }
      }
    },
    // Lista as conexões da máquina (arquivos do SQLcl e tnsnames; sem IA) e liga uma delas ao mapeamento.
    async cfgBancoDetectar() {
      const lista = banco.detectar();
      if (!lista.length) return vscode.window.showWarningMessage('Nenhuma conexão encontrada (SQLcl salvas em ~/.dbtools ou tnsnames.ora). Use ＋ Nova conexão.');
      const itens = lista.map((c) => ({ label: c.nome, description: [c.conexao, c.usuario && `usuário ${c.usuario}`].filter(Boolean).join(' · '),
        detail: c.usavel ? 'conexão salva do SQLcl: pronta para usar' : 'só o endereço (tnsnames): crie a conexão com ＋ Nova conexão', c }));
      const p = await vscode.window.showQuickPick(itens, { title: 'Banco de dados para o mapeamento', placeHolder: 'Escolha a conexão (só leitura)' });
      if (!p) return;
      if (!p.c.usavel) return vscode.window.showInformationMessage(`${p.c.nome} só tem o endereço. Use ＋ Nova conexão para informar usuário e senha.`);
      await escolherBanco(p.c.nome);
    },
    // Passo a passo do fluxo do Workflows que gera o TEAMS_WEBHOOK.
    async cfgTeamsAjuda() {
      const ABRIR = 'Abrir Power Automate', TESTAR = 'Testar aviso';
      const r = await vscode.window.showInformationMessage('Como criar o TEAMS_WEBHOOK', { modal: true, detail: [
        '1. No Teams, abra o app Workflows (barra lateral ou "…").',
        '2. Escolha um destes modelos:',
        '   • "Enviar alertas de webhook para um chat": avisos só para você (chat consigo mesmo) ou um grupo.',
        '   • "Enviar alertas de webhook para um canal": o time inteiro vê.',
        '   Não use as variações "de pessoas específicas" / "de pessoas em uma organização": exigem login e a extensão não tem.',
        '3. Escolha o chat ou canal e salve. Copie a URL do final (começa com https:// e tem "sig=").',
        '4. Configurações → Cofre → ＋ → nome TEAMS_WEBHOOK → cole a URL.',
        '5. Clique em Testar aviso.',
        '',
        'Perdeu a URL? Power Automate → Meus fluxos → o fluxo → Editar → primeiro passo ("Quando uma solicitação de webhook do Teams for recebida") → URL HTTP POST.',
        'A URL é uma senha: quem tiver consegue postar no chat. Vazou? Apague o fluxo e crie outro.'
      ].join('\n') }, ABRIR, TESTAR);
      if (r === ABRIR) acoes.cfgTeamsAbrir();
      else if (r === TESTAR) { await require('../infra/integracoes/teams').testar(ctx); checar(['teams']); }
    },
    cfgTeamsAbrir() { vscode.env.openExternal(vscode.Uri.parse('https://make.powerautomate.com/manage/flows')); },
    async cfgBancoLimpar() { await salvarCfg('bancoConexao', ''); await salvarCfg('bancoAmbiente', ''); checar(['banco']); },
    // Cria a conexão no próprio SQLcl (ele guarda a senha cifrada; a extensão não guarda nem registra senha).
    async cfgBancoAdicionar() {
      const sqlcl = banco.acharSqlcl(cfg().get('bancoSqlcl'));
      if (!sqlcl) return vscode.window.showWarningMessage('SQLcl não encontrado: informe o caminho em SQLcl → Editar.');
      const nome = await vscode.window.showInputBox({ title: 'Nova conexão (1/4): nome', prompt: 'Ex.: Staging', ignoreFocusOut: true, validateInput: (x) => (/^[\w .-]{2,40}$/.test(x.trim()) ? null : 'Letras, números, espaço, ponto, hífen') });
      if (!nome) return;
      const alvo = await vscode.window.showInputBox({ title: 'Nova conexão (2/4): endereço', prompt: 'host:porta/serviço (ex.: 10.0.0.1:1521/fctst)', ignoreFocusOut: true, validateInput: (x) => (/^[\w.-]+:\d+\/[\w.-]+$/.test(x.trim()) ? null : 'Use host:porta/serviço') });
      if (!alvo) return;
      const usuario = await vscode.window.showInputBox({ title: 'Nova conexão (3/4): usuário', ignoreFocusOut: true, validateInput: (x) => (/^[\w$#]{1,30}$/.test(x.trim()) ? null : 'Usuário inválido') });
      if (!usuario) return;
      const senha = await vscode.window.showInputBox({ title: 'Nova conexão (4/4): senha', prompt: 'Fica cifrada no SQLcl; a Crafting Table não a guarda', password: true, ignoreFocusOut: true });
      if (!senha) return;
      const r = await banco.criarConexao({ sqlcl, nome: nome.trim(), alvo: alvo.trim(), usuario: usuario.trim(), senha });
      if (!r.ok) return vscode.window.showErrorMessage(`Conexão não criada: ${r.erro}`);
      vscode.window.showInformationMessage(`Conexão ${nome.trim()} criada no SQLcl.`);
      await escolherBanco(nome.trim());
    },
    async cfgRepoAdicionar() {
      const u = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, title: 'Repositório de código', openLabel: 'Adicionar' });
      if (!u) return;
      const r = await acoes.cfgRepoPerguntar({ caminho: u[0].fsPath });
      if (!r) return;
      const atual = cfg().get('repositorios') || [];
      // Primeira vez: os detectados automaticamente entram na lista junto, para não sumirem.
      const base = atual.length ? atual : reposAuto(cfg().get('specsDir') || SPECS_PADRAO);
      await salvarCfg('repositorios', [...base.filter((x) => x.caminho !== r.caminho), r]);
      checar(['repos']);
    },
    async cfgRepoPerguntar(r) {
      const c = await vscode.window.showQuickPick(['backend', 'mobile', 'web', 'outro'], { title: `Camada de ${path.basename(r.caminho)}`, placeHolder: r.camada || 'Onde este repositório entra no sistema' });
      if (!c) return null;
      const ref = await vscode.window.showInputBox({ title: 'Ref de release (opcional)', value: r.refRelease || '', prompt: 'Ex.: origin/master-md — onde o código em produção está. Vazio: a branch atual.', ignoreFocusOut: true });
      if (ref === undefined) return null;
      const principal = await vscode.window.showInputBox({ title: 'Branch principal', value: r.branchPrincipal || '', prompt: 'Ex.: master-md, main, develop — a esteira de Implementação cria a branch de trabalho a partir dela.', ignoreFocusOut: true });
      if (principal === undefined) return null;
      return { caminho: r.caminho, camada: c, ...(ref.trim() ? { refRelease: ref.trim() } : {}), ...(principal.trim() ? { branchPrincipal: principal.trim() } : {}) };
    },
    async cfgRepoEditar({ id }) {
      const l = [...(cfg().get('repositorios') || [])], i = Number(id);
      if (!l[i]) return;
      const r = await acoes.cfgRepoPerguntar(l[i]);
      if (r) { l[i] = r; await salvarCfg('repositorios', l); checar(['repos']); }
    },
    async cfgRepoRemover({ id }) {
      const l = [...(cfg().get('repositorios') || [])], i = Number(id);
      if (!l[i]) return;
      const ok = await vscode.window.showWarningMessage(`Tirar ${path.basename(l[i].caminho)} da lista?`, { modal: true, detail: 'O Claude deixa de ler este repositório no refinamento. A pasta não é apagada.' }, 'Remover');
      if (!ok) return;
      l.splice(i, 1);
      await salvarCfg('repositorios', l);
      checar(['repos']);
    },
  };
  const corpo = () => tela({ aba: cfgAba, avisoInstalacao, versao: require('../package.json').version, voltar, plug: { ...plug, auto: cfg().get('pluginsAuto') !== false }, agente: agenteAtivo().nome, comPlugins: !!agp(), variaveis: cfgAba === 'variaveis' ? variaveis.todas() : [], valores: valoresCfg(), estado: cfgEstado, conexao: { ativo: { id: require('../infra/provedores').provedorAtivo().id, nome: jira.nome }, trocando },
    reposAuto: reposAuto(cfg().get('specsDir') || SPECS_PADRAO) });
  return { corpo, acoes, aberta: () => cfgAberta, aba: () => cfgAba, checar };
};

module.exports = { criar, tela, CSS, cfg, siteJira, projetoJira, boardsJira, jiraPendencias, pendencias, reposAuto, SPECS_PADRAO, sddState, aviso, _teste: { geral, plugins } };
