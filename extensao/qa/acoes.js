// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const qa = require('./qa');
const canaisLog = new Map(); // arquivo de log -> OutputChannel
const maestro = require('../painel/maestro');
const { areaIA } = require('../infra/area-ia');
const aoVivo = require('../componentes/ao-vivo');
const sessao = require('../infra/sessao');
const { IC } = require('../componentes/icones');
const { cfg } = require('../configuracao/configuracao');
const { NOTIF } = require('../painel/notificacoes');
const jira = require('../infra/ticket').jira;
const EVID = 'claudeAbas.evidencias'; // mesma id da seção Evidências (moldura.js)

// Subtarefas do ticket (com a descrição em Markdown) pelo provedor: é onde o QA procura o planejamento.
const filhosDe = (s, t) => (chave) => jira.filhos(s.secrets, { key: chave === t.chave ? jira.alvo(t).key : chave, site: t.site });

// Publicação do plano local no provedor (qa.publicarPlano): subtarefa [QA] nova ou atualizada; sem subtarefas, comentário no ticket.
const depsPublicar = (s, t) => {
  const alvo = { key: t.chave, site: t.site };
  return { chave: t.chave, filhos: filhosDe(s, t), subtarefas: jira.capacidades.subtarefas !== false,
    criarSubtarefa: (o) => jira.criarSubtarefa(s.secrets, alvo, o),
    atualizarDescricao: (key, md) => jira.atualizarDescricao(s.secrets, alvo, key, md),
    comentar: (md) => jira.comentar(s.secrets, alvo, md) };
};

// Roda a IA em segundo plano sobre o plano local: grava o contexto do ticket (via provedor), roda o Claude (só leitura local + o qa-plano.md)
// e, ao terminar, a extensão publica e procura o plano de novo. Devolve se a IA começou.
// A IA escreve o plano na área dela (infra/area-ia.js: o Claude Code nega escrita em ~/.claude) e a extensão o copia para dir.
// prompt(rasc): monta o prompt com a pasta onde a IA grava.
async function gerarPlano(s, t, dir, { prompt, titulo, mudanca = false }) {
  const rasc = areaIA(dir), noRasc = path.join(rasc, qa.PLANO_LOCAL), noDir = path.join(dir, qa.PLANO_LOCAL);
  const ler = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  try {
    const j = s.cacheJira[t.id] && !s.cacheJira[t.id].erro ? s.cacheJira[t.id] : await jira.buscar(s.secrets, { key: t.chave, site: t.site });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, qa.CONTEXTO), qa.contextoTicket(j));
    fs.mkdirSync(rasc, { recursive: true });
    if (mudanca && fs.existsSync(noDir)) fs.copyFileSync(noDir, noRasc); else fs.rmSync(noRasc, { force: true });
  } catch (e) {
    vivo('erro', `Não consegui ler o ticket no ${jira.nome}: ${e.message}`);
    qa.mudar(dir, { fase: 'erro', erro: e.message });
    return false;
  }
  const antes = ler(noRasc);
  let tratou = false;
  return maestro.rodar(dir, { prompt: prompt(rasc), titulo, ferramentas: qa.FERRAMENTAS_PLANO,
    extras: ['--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }), '--add-dir', dir, rasc, ...(cfg().get('modelo') ? ['--model', cfg().get('modelo')] : [])],
    aoMudar: () => {
      s.render();
      if (maestro.rodando(dir) || tratou) return;
      tratou = true; // publica uma vez só (aoMudar dispara mais de uma vez ao terminar)
      (async () => {
        try {
          const depois = ler(noRasc);
          if (depois === null) throw new Error(`O Claude não gravou ${qa.PLANO_LOCAL}`);
          if (mudanca && depois === antes) throw new Error('O Claude não alterou o plano');
          fs.writeFileSync(noDir, depois);
          vivo('acao', `Publicando o plano no ${jira.nome}`);
          const r = await qa.publicarPlano(dir, depsPublicar(s, t));
          vivo('fim', r.modo === 'criada' ? `Subtarefa ${r.key} criada com o plano` : r.modo === 'atualizada' ? `Descrição de ${r.key} atualizada com o plano` : `Plano publicado como comentário no ${r.key} (o ${jira.nome} não tem subtarefas)`);
        } catch (e) {
          vivo('erro', `Plano não publicado: ${e.message}`);
          qa.mudar(dir, { fase: 'erro', erro: e.message });
          return s.render();
        }
        await qa.verificarPlano(dir, t.chave, filhosDe(s, t));
        s.render();
      })();
    } });
}

const depsQa = (s, t) => {
  const dir = s.pastaAba(t.id), emu = require('../modulos/emulador');
  return {
    chave: t.chave, backend: s.reposDe(t).find((r) => r.camada === 'backend')?.caminho, filhos: filhosDe(s, t),
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
// Nada rodando: sem emulador e sem nenhum Comando (API, Metro) ligado.
const nadaRodando = () => { try { return !require('../modulos/emulador').emuladorRodando() && !(require('../modulos/comandos').api?.lista() || []).some((c) => c.rodando); } catch { return false; } };
const caixaAmbiente = (dir, acao) => {
  const amb = qa.statusAmbiente(dir);
  return !amb ? '' : amb.tipo === 'preparando'
    ? `<button class="ct-amb" ${acao}="qaAmbLog" title="Preparando API, Metro, emulador e app: clique para ver o log ao vivo"><span class="ct-luz prep"></span>Preparando ambiente</button>`
    : amb.tipo === 'erro'
      ? `<button class="ct-amb" ${acao}="${amb.analisando ? 'qaAmbLog' : 'qaAmbErro'}" title="${amb.analisando ? 'O Claude está analisando o erro: clique para ver o log ao vivo' : 'Ver o erro e a análise do Claude'}"><span class="ct-luz erro ${amb.nova || amb.analisando ? 'pisca' : ''}"></span>Ambiente parou${amb.analisando ? ' · analisando' : ''}${amb.nova ? '<span class="ct-badge ct-badge-erro">1</span>' : ''}</button>`
      : nadaRodando()
        ? `<button class="ct-amb" ${acao}="qaAmbLog" title="Nada rodando (API, Metro, emulador): clique para ver o log"><span class="ct-luz erro"></span>Ambiente</button>`
        : `<button class="ct-amb" ${acao}="qaAmbLog" title="Ambiente pronto: clique para ver o log"><span class="ct-luz ok"></span>Ambiente</button>`;
};

// Contrato: `acoes(servicos)` devolve { nome: handler }; o painel espalha no seu `acoes`. Sem `this`: chamadas entre handlers refazem o objeto.
// Pedir ajuste / Excluir (card do cenário): pede o motivo, marca "não executado por decisão do usuário" e registra na aba Decisões.
// Pedir ajuste só marca e guarda o motivo (não aciona o Claude; para ele aplicar a mudança use "Pedir ajuste" do planejamento, qaPlanoMudar).
async function dispensarCenario(s, id, tipo) {
  const t = s.ticketAberto();
  if (!t || typeof id !== 'string') return;
  const ajuste = tipo === 'ajuste', dir = s.pastaAba(t.id);
  const motivo = await vscode.window.showInputBox({ title: `${ajuste ? 'Pedir ajuste do' : 'Excluir o'} cenário ${id}`, prompt: 'Motivo (obrigatório): o cenário deixa de ser executado por decisão sua', ignoreFocusOut: true, validateInput: (v) => (v.trim() ? null : 'Informe o motivo') });
  if (!motivo?.trim() || !qa.dispensar(dir, id, motivo, tipo)) return;
  aoVivo.registrarDecisao(dir, { texto: `${ajuste ? 'Ajuste pedido' : 'Cenário excluído'}: ${id} não será executado`, detalhe: motivo.trim(), etapa: 'QA' });
  s.render();
}
const acoes = (s) => ({
  // ▶ do QA: abre Evidências (Ao vivo) e confere o planejamento no Jira (qa.js). Sem plano, o cartão bloqueia e oferece criar.
  // ▶ do QA: só procura o planejamento (Ao vivo em Evidências). Executar é o Dar início do cartão.
  async qaPlay() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    s.pedirSecao(EVID);
    if (qa.estado(s.pastaAba(t.id)).fase === 'plano_aprovado') return acoes(s).qaIniciar(); // plano já aprovado: ▶ continua/retoma, igual ao botão do cartão
    await qa.verificarPlano(s.pastaAba(t.id), t.chave, filhosDe(s, t));
    s.render();
  },
  // Dar início / Retomar: sobe o ambiente, confere a massa e executa os cenários da fila, um claude -p por cenário (qa.executar).
  async qaIniciar() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    qa.registrarDecisao(s.pastaAba(t.id), qa.estado(s.pastaAba(t.id)).execucao === 'pausado' ? 'Usuário retomou os testes' : 'Usuário iniciou os testes', { ticket: t.chave });
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
  qaAmbLog() { // canaisLog: um canal e um watch por log
    const t = s.ticketAberto();
    if (!t) return;
    const dir = s.pastaAba(t.id), a = qa.ambiente(dir), cmds = require('../modulos/comandos').api;
    for (const nome of a?.terminais || []) { const b = cmds?.lista().find((x) => x.nome === nome); if (b?.rodando) cmds?.acao({ acao: 'mostrar', id: b.id }); }
    // Output channel (sem terminal): despeja o .ambiente.log e segue acompanhando o que o preparo gravar.
    const f = path.join(dir, qa.LOG_AMB);
    if (canaisLog.has(f)) return canaisLog.get(f).show(true); // já aberto: só mostra (o watch segue gravando)
    const ch = vscode.window.createOutputChannel(`QA ${t.chave} · log do ambiente`);
    canaisLog.set(f, ch);
    let lido = 0;
    const ler = () => { try { const b = fs.readFileSync(f); if (b.length < lido) lido = 0; ch.append(b.subarray(lido).toString('utf8')); lido = b.length; } catch { /* log ainda não existe */ } };
    ler(); fs.watchFile(f, { interval: 700 }, ler); // ponytail: o watch vive até a janela fechar; um por clique
    ch.show(true);
  },
  qaPlanoAbrir() {
    const t = s.ticketAberto(), v = t && qa.versaoAtual(s.pastaAba(t.id));
    if (!v) return;
    qa.mudar(s.pastaAba(t.id), { lido: v.v }); // libera o Aprovar: só depois de ler
    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path.join(s.pastaAba(t.id), v.arquivo)));
    s.render();
  },
  qaPlanoMencionar() { const t = s.ticketAberto(), v = t && qa.versaoAtual(s.pastaAba(t.id)); if (v) require('../infra/claude').mencionar(`@${path.join(s.pastaAba(t.id), v.arquivo)}`); },
  qaPlanoAprovar() { const t = s.ticketAberto(); if (t) { if (qa.aprovar(s.pastaAba(t.id))) qa.registrarDecisao(s.pastaAba(t.id), 'Usuário aprovou o planejamento', { ticket: t.chave }); s.render(); } },
  // Pedir mudança: o Claude edita o qa-plano.md local e a extensão republica no provedor; ao terminar, a versão nova volta para aprovação.
  async qaPlanoMudar() {
    const t = s.ticketAberto();
    if (!t) return;
    const dir = s.pastaAba(t.id), v = qa.versaoAtual(dir);
    if (!v) return;
    const pedido = await vscode.window.showInputBox({ title: `Mudança no planejamento ${v.subtarefa} · v${v.v}`, prompt: `O Claude edita o plano, a Crafting Table republica no ${jira.nome} e gera a versão nova para você aprovar`, ignoreFocusOut: true });
    if (!pedido?.trim()) return;
    qa.registrarDecisao(dir, 'Usuário pediu ajuste no planejamento', { ticket: t.chave, pedido: pedido.trim() });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, qa.PLANO_LOCAL), qa.mdDaVersao(dir, v)); // a IA edita o arquivo local; a extensão republica
    const ok = await gerarPlano(s, t, dir, { prompt: (rasc) => qa.promptMudanca(dir, pedido.trim(), rasc), titulo: `QA · Aplicando mudança no planejamento (${v.subtarefa})`, mudanca: true });
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
    if (!qa.podePublicar(r.cenarios)) return vscode.window.showWarningMessage('Só é possível publicar quando todos os cenários estiverem com resultado OK (passou).');
    const arqs = feitos.flatMap((c) => qa.arquivosDe(dir, c.execucoes.at(-1)).map((f) => [c.id, f]));
    const ok = await vscode.window.showWarningMessage(`Publicar no ${sub}: comentário com ${feitos.length} cenário(s) e ${arqs.length} evidência(s) anexada(s)?`, { modal: true }, 'Publicar');
    if (ok !== 'Publicar') return;
    qa.registrarDecisao(dir, `Usuário publicou o resultado no ${sub}`, { ticket: t.chave });
    const ROT = { passou: '✅ Passou', falhou: '❌ Falhou', bloqueado: '⛔ Bloqueado' };
    const md = [`**Resultado do QA · plano v${r.planoVersao}** (Crafting Table)`, '', '| Cenário | Resultado | Observação |', '| --- | --- | --- |',
      ...feitos.map((c) => `| ${c.id} · ${c.titulo.replace(/\|/g, '/')} | ${ROT[c.status]} | ${(c.execucoes.at(-1)?.nota || '').replace(/\|/g, '/')} |`)].join('\n');
    try {
      await jira.comentar(s.secrets, { key: sub, site: t.site }, md);
      if (arqs.length) await jira.anexar(s.secrets, t.site, sub, arqs.map(([id, f]) => ({ arquivo: f, nome: `${id}-${path.basename(f)}` })));
      aoVivo.anotar(dir, { tipo: 'fim', texto: `Publicado no ${sub}: resultado de ${feitos.length} cenário(s) e ${arqs.length} evidência(s)` });
    } catch (e) { aoVivo.anotar(dir, { tipo: 'erro', texto: `Não consegui publicar no ${jira.nome}: ${e.message}` }); }
    s.render();
  },
  qaMassaEstado({ id, op }) { const t = s.ticketAberto(); try { if (t && typeof id === 'string') qa.massaEstado(s.pastaAba(t.id), id, op); } catch (e) { vscode.window.showErrorMessage(e.message); } s.render(); },
  async qaMassaCopiar({ id, key }) {
    const t = s.ticketAberto(), i = t && qa.massa(s.pastaAba(t.id)).itens.find((x) => x.id === id);
    if (!i || !(key in (i.dados || {}))) return;
    const v = i.dados[key];
    await vscode.env.clipboard.writeText(typeof v === 'object' ? JSON.stringify(v) : String(v));
    vscode.window.setStatusBarMessage(`${key} copiado`, 2000);
  },
  qaMassaEditar() {
    const t = s.ticketAberto();
    if (!t) return;
    const arq = path.join(s.pastaAba(t.id), qa.MASSA);
    if (!fs.existsSync(arq)) { fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, JSON.stringify({ itens: [] }, null, 2)); }
    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(arq));
  },
  // Criar planejamento: a IA escreve qa-plano.md em segundo plano; a extensão publica no provedor e confere de novo.
  async qaCriarPlano() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    const dir = s.pastaAba(t.id);
    fs.rmSync(path.join(dir, qa.PLANO_LOCAL), { force: true });
    const ok = await gerarPlano(s, t, dir, { prompt: (rasc) => qa.promptCriar(dir, rasc), titulo: 'QA · Criando o planejamento' });
    if (ok) qa.mudar(dir, { fase: 'criando' });
    s.render();
  },
  // Pedir ajuste / Excluir (card do cenário): pede o motivo, marca "não executado por decisão do usuário" e registra na aba Decisões.
  // Pedir ajuste só marca e guarda o motivo (não aciona o Claude; para ele aplicar a mudança use "Pedir ajuste" do planejamento, qaPlanoMudar).
  qaCenarioAjuste({ id }) { return dispensarCenario(s, id, 'ajuste'); },
  qaCenarioExcluir({ id }) { return dispensarCenario(s, id, 'excluir'); },
  qaRefazer({ id }) { const t = s.ticketAberto(); if (t && typeof id === 'string') qa.refazer(s.pastaAba(t.id), id); },
  qaParar() { const t = s.ticketAberto(); if (t) { qa.registrarDecisao(s.pastaAba(t.id), 'Usuário pausou os testes', { ticket: t.chave }); qa.pausar(s.pastaAba(t.id)); s.render(); } },
});

module.exports = { acoes, botaoPlay, caixaAmbiente, nadaRodando };
