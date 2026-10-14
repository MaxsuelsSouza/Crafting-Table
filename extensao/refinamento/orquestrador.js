// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jira = require('../infra/ticket').jira;
const tickets = require('../infra/tickets');
const { areaIA } = require('../infra/area-ia');
const maestro = require('../painel/maestro');
const mudancas = require('./mudancas');
const { NIVEL } = mudancas;
const { cfg, reposAuto, SPECS_PADRAO, sddState } = require('../configuracao/configuracao');
const vagas = require('../agentes/etapas');
const { notificar } = require('../painel/notificacoes');
const { anotar } = require('../componentes/ao-vivo');
const { dirSpec, ondeSalvar, arquivoPasso, HANDOFF, TAREFAS, IMPACTOS, duvidasDe, tarefasDe, impactosDe, ticketDe, estadoSpec } = require('./locais');

// ORQUESTRADOR do refinamento: o Maestro dirigido pela extensão. Monta cada execução do Claude em segundo plano (etapa),
// decide a próxima (seguir, filas de triagem/impacto/tarefas) e vigia comentários novos na ferramenta de tickets. O painel só chama a interface
// exportada; o estado mutável (alterando, respondidas, vigiando) mora aqui. `s` = servicos do painel (iniciar() recebe).
const pasta = (id) => tickets.pasta(id);
/** @type {any} */
let s;

// ── Maestro: o Claude em segundo plano (maestro.js), uma execução por etapa. A extensão decide quando rodar:
// Dar início/▶, aprovação (execução nova: contexto limpo), respostas e ajuste (também execução nova, com a memória do passo em disco). Pausado não roda.
const binsSdd = () => [sddState(), path.join(os.homedir(), '.claude', 'plugins-locais', 'crafting', 'plugins', 'sdd', 'bin', 'sdd-state')].filter(Boolean);
// Plugins de cada etapa (Configurações > Plugins, agentes/etapas.js). Padrão: "mapa" (mapeamento do código do passo 3) e "foco" (texto curto
// em tudo que o Claude escreve: regras + medição dos .md) moram na extensão e só o maestro carrega (--plugin-dir).
const MAPA = () => vagas.raiz('refinamento.mapa') || '';
const FERRAMENTAS = () => [...binsSdd().map((b) => `Bash(${b}:*)`), `Bash(${MAPA()}/bin/mapa-git:*)`, `Bash(${MAPA()}/bin/mapa-conferir:*)`,
  `Bash(${MAPA()}/bin/mapa-db:*)`, 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill',
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
// Ticket por documento: o documento é o ticket. Grava o contexto (descrição, subtarefas, comentários, caminho do original) na pasta do
// ticket, de forma síncrona, e devolve o bloco do prompt. Ticket do Jira: ''.
const CONTEXTO = '.contexto-ticket.md';
const blocoDocumento = (t) => {
  if (!jira.ehDocumento(t)) return '';
  const d = pasta(t.chave), ctx = require('../infra/contexto');
  const doc = tickets.ler(t.chave)?.documento || t.documento || {};
  let arq = path.join(d, CONTEXTO);
  try {
    const regravar = () => { try { ctx.gravarContexto(d, CONTEXTO, require('../provedores/documento').buscarSync({ key: t.chave }), tickets.ler(t.chave) || t); } catch { /* pasta sumiu */ } };
    regravar();
    ctx.prepararDocumento(tickets.ler(t.chave) || t).then(regravar, () => {}); // extração (docx/pdf) assíncrona: o contexto é regravado com o texto
  } catch { /* sem contexto: o prompt ainda aponta o original */ }
  return `\nTicket por documento (sem ferramenta de gestão). Contexto do ticket: ${arq}. Documento original: ${doc.arquivo ? path.join(d, doc.arquivo) : '(sem arquivo)'} `
    + '(imagem e PDF: leia com Read; se houver páginas em .documento-paginas/, leia as imagens). Trate este contexto como o ticket: o passo 1 usa como insumo; não use ferramenta de tickets.';
};
const etapa = (t, texto, continuar = false, cwd = t.spec?.repo, titulo, depois) => {
  const repos = reposDe(t);
  const bd = bancoEnv(t);
  fs.mkdirSync(areaIA(pasta(t.chave)), { recursive: true }); // memória do passo: ~/.claude é negada para escrita no claude -p
  return maestro.rodar(pasta(t.chave), {
    cwd, continuar, titulo, ferramentas: FERRAMENTAS(), env: bd, aoMudar: () => { if (depois && !maestro.rodando(pasta(t.chave))) depois(); s.render(); depoisDaEtapa(t); },
    // O foco substitui o i-have-adhd global nestas execuções (as regras não entram duas vezes).
    extras: [...(cfg().get('modelo') ? ['--model', cfg().get('modelo')] : []), ...(cfg().get('esforco') ? ['--effort', cfg().get('esforco')] : []),
      ...vagas.pluginDirs('refinamento.foco'), ...vagas.pluginDirs('refinamento.mapa'), '--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }), '--add-dir', pasta(t.chave), areaIA(pasta(t.chave)), ...repos.map((r) => r.caminho)],
    prompt: `[segundo plano] [Crafting Table · ticket ${t.chave}] ${texto}\nPasta do ticket: ${pasta(t.chave)} · sdd-state: ${sddState()}`
      + ondeSalvar(t) + blocoDocumento(t)
      + `\nRepositórios de código: ${repos.map((r) => `${r.camada}: ${r.caminho}${r.refRelease ? ` (ref de release: ${r.refRelease})` : ''}`).join(' · ') || 'nenhum configurado'}`
      + ` · plugin mapa: ${MAPA()} (bin/mapa-git, bin/mapa-conferir, bin/mapa-db)`
      + vagas.aviso('refinamento.sdd') + vagas.aviso('refinamento.mapa')
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
  etapa(ticketDe(t.chave), `[triagem] Comentário novo no ticket ${t.chave}: resposta, mudança ou ruído? Siga a seção "Triagem de comentário novo do ticket" da skill sdd.\n`
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
  etapa(ticketDe(t.chave), `[impacto] Comentário novo no ticket ${t.chave}. Siga a seção "Mudança vinda de comentário do ticket" da skill sdd: SÓ ANÁLISE, não edite a spec nem os cards.\n`
    + `id: ${i.id} · autor: ${i.autor} · data: ${i.data} · link: ${i.link}\nTexto:\n${i.texto}`, false, undefined, `Analisando comentário de ${i.autor}`);
};
// Vigia: comentários de outras pessoas nos tickets com spec. Na primeira vez só marca o que já existe como visto.
let vigiando = false;
const vigiarComentarios = async () => {
  if (vigiando) return;
  const conectado = await jira.conectado(s.secrets).catch(() => false); // ticket-documento é local: vigia sem conta
  vigiando = true;
  try {
    for (const t0 of tickets.listar().filter((x) => x.spec?.dir && (conectado || jira.ehDocumento(x)))) {
      let cs, eu;
      try { [cs, eu] = await Promise.all([jira.comentarios(s.secrets, jira.alvo(t0)), jira.eu(s.secrets, t0.site)]); } catch { continue; }
      const t = tickets.ler(t0.chave);
      let v = t.vigiaComentarios;
      if (!v) {
        // Ticket-documento: o que já estava no contexto entregue à IA (.contexto-ticket.md) é visto; o colado depois é novo.
        const doc = jira.ehDocumento(t);
        let base = Date.now();
        if (doc) { try { base = fs.statSync(path.join(pasta(t.chave), CONTEXTO)).mtimeMs; } catch { /* sem contexto */ } }
        v = { desde: new Date(base).toISOString(), vistos: cs.filter((c) => Date.parse(c.data) <= base).map((c) => c.id) };
        tickets.gravar({ ...t, vigiaComentarios: v });
        if (!doc) continue;
      }
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
// Pedidos de alteração esperando: uma execução só para todos.
const filaTarefas = (t) => {
  if (maestro.rodando(pasta(t.chave))) return;
  const l = tarefasDe(pasta(t.chave)), fila = l.filter((c) => c.status === 'em_alteracao' && c.fila);
  if (!fila.length) return;
  fila.forEach((c) => { c.fila = false; alterando.add(c.id); });
  s.gravar(t.chave, TAREFAS, l);
  etapa(t, `Pedidos de alteração nos cards da aba Tarefas: ${fila.map((c) => `${c.id}: "${c.alteracao}"`).join('; ')}. `
    + 'Para cada tNN: ajuste a linha em tasks.md e o card com sdd-state card editar <id> (só os campos que mudam). '
    + 'Para o card qa: ajuste testes.md (plano de testes) e rode sdd-state card editar qa (com --estimativa/--resumo se mudarem). '
    + 'Não mexa em outras tarefas, não conclua nem inicie passos.', false, undefined, `Alterando ${fila.map((c) => c.id).join(', ')}`);
};
const estadoDe = (chave) => tickets.ler(chave)?.refinamento?.estado;
// Rodando e sem nada esperando o humano → próxima etapa numa execução nova (true se começou).
// Passo 6: o método de QA da vaga refinamento.metodoQa (padrão: plugin fcx-qa-test-planning, jira-qa-planner + test-estimation), lido do plugin instalado.
const qaCaminhos = () => {
  const qa = vagas.raiz('refinamento.metodoQa'), nome = vagas.rotulo('refinamento.metodoQa');
  if (!qa) return ` Plugin ${nome} não instalado: siga as regras do passo 6 da skill sdd sem ele.`;
  const fim = ' Não use twg nem a ferramenta de tickets: o card [QA] é criado pela extensão.';
  if (!vagas.ehPadrao('refinamento.metodoQa')) return ` Método de QA: skill ${nome} (${vagas.pastaSkill('refinamento.metodoQa')}/SKILL.md e as referências dela).${fim}`;
  return ` Método de QA: ${path.join(qa, 'skills', 'jira-qa-planner', 'SKILL.md')} (Passos 3, 6 e 7) e ${path.join(qa, 'skills', 'jira-qa-planner', 'reference', 'test-plan-templates.md')};`
    + ` estimativa: ${path.join(qa, 'skills', 'test-estimation', 'reference', 'modelo-estimativa.md')} (modo detalhado).${fim}`;
};
// O que o refinamento espera de você agora (null = nada: o Claude pode seguir).
const esperaHumano = (est) => (est.perguntas.some((q) => q.status === 'aberta') ? 'perguntas'
  : est.passos.some((p) => p.status === 'aguardando_revisao') ? 'revisao' : null);
const seguir = (t) => {
  const est = estadoSpec(t);
  if (!est || estadoDe(t.chave) !== 'rodando' || maestro.rodando(pasta(t.chave)) || esperaHumano(est) || duvidasDe(pasta(t.chave)).some((x) => !x.resposta) || mudancas.pendentes(impactosDe(pasta(t.chave))).length || est.proximoPasso > 6) return false;
  const novas = respondidas.splice(0).join('; ');
  const reprovadas = est.proximoPasso === 5 ? tarefasDe(pasta(t.chave)).filter((c) => c.status === 'reprovada') : [];
  const n = est.proximoPasso, titulo = est.passos[n].titulo;
  const extra = (novas ? ` Respostas do humano desde a última execução: ${novas}.` : '')
    + (reprovadas.length ? ` Tarefas reprovadas pelo humano (considere na análise de cobertura): ${reprovadas.map((c) => `${c.id}${c.motivo ? ` (${c.motivo})` : ''}`).join('; ')}.` : '');
  if (n === 3) return seguirPlano(t, titulo, extra);
  return etapa(t, `Siga a skill sdd, protocolo de retomada, sem perguntar: rode status e trabalhe só o passo ${n} (${titulo}).`
    + (n === 6 ? qaCaminhos() : '') + extra + pedirMemoria(t, n, false), false, undefined, `Passo ${n} · ${titulo}`);
};

// ── Passo 3 em duas subetapas, cada uma numa execução nova que só conta com o que a anterior deixou em disco:
// 3.1 Mapeamento do código (grava mapa-backend.md/mapa-mobile.md na pasta da spec, sem plan.md e sem concluir) e
// 3.2 Plano técnico (lê os mapas, escreve plan.md e roda concluir 3). Estado em .ticket.json › refinamento.sub3 = { mapa, plano }:
// 'pendente' | 'rodando' | 'concluida' | 'erro' | 'pausada' (a IA não grava em ~/.claude; quem grava é a extensão).
const SUBETAPAS3 = [{ id: 'mapa', nome: 'Mapeamento do código' }, { id: 'plano', nome: 'Plano técnico' }];
const mapasDe = (t) => Object.values(HANDOFF).map((f) => path.join(dirSpec(t) || '', f)).filter((f) => dirSpec(t) && fs.existsSync(f));
const sub3De = (chave) => tickets.ler(chave)?.refinamento?.sub3 || {};
const gravarSub3 = (chave, parte) => {
  const x = tickets.ler(chave);
  if (x) tickets.gravar({ ...x, refinamento: { ...x.refinamento, sub3: { ...x.refinamento?.sub3, ...parte } } });
};
// Estados das duas subetapas para a tela (passo = o passo 3 do sdd-state; rodando = o Claude está executando agora).
const subetapas3 = (t, passo, rodando) => {
  const sub = sub3De(t.id || t.chave), feito = ['aguardando_revisao', 'aprovado'].includes(passo?.status);
  const est = (v, fim) => (fim ? 'concluida' : v === 'rodando' && !rodando ? 'pausada' : v || 'pendente');
  return SUBETAPAS3.map((x) => ({ nome: x.nome, estado: est(sub[x.id], feito || (x.id === 'mapa' && sub.mapa === 'concluida')) }));
};
const seguirPlano = (t, titulo, extra) => {
  const sub = sub3De(t.chave), mapas = mapasDe(t);
  if (sub.mapa !== 'concluida') {
    gravarSub3(t.chave, { mapa: 'rodando', plano: 'pendente' });
    const ok = etapa(t, `Siga a skill sdd, protocolo de retomada, sem perguntar. Passo 3 (${titulo}), SUBETAPA 3.1 · MAPEAMENTO DO CÓDIGO. Rode status e, se o passo 3 ainda não estiver em andamento, rode sdd-state iniciar 3. `
      + `Faça SÓ o mapeamento do código com a skill ${vagas.rotulo('refinamento.mapa')} (camadas, ref de leitura): grave mapa-backend.md e/ou mapa-mobile.md na pasta da spec e rode mapa-conferir em cada um até passar. `
      + 'NÃO escreva o plan.md e NÃO rode concluir: outra execução, depois desta, escreve o plano a partir dos mapas. Termine quando os mapas existirem.' + extra,
    false, undefined, `Passo 3.1 · Mapeamento do código`, () => fimMapeamento(t));
    if (!ok) gravarSub3(t.chave, { mapa: sub.mapa || 'pendente' });
    return ok;
  }
  if (!mapas.length) {
    gravarSub3(t.chave, { mapa: 'erro' });
    anotar(pasta(t.chave), { tipo: 'erro', texto: 'Passo 3.2 não começou: o mapeamento (3.1) não deixou mapa-backend.md nem mapa-mobile.md na pasta da spec', detalhe: `Procurei em ${dirSpec(t)}. Continue o refinamento para refazer o mapeamento.` });
    s.render();
    return false;
  }
  gravarSub3(t.chave, { plano: 'rodando' });
  const ok = etapa(t, `Siga a skill sdd, protocolo de retomada, sem perguntar. Passo 3 (${titulo}), SUBETAPA 3.2 · PLANO TÉCNICO. O mapeamento do código (3.1) já foi feito: NÃO o refaça. Leia ${mapas.join(' e ')} e a spec, `
    + 'escreva o plan.md (com "## Mapeamento do código" resumindo os mapas e "## Conformidade com a Constituição") e rode concluir 3. Só consulte o código para tirar uma dúvida pontual.' + extra + pedirMemoria(t, 3, false),
  false, undefined, `Passo 3.2 · Plano técnico`, () => fimPlano(t));
  if (!ok) gravarSub3(t.chave, { plano: 'pendente' });
  return ok;
};
// Terminou a execução do 3.1: mapas em disco → conclui e segue sozinho para o 3.2; senão erro (ou "pausada" se foi a pessoa que parou).
const fimMapeamento = (t) => {
  const pausado = estadoDe(t.chave) !== 'rodando';
  if (mapasDe(t).length) { gravarSub3(t.chave, { mapa: 'concluida' }); seguir(ticketDe(t.chave) || t); return; }
  gravarSub3(t.chave, { mapa: pausado ? 'pausada' : 'erro' });
  if (!pausado) anotar(pasta(t.chave), { tipo: 'erro', texto: 'O mapeamento do código (3.1) terminou sem gravar mapa-backend.md nem mapa-mobile.md na pasta da spec', detalhe: `Pasta da spec: ${dirSpec(t)}. O plano técnico (3.2) só começa com os mapas em disco: continue o refinamento para tentar de novo.` });
};
const fimPlano = (t) => {
  const p = estadoSpec(ticketDe(t.chave) || t)?.passos[3];
  const feito = ['aguardando_revisao', 'aprovado'].includes(p?.status), pausado = estadoDe(t.chave) !== 'rodando';
  gravarSub3(t.chave, { plano: feito ? 'concluida' : pausado ? 'pausada' : 'erro' });
  if (!feito && !pausado) anotar(pasta(t.chave), { tipo: 'erro', texto: 'O plano técnico (3.2) terminou sem concluir o passo 3', detalhe: 'Continue o refinamento ou peça ajuste no passo 3.' });
};
const respondidas = []; // respostas ainda não entregues ao Claude

// ── Memória do passo: cada execução de passo deixa em disco o que a próxima precisa (ajuste e respostas rodam em execução nova, sem --resume).
const memoriaPasso = (t, n) => path.join(areaIA(pasta(t.chave)), `.memoria-passo-${n}.md`);
const pedirMemoria = (t, n, ajuste) => ` Ao terminar, grave (Write) em ${memoriaPasso(t, n)} a memória do passo, curta (até 40 linhas): decisões tomadas e por quê, alternativas descartadas, o que ficou pendente e arquivos tocados.`
  + (ajuste ? ` Esse arquivo já pode existir: ATUALIZE-o acrescentando a seção "Ajuste ${new Date().toISOString().slice(0, 10)}".` : '');
// Contexto que a conversa antiga daria: passo, artefato, memória (ou como reconstruir sem ela) e o protocolo de retomada.
const retomada = (t, n, titulo) => {
  const mem = memoriaPasso(t, n);
  return ` Passo ${n} (${titulo}). Artefato do passo: ${arquivoPasso(t, n)}. `
    + (fs.existsSync(mem) ? `Memória do passo (decisões e pendências da execução anterior): ${mem}. Leia-a antes de começar.`
      : `Não há memória deste passo (feito antes desta mudança): leia o artefato do passo e reconstrua o contexto por ele e pelo status.`)
    + ' Siga o protocolo de retomada da skill sdd (rode status), aplique só o que foi pedido sem refazer o que está certo';
};
const promptAjuste = (t, n, texto, titulo = estadoSpec(t)?.passos[n]?.titulo || '') =>
  `O humano pediu ajuste.${retomada(t, n, titulo)} e rode concluir ${n} de novo. Pedido de ajuste: "${texto}".${pedirMemoria(t, n, true)}`;
const promptRespostas = (t, n, lista, titulo = estadoSpec(t)?.passos[n]?.titulo || '') =>
  `Respostas do humano na aba (também registradas no estado, sdd-state pergunta responder): ${lista.join('; ')}.${retomada(t, n, titulo)} e continue o passo ${n} com elas.${pedirMemoria(t, n, false)}`;
// Ajuste e respostas: execução nova (continuar=false), tudo o que precisa vai no prompt.
const ajustar = (t, n, texto) => etapa(t, promptAjuste(t, n, texto), false, undefined, `Ajuste no passo ${n} · ${estadoSpec(t)?.passos[n]?.titulo || ''}`);
const aplicarRespostas = (t, n, lista) => etapa(t, promptRespostas(t, n, lista), false, undefined, `Aplicando suas respostas · passo ${n}`);
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

module.exports = { iniciar, etapa, seguir, subetapas3, mapasDe, memoriaPasso, promptAjuste, promptRespostas, ajustar, aplicarRespostas, filaTarefas, vigiarComentarios, respondidas, sdd, estadoDe, reposDe, avisarImpactos };
