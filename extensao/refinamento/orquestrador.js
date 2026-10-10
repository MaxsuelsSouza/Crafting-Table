// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jira = require('../infra/ticket').jira;
const tickets = require('../infra/tickets');
const maestro = require('../painel/maestro');
const mudancas = require('./mudancas');
const { NIVEL } = mudancas;
const { cfg, reposAuto, SPECS_PADRAO, pluginInstalado, sddState } = require('../configuracao/configuracao');
const { notificar } = require('../painel/notificacoes');
const { dirSpec, ondeSalvar, TAREFAS, IMPACTOS, duvidasDe, tarefasDe, impactosDe, ticketDe, estadoSpec } = require('./locais');

// ORQUESTRADOR do refinamento: o Maestro dirigido pela extensão. Monta cada execução do Claude em segundo plano (etapa),
// decide a próxima (seguir, filas de triagem/impacto/tarefas) e vigia comentários novos no Jira. O painel só chama a interface
// exportada; o estado mutável (alterando, respondidas, vigiando) mora aqui. `s` = servicos do painel (iniciar() recebe).
const pasta = (id) => tickets.pasta(id);
/** @type {any} */
let s;

// ── Maestro: o Claude em segundo plano (maestro.js), uma execução por etapa. A extensão decide quando rodar:
// Dar início/▶, aprovação (execução nova: contexto limpo), respostas e ajuste (mesma sessão). Pausado não roda.
const binsSdd = () => [sddState(), path.join(os.homedir(), '.claude', 'plugins-locais', 'crafting', 'plugins', 'sdd', 'bin', 'sdd-state')].filter(Boolean);
// Plugin "mapa" (mapeamento do código do passo 3): mora na extensão e só o maestro carrega (--plugin-dir).
const MAPA = path.join(__dirname, '..', 'plugins', 'mapa');
const FOCO = path.join(__dirname, '..', 'plugins', 'foco'); // texto curto em tudo que o Claude escreve (regras + medição dos .md)
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
    cwd, continuar, titulo, ferramentas: FERRAMENTAS(), env: bd, aoMudar: () => { s.render(); depoisDaEtapa(t); },
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
    if (mudou) s.gravar(t.chave, TAREFAS, l);
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
        .then((b) => { if (b) { s.abrirAba(t.chave, 'spec'); } });
    }
  }
  if (mudou) s.gravar(t.chave, IMPACTOS, l);
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
  s.gravar(t.chave, IMPACTOS, l);
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
  s.gravar(t.chave, IMPACTOS, l);
  etapa(ticketDe(t.chave), `[impacto] Comentário novo no ticket ${t.chave}. Siga a seção "Mudança vinda de comentário do Jira" da skill sdd: SÓ ANÁLISE, não edite a spec nem os cards.\n`
    + `id: ${i.id} · autor: ${i.autor} · data: ${i.data} · link: ${i.link}\nTexto:\n${i.texto}`, false, undefined, `Analisando comentário de ${i.autor}`);
};
// Vigia: comentários de outras pessoas nos tickets com spec. Na primeira vez só marca o que já existe como visto.
let vigiando = false;
const vigiarComentarios = async () => {
  if (vigiando || !(await s.secrets.get('jira.token'))) return;
  vigiando = true;
  try {
    for (const t0 of tickets.listar().filter((x) => x.spec?.dir)) {
      let cs, eu;
      try { [cs, eu] = await Promise.all([jira.comentarios(s.secrets, { key: t0.chave, site: t0.site }), jira.eu(s.secrets, t0.site)]); } catch { continue; }
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
      s.gravar(t.chave, IMPACTOS, l);
      tickets.gravar({ ...tickets.ler(t.chave), vigiaComentarios: { ...v, vistos: [...new Set([...v.vistos, ...novos.map((c) => c.id)])] } });
      filaTriagem(t);
      filaImpactos(t);
    }
  } finally { vigiando = false; }
};
// Pedidos de alteração esperando: uma execução só para todos (mesma sessão do passo 4).
const filaTarefas = (t) => {
  if (maestro.rodando(pasta(t.chave))) return;
  const l = tarefasDe(pasta(t.chave)), fila = l.filter((c) => c.status === 'em_alteracao' && c.fila);
  if (!fila.length) return;
  fila.forEach((c) => { c.fila = false; alterando.add(c.id); });
  s.gravar(t.chave, TAREFAS, l);
  etapa(t, `Pedidos de alteração nos cards da aba Tarefas: ${fila.map((c) => `${c.id}: "${c.alteracao}"`).join('; ')}. `
    + 'Para cada tNN: ajuste a linha em tasks.md e o card com sdd-state card editar <id> (só os campos que mudam). '
    + 'Para o card qa: ajuste testes.md (plano de testes) e rode sdd-state card editar qa (com --estimativa/--resumo se mudarem). '
    + 'Não mexa em outras tarefas, não conclua nem inicie passos.', true, undefined, `Alterando ${fila.map((c) => c.id).join(', ')}`);
};
const estadoDe = (chave) => tickets.ler(chave)?.refinamento?.estado;
// Rodando e sem nada esperando o humano → próxima etapa numa execução nova (true se começou).
// Passo 6: o método do plugin fcx-qa-test-planning (jira-qa-planner + test-estimation), lido do plugin instalado.
const qaCaminhos = () => {
  const qa = pluginInstalado('fcx-qa-test-planning@');
  if (!qa) return ' Plugin fcx-qa-test-planning não instalado: siga as regras do passo 6 da skill sdd sem ele.';
  return ` Método de QA: ${path.join(qa, 'skills', 'jira-qa-planner', 'SKILL.md')} (Passos 3, 6 e 7) e ${path.join(qa, 'skills', 'jira-qa-planner', 'reference', 'test-plan-templates.md')};`
    + ` estimativa: ${path.join(qa, 'skills', 'test-estimation', 'reference', 'modelo-estimativa.md')} (modo detalhado). Não use twg nem Jira: o card [QA] é criado no Jira pela extensão.`;
};
// O que o refinamento espera de você agora (null = nada: o Claude pode seguir).
const esperaHumano = (est) => (est.perguntas.some((q) => q.status === 'aberta') ? 'perguntas'
  : est.passos.some((p) => p.status === 'aguardando_revisao') ? 'revisao' : null);
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
const respondidas = []; // respostas ainda não entregues ao Claude
const sdd = (args) => new Promise((ok) => (sddState() ? require('child_process').execFile(sddState(), args, (e, out, err) => {
  if (e) vscode.window.showErrorMessage(String(err || e.message).replace(/^sdd-state: /, ''));
  ok(!e);
}) : ok(false)));

// Liga o vigia: uma olhada 20 s depois de abrir e a cada 5 min; o dispose para o relógio. ctx = ExtensionContext.
const iniciar = (servicos, ctx) => {
  s = servicos;
  const relogio = setInterval(vigiarComentarios, 5 * 60 * 1000);
  setTimeout(vigiarComentarios, 20000);
  ctx.subscriptions?.push({ dispose: () => clearInterval(relogio) });
};

module.exports = { iniciar, etapa, seguir, filaTarefas, vigiarComentarios, respondidas, sdd, estadoDe, reposDe, avisarImpactos };
