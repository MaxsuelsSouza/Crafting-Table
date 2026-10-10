// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const qa = require('./qa');
const maestro = require('../painel/maestro');
const aoVivo = require('../componentes/ao-vivo');
const sessao = require('../infra/sessao');
const { IC } = require('../componentes/icones');
const { cfg } = require('../configuracao/configuracao');
const { NOTIF } = require('../painel/notificacoes');
const jira = require('../infra/ticket').jira;
const EVID = 'claudeAbas.evidencias'; // mesma id da seção Evidências (moldura.js)

const depsQa = (s, t) => {
  const dir = s.pastaAba(t.id), emu = require('../modulos/emulador');
  return {
    chave: t.chave, backend: s.reposDe(t).find((r) => r.camada === 'backend')?.caminho, api: (rota) => jira.api(s.secrets, t.site, rota),
    horaRefresh: cfg().get('qaHoraRefresh') || '06:00', aoMudar: s.render,
    extras: ['--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }), '--add-dir', dir,
      ...(cfg().get('modelo') ? ['--model', cfg().get('modelo')] : [])],
    // Ambiente: primeiro os Comandos das Configurações (API, Metro) e o emulador padrão; o script da skill completa o que faltar.
    comandos: {
      lista: () => require('../modulos/comandos').api?.lista() || [],
      rodar: (nome) => { const api = require('../modulos/comandos').api, b = api?.lista().find((x) => x.nome === nome); if (b && !b.rodando) api?.alternar({ id: b.id }); }
    },
    emulador: { avd: cfg().get('avdPadrao'), aparelhos: () => emu.dispositivos(), ligar: () => emu.ligar(cfg().get('avdPadrao')) },
    adb: path.join(emu.SDK, 'platform-tools', 'adb'),
    confirmar: async (texto) => (await vscode.window.showWarningMessage(texto, { modal: true }, 'Usar')) === 'Usar',
    gravarTela: (destino) => { if (emu.emuladorRodando()) require('../modulos/evidencias').gravar?.({ destino, chave: t.chave, continuo: true }); },
    pararTela: () => require('../modulos/evidencias').pararGravacao?.(),
    avisar: (texto) => { try { fs.appendFileSync(path.join(dir, NOTIF), JSON.stringify({ em: new Date().toISOString(), tipo: 'fim', texto: `${t.chave} · ${texto}` }) + '\n'); } catch {} }
  };
};

// Botão ▶/⏸ do cabeçalho do ticket na lista QA (b = data-acao/data-painel já montado pelo cabecalho()).
const botaoPlay = (dir, b) => (qa.rodando(dir)
  ? `<button class="ct-ico ct-pausa" ${b('qaParar')} title="Pausar o QA: o cenário em andamento é descartado e volta na retomada">${IC.pausa}</button>`
  : `<button class="ct-ico ct-play" ${b('qaPlay')} title="Executar QA: planejamento, ambiente, massa e cenários pendentes (Ao vivo em Evidências)">${IC.play}</button>`);

// Caixa do ambiente no rodapé (depois de Comandos). Preparando → abre o log ao vivo; erro → luz vermelha piscando e bolinha até abrir a análise.
const caixaAmbiente = (dir, acao) => {
  const amb = qa.statusAmbiente(dir);
  return !amb ? '' : amb.tipo === 'preparando'
    ? `<button class="ct-amb" ${acao}="qaAmbLog" title="Preparando API, Metro, emulador e app: clique para ver o log ao vivo"><span class="ct-luz prep"></span>Preparando ambiente</button>`
    : amb.tipo === 'erro'
      ? `<button class="ct-amb" ${acao}="${amb.analisando ? 'qaAmbLog' : 'qaAmbErro'}" title="${amb.analisando ? 'O Claude está analisando o erro: clique para ver o log ao vivo' : 'Ver o erro e a análise do Claude'}"><span class="ct-luz erro ${amb.nova || amb.analisando ? 'pisca' : ''}"></span>Ambiente parou${amb.analisando ? ' · analisando' : ''}${amb.nova ? '<span class="ct-badge ct-badge-erro">1</span>' : ''}</button>`
      : `<button class="ct-amb" ${acao}="qaAmbLog" title="Ambiente pronto: clique para ver o log"><span class="ct-luz ok"></span>Ambiente</button>`;
};

// Contrato: `acoes(servicos)` devolve { nome: handler }; o painel espalha no seu `acoes`. Sem `this`: chamadas entre handlers refazem o objeto.
const acoes = (s) => ({
  // ▶ do QA: abre Evidências (Ao vivo) e confere o planejamento no Jira (qa.js). Sem plano, o cartão bloqueia e oferece criar.
  // ▶ do QA: só procura o planejamento (Ao vivo em Evidências). Executar é o Dar início do cartão.
  async qaPlay() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    s.pedirSecao(EVID);
    await qa.verificarPlano(s.pastaAba(t.id), t.chave, (rota) => jira.api(s.secrets, t.site, rota));
    s.render();
  },
  // Dar início / Retomar: sobe o ambiente, confere a massa e executa os cenários da fila, um claude -p por cenário (qa.executar).
  async qaIniciar() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    await qa.executar(s.pastaAba(t.id), depsQa(s, t));
    s.render();
  },
  async qaAmbAnalisar() { const t = s.ticketAberto(); if (t) { await qa.analisarAmbiente(s.pastaAba(t.id), depsQa(s, t)); s.render(); } },
  // Log ao vivo: terminal acompanhando o log do preparo (tail -F); pelos Comandos, também os terminais da API e do Metro.
  // Modal do erro do ambiente: a análise do Claude (ou o erro cru, se ainda não houver análise), com log ao vivo e reanálise.
  async qaAmbErro() {
    const t = s.ticketAberto();
    if (!t) return;
    const dir = s.pastaAba(t.id), r = qa.resumoErroAmbiente(dir);
    if (!r) return;
    qa.analiseVista(dir); s.render();
    const detalhe = r.analise ? `Análise do Claude\n\n${r.analise}${r.detalhe ? `\n\n─────\n${r.detalhe}` : ''}` : `${r.detalhe || 'Sem detalhe.'}\n\nO Claude ainda não analisou este erro.`;
    const botoes = ['Log ao vivo', ...(qa.rodando(dir) ? [] : [r.analise ? 'Analisar de novo' : 'Analisar com o Claude'])];
    const escolha = await vscode.window.showErrorMessage(r.titulo, { modal: true, detail: detalhe }, ...botoes);
    if (escolha === 'Log ao vivo') acoes(s).qaAmbLog();
    else if (escolha) acoes(s).qaAmbAnalisar();
  },
  qaAmbLog() {
    const t = s.ticketAberto();
    if (!t) return;
    const dir = s.pastaAba(t.id), a = qa.ambiente(dir), cmds = require('../modulos/comandos').api;
    for (const nome of a?.terminais || []) { const b = cmds?.lista().find((x) => x.nome === nome); if (b?.rodando) cmds?.acao({ acao: 'mostrar', id: b.id }); }
    const nome = `QA ${t.chave} · log do ambiente`;
    const term = vscode.window.terminals.find((x) => x.name === nome)
      || vscode.window.createTerminal({ name: nome, shellPath: 'tail', shellArgs: ['-n', '+1', '-F', path.join(dir, qa.LOG_AMB)] });
    term.show();
  },
  qaPlanoAbrir() {
    const t = s.ticketAberto(), v = t && qa.versaoAtual(s.pastaAba(t.id));
    if (!v) return;
    qa.mudar(s.pastaAba(t.id), { lido: v.v }); // libera o Aprovar: só depois de ler
    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path.join(s.pastaAba(t.id), v.arquivo)));
    s.render();
  },
  qaPlanoMencionar() { const t = s.ticketAberto(), v = t && qa.versaoAtual(s.pastaAba(t.id)); if (v) require('../infra/claude').mencionar(`@${path.join(s.pastaAba(t.id), v.arquivo)}`); },
  qaPlanoAprovar() { const t = s.ticketAberto(); if (t) { qa.aprovar(s.pastaAba(t.id)); s.render(); } },
  // Pedir mudança: o Claude aplica na subtarefa do Jira; ao terminar, a versão nova volta para aprovação.
  async qaPlanoMudar() {
    const t = s.ticketAberto();
    if (!t) return;
    const dir = s.pastaAba(t.id), v = qa.versaoAtual(dir);
    if (!v) return;
    const pedido = await vscode.window.showInputBox({ title: `Mudança no planejamento ${v.subtarefa} · v${v.v}`, prompt: 'O Claude aplica na subtarefa do Jira e gera a versão nova para você aprovar', ignoreFocusOut: true });
    if (!pedido?.trim()) return;
    const ok = maestro.rodar(dir, { prompt: qa.promptMudanca(t.link, v.subtarefa, path.join(dir, v.arquivo), pedido.trim()), titulo: `QA · Aplicando mudança no planejamento (${v.subtarefa})`,
      ferramentas: qa.FERRAMENTAS_PLANO, extras: ['--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }), '--add-dir', dir],
      aoMudar: () => { s.render(); if (!maestro.rodando(dir)) qa.verificarPlano(dir, t.chave, (rota) => jira.api(s.secrets, t.site, rota)).then(s.render); } });
    if (ok) qa.mudar(dir, { fase: 'alterando', pedido: pedido.trim() });
    s.render();
  },
  // Publicar: comentário com o resultado na subtarefa de QA + evidências da última execução de cada cenário (anexos).
  async qaPublicar() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    const dir = s.pastaAba(t.id), sub = qa.estado(dir).subtarefa, r = qa.cenarios(dir);
    const feitos = r.cenarios.filter((c) => !c.arquivado && qa.RESULTADOS.includes(c.status));
    if (!sub || !feitos.length) return;
    const arqs = feitos.flatMap((c) => qa.arquivosDe(dir, c.execucoes.at(-1)).map((f) => [c.id, f]));
    const ok = await vscode.window.showWarningMessage(`Publicar no ${sub}: comentário com ${feitos.length} cenário(s) e ${arqs.length} evidência(s) anexada(s)?`, { modal: true }, 'Publicar');
    if (ok !== 'Publicar') return;
    const ROT = { passou: '✅ Passou', falhou: '❌ Falhou', bloqueado: '⛔ Bloqueado' };
    const md = [`**Resultado do QA · plano v${r.planoVersao}** (Crafting Table)`, '', '| Cenário | Resultado | Observação |', '| --- | --- | --- |',
      ...feitos.map((c) => `| ${c.id} · ${c.titulo.replace(/\|/g, '/')} | ${ROT[c.status]} | ${(c.execucoes.at(-1)?.nota || '').replace(/\|/g, '/')} |`)].join('\n');
    try {
      await jira.comentar(s.secrets, { key: sub, site: t.site }, md);
      if (arqs.length) await jira.anexar(s.secrets, t.site, sub, arqs.map(([id, f]) => ({ arquivo: f, nome: `${id}-${path.basename(f)}` })));
      aoVivo.anotar(dir, { tipo: 'fim', texto: `Publicado no ${sub}: resultado de ${feitos.length} cenário(s) e ${arqs.length} evidência(s)` });
    } catch (e) { aoVivo.anotar(dir, { tipo: 'erro', texto: `Não consegui publicar no Jira: ${e.message}` }); }
    s.render();
  },
  qaMassaEstado({ id, op }) { const t = s.ticketAberto(); try { if (t && typeof id === 'string') qa.massaEstado(s.pastaAba(t.id), id, op); } catch (e) { vscode.window.showErrorMessage(e.message); } s.render(); },
  qaMassaEditar() {
    const t = s.ticketAberto();
    if (!t) return;
    const arq = path.join(s.pastaAba(t.id), qa.MASSA);
    if (!fs.existsSync(arq)) { fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, JSON.stringify({ itens: [] }, null, 2)); }
    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(arq));
  },
  // Criar planejamento: jira-qa-planner em segundo plano; ao terminar, confere de novo.
  qaCriarPlano() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    const dir = s.pastaAba(t.id);
    const ok = maestro.rodar(dir, { prompt: qa.promptCriar(t.link), titulo: 'QA · Criando o planejamento (jira-qa-planner)', ferramentas: qa.FERRAMENTAS_PLANO,
      extras: ['--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } })],
      aoMudar: () => { s.render(); if (!maestro.rodando(dir)) acoes(s).qaPlay(); } });
    if (ok) qa.mudar(dir, { fase: 'criando' });
    s.render();
  },
  qaRefazer({ id }) { const t = s.ticketAberto(); if (t && typeof id === 'string') qa.refazer(s.pastaAba(t.id), id); },
  qaParar() { const t = s.ticketAberto(); if (t) { qa.pausar(s.pastaAba(t.id)); s.render(); } },
});

module.exports = { acoes, botaoPlay, caixaAmbiente };
