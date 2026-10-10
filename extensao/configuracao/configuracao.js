// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { esc } = require('../infra/ticket')._teste;
const jira = require('../infra/ticket').jira;
const tickets = require('../infra/tickets');
const maestro = require('../painel/maestro');
const banco = require('../plugins/mapa/lib/banco');
const { botao } = require('../componentes/botao');
const menuAbas = require('../componentes/menu-abas');
const cardConfig = require('./card-config');
const { card, cardTeste, selo, linha, dica, acoes } = cardConfig;

// Tela "Configurações": a tela do ⚙ (menu Geral · Comandos · Plugins · Cofre e um card por seção), com os cliques e os testes de cada seção.
// Usado pelo painel.js: criar(ctx, ganchos) devolve { corpo, acoes, aberta, aba, checar }; o painel põe corpo() na página, espalha `acoes`
// nas suas e chama render quando algo mudar. CSS no <style>. Cliques por data-acao: config, configFechar, cfgAba, cfgEditar, cfgTestar,
// cfgRepo*, cfgBanco*, cfgTeams*, pluginAlternar, matarExtensao, atualizarExtensao. Cofre e Comandos são telas de outros módulos, com os
// cliques prefixados (cofre:, comandos:, emulador:). Redesenhe quando mudar aba, valor salvo, resultado de um teste, comandos/terminais ou cofre.
// Também guarda o que o painel lê das settings craftingTable.* (cfg, siteJira, projetoJira, reposAuto, SPECS_PADRAO), os plugins
// (pluginInstalado, sddState) e o aviso de instalação (aviso).
//   criar(ctx, { render, aoAbrir, voltar }): aoAbrir roda ao abrir (o painel solta o ticket aberto) · voltar = HTML da seta do cabeçalho
//   tela(v): só o HTML; v: { aba, valores, estado: { agente, jira, board, specs, repos, banco, teams }, reposAuto, plugins, avisoInstalacao, versao, voltar }

const ler = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
// O plugin guarda o estado em <repo>/<spec.dir>/sdd-state.json; aprovar um passo é só por aqui (o hook dele bloqueia o Claude).
function pluginInstalado(prefixo) {
  const reg = ler(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'), {});
  const lista = reg.plugins || reg;
  const chave = Object.keys(lista).find((k) => k.startsWith(prefixo));
  const info = chave && (Array.isArray(lista[chave]) ? lista[chave][0] : lista[chave]);
  return info?.installPath || null;
}
// Plugins e skills que a extensão usa. "local" = mora na extensão e só o maestro carrega (--plugin-dir); os demais vêm do Claude Code.
const MAPA_DIR = path.join(__dirname, '..', 'plugins', 'mapa'), FOCO_DIR = path.join(__dirname, '..', 'plugins', 'foco');
const USADOS = [
  { id: 'sdd@crafting-local', skills: ['sdd:sdd', 'sdd:iniciar', 'sdd:continuar'], uso: 'Spec: passos 0–6, sdd-state, hooks de guarda' },
  { id: 'mapa', local: MAPA_DIR, skills: ['mapa:mapear'], uso: 'Mapeamento do código e banco (passo 3)' },
  { id: 'foco', local: FOCO_DIR, skills: [], uso: 'Hooks: regras PT-BR e limite de tamanho dos .md' },
  { id: 'fcx-qa-test-planning@fcxlabs', skills: ['jira-qa-planner', 'test-estimation'], uso: 'Método do passo 6 (plano de testes); lido, não invocado' },
  { id: 'i-have-adhd@i-have-adhd', desliga: true, skills: [], uso: 'Desligado nas execuções do maestro (o foco o substitui)' },
];
function listarPlugins() {
  const reg = ler(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'), {});
  const lista = reg.plugins || reg;
  const ligados = ler(path.join(os.homedir(), '.claude', 'settings.json'), {}).enabledPlugins || {};
  return USADOS.map((u) => {
    const v = lista[u.id]; const info = Array.isArray(v) ? v[0] : v;
    return { ...u, instalado: !!(u.local || info), versao: info?.version || '', ligado: u.local ? true : ligados[u.id] !== false };
  });
}
function sddState() { const p = pluginInstalado('sdd@'); return p ? path.join(p, 'bin', 'sdd-state') : null; }

const SPECS_PADRAO = path.join(os.homedir(), 'specs');
// Settings craftingTable.*; vazio cai nos valores de antes (primeiro ticket da lista).
const cfg = () => vscode.workspace.getConfiguration('craftingTable');
const projetoJira = () => cfg().get('jiraProjeto') || (tickets.listar()[0]?.chave || 'WMS').split('-')[0];
const siteJira = () => (cfg().get('jiraSite') || '').replace(/\/+$/, '') || tickets.listar().find((t) => t.site)?.site || 'https://ferreiracosta.atlassian.net';
// Repositórios de código: ao lado do repositório de specs (…/WMS/specs → …/WMS/novo-wms-backend e …/WMS/wms-mobile).
const reposAuto = (specs) => [['backend', 'novo-wms-backend'], ['mobile', 'wms-mobile']]
  .map(([camada, n]) => ({ caminho: path.join(path.dirname(specs), n), camada })).filter((r) => fs.existsSync(r.caminho));
const salvarCfg = (k, v) => cfg().update(k, v, vscode.ConfigurationTarget.Global);
const exec = (cmd, args, opts = {}) => new Promise((ok) => require('child_process').execFile(cmd, args, { timeout: 20000, ...opts }, (e, out, err) => ok({ ok: !e, out: String(out || '').trim(), err: String(err || e?.message || '').trim() })));
const REPO = path.resolve(fs.realpathSync(__dirname), '..', '..');
let avisoInstalacao = null; // { motivos: string[] } | null: o instalar.sh precisa rodar de novo (preenchido por conferirInstalacao)
const aviso = () => avisoInstalacao;

const ABAS = [{ id: 'geral', nome: 'Geral' }, { id: 'comandos', nome: 'Comandos' }, { id: 'plugins', nome: 'Plugins' }, { id: 'cofre', nome: 'Cofre' }];
const AMB_BANCO = { 'copia-producao': 'cópia de produção', qas: 'QAS', producao: 'produção (bloqueada)' };

const geral = (v) => {
  const e = v.estado || {}, val = v.valores, aviso = v.avisoInstalacao;
  const repos = val.repositorios.length ? val.repositorios : v.reposAuto;
  const repo = (r, i) => `<div class="cfg-repo"><div><b>${esc(path.basename(r.caminho))}</b> <span class="cfg-cam">${esc(r.camada)}</span>
      ${r.refRelease ? `<span class="cfg-dim">release: ${esc(r.refRelease)}</span>` : ''}<br><span class="cfg-dim">${esc(r.caminho.replace(os.homedir(), '~'))}</span>
      ${(e.repos?.itens || [])[i] ? `<br><span class="${e.repos.itens[i].ok ? 'cfg-dim' : 'cfg-mal'}">${esc(e.repos.itens[i].texto)}</span>` : ''}</div>
      ${val.repositorios.length ? `<span class="cfg-acoes">${botao('Editar', { variante: 'contorno', acao: 'cfgRepoEditar', id: String(i) })}
      ${botao('Remover', { variante: 'contorno', acao: 'cfgRepoRemover', id: String(i) })}</span>` : ''}</div>`;
  return [
    card({ titulo: 'Instalação', selo: aviso ? `<span class="cfg-st cfg-mal">⚠ ${esc(aviso.motivos.join(' · '))}</span>` : '<span class="cfg-st cfg-ok">✅ em dia</span>',
      acao: botao('Atualizar agora', { variante: 'contorno', acao: 'atualizarExtensao', titulo: 'Roda o instalar.sh (faz git pull antes se houver novidades)' }) }),
    cardTeste('agente', 'Agente de IA', e.agente, linha('Agente', 'Claude Code <span class="cfg-dim">(outros agentes em breve)</span>')
      + linha('Modelo', esc(val.modelo || 'padrão do Claude Code'), 'modelo') + linha('Esforço', esc(val.esforco || 'padrão do Claude Code'), 'esforco')
      + dica('Valem para as etapas do refinamento em segundo plano. A conversa aberta pelo botão do Claude segue o ~/.claude/settings.json.')),
    cardTeste('jira', 'Jira', e.jira, linha('Site', esc(val.jiraSite), 'jiraSite') + linha('Projeto', esc(val.jiraProjeto), 'jiraProjeto')
      + linha('Conta', esc(e.jira?.conta || ''), 'jiraConta')),
    cardTeste('board', 'Board e etapas', e.board, linha('Board principal', esc(val.jiraBoard), 'jiraBoard')
      + linha('Etapas extras', esc(val.etapasExtras.join(', ')), 'etapasExtras')
      + (e.board?.colunas ? linha('Etapas no filtro', esc(e.board.colunas.join(' → '))) : '')),
    cardTeste('specs', 'Repositório de specs', e.specs, linha('Pasta local', esc(val.specsDir), 'specsDir') + linha('Remoto (GitLab)', esc(val.specsRemoto), 'specsRemoto')),
    cardTeste('repos', 'Repositórios de código', e.repos, dica('O Claude só lê os repositórios desta lista durante o refinamento. A camada diz onde ele olha cada requisito.')
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

const plugins = (v) => [
  card({ titulo: 'Plugins e skills que a extensão usa', corpo: (v.plugins || []).map((p) => linha(esc(p.id.split('@')[0]),
    `${esc(p.uso)}<br><span class="cfg-dim">${p.local ? 'da extensão' : p.instalado ? `${esc(p.versao)} · ${p.ligado ? 'ligado' : 'desligado'}` : '<b>não instalado</b>'}${p.skills.length ? ` · skills: ${esc(p.skills.join(', '))}` : ''}</span>`, '',
    p.local || !p.instalado ? '' : botao(p.ligado ? 'Desligar' : 'Ligar', { variante: 'contorno', acao: 'pluginAlternar', id: p.id }), p.id)).join('')
    + dica('Vale para as próximas conversas; as já abertas só pegam ao reabrir.') }),
  card({ titulo: 'Extensão', corpo: dica('Encerra os refinamentos que o Claude está rodando em segundo plano. Nada é apagado; dá para retomar depois.')
    + botao('Encerrar processos da extensão', { variante: 'contorno', acao: 'matarExtensao' }) })
].join('\n');

// Cofre e Comandos (+ Emuladores) são telas de outros módulos: o clique volta com o prefixo do dono (cofre:, comandos:, emulador:).
const outras = (v) => (v.aba === 'cofre' ? ['cofre'] : ['comandos', 'emulador']).map((m) => (require('..' + m).api?.html() || '<div class="cfg-dim">Indisponível.</div>').replace(/data-acao="/g, `data-acao="${m}:`)).join('');

const tela = (v) => `<header class="ct-cab"><div class="ct-linha">
    ${botao(v.voltar, { variante: 'icone', acao: 'configFechar', titulo: 'Voltar para a lista' })}
    <span class="ct-titulo">Configurações</span></div>
    ${menuAbas.menu(ABAS, { aba: v.aba || 'geral', secao: 'cfg', principal: 'cfg', dentro: true, acao: 'cfgAba' })}</header>
  <main class="rolagem cfg">${v.aba === 'plugins' ? plugins(v) : v.aba === 'cofre' || v.aba === 'comandos' ? outras(v) : geral(v)}</main>`;

const CSS = `
  ${cardConfig.CSS}
  .ct-cab .ct-menu { margin: 8px 0; }
  .cfg { padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
  .cfg-versao { text-align: center; margin: 14px 0 6px; }
  .cfg-repo { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-top: 1px solid var(--border); }
  .cfg-repo > div { flex: 1; min-width: 0; word-break: break-all; } .cfg-acoes { display: flex; gap: 4px; }
  .cfg-cam { padding: 0 5px; border-radius: var(--r-sm); font-size: 10px; background: var(--surface-2); }
  .cfg-add { margin-top: 6px; }
`;


// Controle da tela: estado (aberta, aba, resultado dos testes) e os cliques. Um por painel.
const criar = (ctx, { render, aoAbrir, voltar }) => {
  let cfgAberta = false, cfgEstado = {}, cfgAba = 'geral', aposPull = false;
  const valoresCfg = () => ({ modelo: cfg().get('modelo') || '', esforco: cfg().get('esforco') || '', jiraSite: siteJira(), jiraProjeto: projetoJira(), jiraBoard: cfg().get('jiraBoard') || 'Downstream',
    etapasExtras: cfg().get('etapasExtras') || [], specsDir: cfg().get('specsDir') || SPECS_PADRAO, specsRemoto: cfg().get('specsRemoto') || '',
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
    const inst = listarPlugins().find((p) => p.id === 'sdd@crafting-local');
    if (!inst?.instalado) motivos.push('plugin sdd não instalado');
    else if (novo && inst.versao !== novo) motivos.push(`plugin sdd ${inst.versao} → ${novo}`);
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
      const qa = pluginInstalado('fcx-qa-test-planning@');
      return { ok: !!sddState(), curto: sddState() ? '' : 'plugin sdd faltando',
        texto: `${v.out} · plugin sdd ${sddState() ? '✅' : '❌ (claude plugin install sdd@crafting-local)'} · QA (fcx-qa-test-planning) ${qa ? '✅' : '⚠ sem ele o passo 6 segue sem o método de QA'}` };
    },
    async jira() {
      if (!(await ctx.secrets.get('jira.token'))) return { ok: false, curto: 'sem credenciais', texto: 'Clique em Editar na Conta para informar e-mail e API token.' };
      try {
        const [eu, p] = await Promise.all([jira.eu(ctx.secrets, siteJira()), jira.projetoInfo(ctx.secrets, siteJira(), projetoJira())]);
        return { ok: true, conta: eu.nome, texto: `Conectado como ${eu.nome} · projeto ${p.chave} (${p.nome})` };
      } catch (e) { return { ok: false, curto: 'falhou', texto: e.message }; }
    },
    async board() {
      try {
        const cols = await jira.etapas(ctx.secrets, siteJira(), projetoJira(), cfg().get('jiraBoard') || 'Downstream', cfg().get('etapasExtras') || []);
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
      cfgAba = ['cofre', 'comandos', 'plugins'].includes(id) ? id : 'geral';
      require('../modulos/cofre').api?.aoMudar(() => cfgAberta && cfgAba === 'cofre' && render());
      if (cfgAba === 'comandos') { require('../modulos/comandos').api?.atualizar(); require('../modulos/emulador').api?.atualizar(); }
      render();
    },
    atualizarExtensao() {
      const t = vscode.window.createTerminal({ name: 'Atualizar Crafting Table', cwd: REPO });
      t.show();
      t.sendText(`${aposPull ? 'git pull --ff-only && ' : ''}./instalar.sh; echo; echo "Feche TODAS as janelas do VS Code e abra de novo. (Enter fecha este terminal)"; read; exit`);
    },
    async pluginAlternar({ id }) {
      const p = listarPlugins().find((x) => x.id === id);
      if (!p) return;
      const r = await exec(maestro.claudeBin(), ['plugin', p.ligado ? 'disable' : 'enable', id]);
      if (!r.ok) vscode.window.showErrorMessage(`Não consegui ${p.ligado ? 'desligar' : 'ligar'} ${id}: ${r.err}`);
      render();
    },
    matarExtensao() {
      const n = maestro.matarTodos();
      vscode.window.showInformationMessage(n ? `${n} processo${n > 1 ? 's' : ''} do Claude encerrado${n > 1 ? 's' : ''}.` : 'Nenhum processo da extensão rodando.');
      render();
    },
    config() { cfgAba = 'geral'; cfgAberta = true; aoAbrir(); checar(); },
    configFechar() { cfgAberta = false; render(); },
    cfgTestar({ id }) { if (CHECAR[id]) checar([id]); },
    async cfgEditar({ id }) {
      const site = siteJira(), proj = projetoJira();
      if (id === 'jiraSite') {
        const v = await vscode.window.showInputBox({ title: 'Site do Jira', value: site, prompt: 'https://<org>.atlassian.net', ignoreFocusOut: true,
          validateInput: (x) => (/^https:\/\/[\w-]+\.atlassian\.net\/?$/.test(x.trim()) ? null : 'Use https://<org>.atlassian.net') });
        if (v) { await salvarCfg('jiraSite', v.trim().replace(/\/+$/, '')); checar(['jira', 'board']); }
      } else if (id === 'jiraProjeto') {
        const v = await vscode.window.showInputBox({ title: 'Projeto do Jira', value: proj, prompt: 'Chave do projeto (ex.: WMS)', ignoreFocusOut: true,
          validateInput: (x) => (/^[A-Z][A-Z0-9_]+$/.test(x.trim().toUpperCase()) ? null : 'Chave do projeto, ex.: WMS') });
        if (v) { await salvarCfg('jiraProjeto', v.trim().toUpperCase()); checar(['jira', 'board']); }
      } else if (id === 'jiraConta') {
        await ctx.secrets.delete('jira.email'); await ctx.secrets.delete('jira.token');
        if (await jira.credenciais(ctx.secrets)) checar(['jira', 'board']);
      } else if (id === 'jiraBoard') {
        /** @type {{ id: number, nome: string, tipo: string }[]} */
        let lista;
        try { lista = await jira.boards(ctx.secrets, site, proj); } catch (e) { return vscode.window.showErrorMessage(`Não consegui listar os boards: ${e.message}`); }
        if (!lista.length) return vscode.window.showWarningMessage(`O projeto ${proj} não tem boards visíveis para você.`);
        const p = await vscode.window.showQuickPick(lista.map((b) => ({ label: b.nome, description: b.tipo })), { title: `Board principal de ${proj}`, placeHolder: 'As colunas dele viram as etapas do filtro' });
        if (p) { await salvarCfg('jiraBoard', p.label); checar(['board']); }
      } else if (id === 'etapasExtras') {
        let nomes;
        try { nomes = await jira.statusDoProjeto(ctx.secrets, site, proj); } catch (e) { return vscode.window.showErrorMessage(`Não consegui listar os status: ${e.message}`); }
        const atuais = new Set(cfg().get('etapasExtras') || []);
        const p = await vscode.window.showQuickPick(nomes.map((n) => ({ label: n, picked: atuais.has(n) })), { canPickMany: true, title: 'Etapas extras', placeHolder: 'Status fora das colunas do board que também entram no filtro' });
        if (p) { await salvarCfg('etapasExtras', p.map((x) => x.label)); checar(['board']); }
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
      else if (r === TESTAR) { await require('../integracoes/teams').testar(ctx); checar(['teams']); }
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
      return { caminho: r.caminho, camada: c, ...(ref.trim() ? { refRelease: ref.trim() } : {}) };
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
  const corpo = () => tela({ aba: cfgAba, avisoInstalacao, versao: require('../package.json').version, voltar, plugins: cfgAba === 'plugins' ? listarPlugins() : [], valores: valoresCfg(), estado: cfgEstado,
    reposAuto: reposAuto(cfg().get('specsDir') || SPECS_PADRAO) });
  return { corpo, acoes, aberta: () => cfgAberta, aba: () => cfgAba, checar };
};

module.exports = { criar, tela, CSS, cfg, siteJira, projetoJira, reposAuto, SPECS_PADRAO, pluginInstalado, sddState, aviso, _teste: { geral, plugins } };
