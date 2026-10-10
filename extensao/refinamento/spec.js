// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { esc } = require('../ticket')._teste;
const tickets = require('../tickets');
const { arquivoPasso, duvidasDe, tarefasDe, impactosDe, ticketDe, estadoSpec } = require('./locais');
const { IC } = require('../componentes/icones');
const { quando } = require('../componentes/formato');
const maestro = require('../maestro');
const aoVivo = require('../componentes/ao-vivo');
const pill = require('../componentes/pill');
const mudancas = require('./mudancas');
const orq = require('./orquestrador');
const { SPECS_PADRAO, sddState } = require('../configuracao/configuracao');

// Aba Spec do refinamento: os passos do SDD, o cartão Agora, a pilha de perguntas (script "Pilha de perguntas" em pagina()),
// o modo refinamento (▶ ⏸ Dar início) e as ações.
const pasta = (id) => tickets.pasta(id);
const abertos = new Set(); // passos cujo arquivo o humano abriu nesta sessão (ticket:passo:hash)
const mencionar = (texto) => require('../claude').mencionar(texto);
const copiaAprovada = (r, n) => path.join(pasta(r.id), 'aprovados', `${n}-${path.basename(arquivoPasso(r, n))}`); // gravada pelo sdd-state aprovar
const STATUS = { pendente: 'Pendente', em_andamento: 'Claude trabalhando', aguardando_revisao: 'Aguardando sua revisão', aprovado: 'Aprovado', desatualizado: 'Desatualizado' };

// Modo refinamento (.ticket.json refinamento.estado): aguardando_inicio → (Dar início) → rodando ⇄ pausado.
// O vigia do plugin sdd lê o mesmo estado: parado não acorda o Claude; rodando acorda a cada aprovação.
const MODO_ATIVO = ['aguardando_inicio', 'rodando', 'pausado'];
const emRefino = (t) => MODO_ATIVO.includes(t.refinamento?.estado);
function botaoRefino(t, b) {
  const modo = t.refinamento?.estado;
  if (modo === 'aguardando_inicio') return t.specPronta
    ? `<button class="ct-dar" ${b('darInicio')} title="O Claude criou a spec: clique para ele começar os passos">Dar início</button>`
    : '<button class="ct-dar" disabled title="O Claude está criando a spec">Preparando…</button>';
  if (modo === 'rodando') return `<button class="ct-ico ct-pausa" ${b('pausar')} title="Pausar refinamento: o Claude termina a etapa atual e espera">${IC.pausa}</button>`;
  if (modo === 'pausado') return `<button class="ct-ico ct-play" ${b('retomar')} title="Retomar refinamento">${IC.play}</button>`;
  return `<button class="ct-ico ct-play" ${b('refinar')} title="${t.spec?.dir ? 'Continuar refinamento (spec)' : 'Iniciar refinamento (spec)'}">${IC.play}</button>`;
}
function pillRefino(t) {
  const modo = t.refinamento?.estado;
  const [texto, dica] = modo === 'aguardando_inicio'
    ? (t.specPronta ? ['Spec pronta', 'Modo refinamento: o Claude criou a spec. Clique em Dar início para ele começar os passos.']
      : ['Preparando spec', 'Modo refinamento: o Claude está criando a spec no repositório de specs.'])
    : modo === 'rodando' ? ['Refinando', 'Modo refinamento: o Claude trabalha nos passos da spec e segue sozinho a cada aprovação. ⏸ no topo pausa.']
      : ['Refinamento pausado', 'Modo refinamento pausado: o Claude termina a etapa atual e espera. ▶ no topo retoma.'];
  return pill.pill(texto, { cor: modo === 'pausado' ? 'pausada' : 'ia', dica, grande: true });
}
const modo = (chave, estado) => {
  const t = tickets.ler(chave);
  const refinamento = { ...t.refinamento, estado };
  tickets.gravar({ ...t, refinamento });
  return refinamento;
};

function telaConstituicao(r, est, abertos, impactos = []) {
  if (!est) return `<div class="vazio-aba">A spec ainda não foi iniciada.<br>Clique em <b>▶</b> no topo: o Claude cria <code>specs/NNN-…/</code> em ${esc(path.basename(r.spec?.repo || 'repositório'))} e começa pelo passo 0.</div>`;
  const abertas = est.perguntas.filter((q) => q.status === 'aberta');
  const bloq = est.achados.filter((a) => a.severidade === 'bloqueante' && a.status === 'aberto');
  const ROTULO = { regras: 'regras', proibicoes: 'proibições', secoes: 'seções', rfs: 'requisitos', historias: 'histórias', bordas: 'casos de borda',
    tecnologias: 'tecnologias', endpoints: 'endpoints', entidades: 'entidades', violacoes: 'violações', tarefas: 'tarefas', feitas: 'feitas',
    ultimaTarefa: 'última tarefa', ultimoCommit: 'último commit' };
  const vivo = !maestro.rodando(pasta(r.id)); // Aprovar só com o Claude parado
  const atencao = mudancas.passosAfetados(impactos), decide = mudancas.pendentes(impactos).length > 0; // mudança pedida em comentário, ainda sem decisão
  const chip = (k, v, alerta) => `<span class="chip ${alerta ? 'alerta' : ''}">${esc(ROTULO[k] || k)}: ${esc(Array.isArray(v) ? v.join(', ') : v)}</span>`;
  return `<div class="sdd-topo"><b>${esc(est.feature)}</b> · ${esc(path.basename(r.spec.repo))}<br>Próxima ação: ${esc(est.proximaAcao || '')}</div>
  <div class="passos">${est.passos.map((p) => {
    const lido = abertos.has(`${r.id}:${p.n}:${p.hash}`);
    const portaoFechado = p.n === 2 ? abertas.length : p.n === 5 ? bloq.length : 0;
    const resumo = Object.entries(p.resumo || {}).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length));
    const extra = p.n === 2 && est.perguntas.length ? `<ul class="lista-mini">${est.perguntas.map((q) => `<li><b>${esc(q.id)}</b> ${esc(q.pergunta)} — ${q.status === 'respondida' ? esc(q.resposta) : `<i>${esc(q.status)}</i>`}</li>`).join('')}</ul>`
      : p.n === 5 && est.achados.length ? `<ul class="lista-mini">${est.achados.map((a) => `<li><b>${esc(a.id)}</b> [${esc(a.severidade)}] ${esc(a.descricao)} — <i>${esc(a.status)}</i></li>`).join('')}</ul>`
      : '';
    const aten = atencao.has(p.n) && p.status !== 'pendente';
    return `<div class="passo s-${esc(p.status)}${aten ? ' s-atencao' : ''}">
      <div class="cab"><span class="num">${p.n}</span>${aten ? '<span class="aten" title="Um comentário do Jira pediu uma mudança que pode atingir este passo. Nada foi alterado: decida na caixa vermelha acima.">⚠</span>' : ''}<span class="nome">${esc(p.titulo)}${p.portao ? ` · Portão ${p.portao}` : ''}</span>
        <span class="st">${STATUS[p.status] || esc(p.status)}${p.versao ? ` · v${esc(p.versao)}` : ''}</span></div>
      ${p.status === 'pendente' ? '' : `<div class="corpo-passo">
        ${resumo.length ? `<div class="chips">${resumo.map(([k, v]) => chip(k, v, /viola|bloque|abertas/.test(k) && Number(v) > 0)).join('')}</div>` : ''}
        ${p.status === 'aprovado' ? `<div>Aprovado por <b>${esc(p.aprovadoPor || '')}</b> em ${esc(quando(p.aprovadoEm))}</div>` : ''}
        ${p.status === 'desatualizado' ? `<div class="motivo">${esc(p.motivoDesatualizado || '')}</div>` : ''}
        ${p.status === 'aguardando_revisao' && portaoFechado ? `<div class="motivo">Portão fechado: ${p.n === 2 ? `${abertas.length} pergunta(s) aberta(s)` : `${bloq.length} achado(s) bloqueante(s)`}
          <ul class="lista-mini">${(p.n === 2 ? abertas.map((q) => [q.id, q.pergunta]) : bloq.map((a) => [a.id, a.descricao])).map(([id, t]) => `<li><b>${esc(id)}</b> ${esc(t)}</li>`).join('')}</ul>
          <div>Responda/resolva na conversa ou aceite com justificativa.</div></div>` : ''}
        ${extra}
        <div class="format-bar arquivo">
          <button class="fb-btn" data-acao="specAbrir" data-id="${p.n}" title="${esc(p.arquivo)}">Abrir ${esc(path.basename(p.arquivo))}</button>
          <button class="fb-btn" data-acao="specMencionar" data-id="${p.n}" title="Mencionar no Claude">@</button>
          ${p.hashAprovado && p.hash !== p.hashAprovado && fs.existsSync(copiaAprovada(r, p.n)) ? `<button class="fb-btn" data-acao="specMudancas" data-id="${p.n}" title="Diferença para a versão aprovada">Ver mudanças</button>` : ''}
        </div>
        ${p.status === 'aguardando_revisao' ? `<div class="acoes-passo">
          <button class="aprovar ${vivo && !decide ? '' : 'travado'}" data-acao="specAprovar" data-id="${p.n}" ${decide ? 'disabled' : !vivo || (lido && !portaoFechado) ? '' : 'disabled'}
            title="${decide ? 'Decida primeiro a mudança pedida em comentário do Jira (caixa vermelha acima)' : !vivo ? 'O Claude ainda está trabalhando: espere a etapa terminar' : !lido ? 'Abra o arquivo antes de aprovar: nunca aprove sem ler' : portaoFechado ? 'Resolva as pendências do portão' : 'Aprovar este passo'}">Aprovar</button>
          <button data-acao="specAjuste" data-id="${p.n}">Pedir ajuste</button></div>` : ''}
        ${p.status === 'desatualizado' ? `<div class="acoes-passo"><button data-acao="specContinuar">Reconciliar</button></div>` : ''}
      </div>`}
    </div>`;
  }).join('')}</div>`;
}

// Cartão "Agora" no topo da aba Spec: o que está acontecendo e a sua única ação, com o botão certo.
// Cards que ainda esperam decisão para o passo poder ser aprovado: dev (tNN) no passo 4, o [QA] no passo 6.
const semDecisaoDo = (n, l) => l.filter((c) => (n === 6 ? c.tipo === 'qa' : c.tipo !== 'qa') && ['pendente', 'em_alteracao'].includes(c.status));

function cartaoAgora(t, est, rodandoAgora, tarefas = [], impactos = []) {
  const modo = t.refinamento?.estado;
  const passo = est && est.proximoPasso <= 6 ? est.passos[est.proximoPasso] : null;
  const abertas = est ? est.perguntas.filter((q) => q.status === 'aberta') : [];
  const duvidasAbertas = duvidasDe(pasta(t.id)).filter((x) => !x.resposta).length;
  let titulo, texto = '', acoes = '';
  if (rodandoAgora) [titulo, texto] = [`Claude trabalhando${passo ? ` · passo ${passo.n} · ${passo.titulo}` : ''}`, 'Acompanhe abaixo. ⏸ no topo pausa depois desta etapa.'];
  else if (!est) [titulo, texto] = ['Spec não iniciada', 'Clique em ▶ no topo para o Claude criar a spec.'];
  else if (abertas.length) {
    // Perguntas em pilha: um card por vez, as outras como bordas atrás. ‹ › passa sem responder; ▦ mostra todas em grade
    // (a navegação é só na página: script "Pilha de perguntas" em pagina()). Respondeu, o card sai e a pilha anda.
    const resto = Math.min(abertas.length - 1, 2);
    // Comentário do Jira que a triagem achou que responde a pergunta: só sugere, quem responde é você.
    const sugestaoDe = (id) => { const i = impactos.find((x) => x.pergunta?.id === id); return i ? `<div class="pctx">💬 Comentário de <b>${esc(i.autor)}</b> parece responder: ${esc(i.pergunta.motivo)} <a href="${esc(i.link)}">ver comentário</a></div>` : ''; };
    const card = (q, i) => `<div class="pcard" data-pq="${i}" data-qid="${esc(q.id)}" ${i ? 'hidden' : ''}>
      <div class="pcab"><b>${esc(q.id)}</b>${q.passo !== undefined ? `<span>passo ${esc(q.passo)}</span>` : ''}</div>
      <div class="ptexto">${esc(q.pergunta)}</div>
      ${q.contexto ? `<div class="pctx">${esc(q.contexto)}</div>` : ''}
      ${sugestaoDe(q.id)}
      <div class="popcoes">${(q.opcoes || []).map((o, k) => `<button data-acao="responder" data-id="${esc(q.id)}" data-op="${k}">${esc(o)}</button>`).join('')}</div>
      <div class="prod"><button data-acao="responder" data-id="${esc(q.id)}" data-op="outra">Outra resposta…</button>
        <button class="duv" data-acao="responder" data-id="${esc(q.id)}" data-op="duvida">Tirar dúvida</button></div>
    </div>`;
    return `<div class="pilha-t"><span>Perguntas do Claude</span>${abertas.length > 1 ? `<span class="pnav">
      <button data-pilha="ant" title="Pergunta anterior">‹</button><span id="pPos">1 de ${abertas.length}</span>
      <button data-pilha="prox" title="Próxima pergunta (sem responder esta)">›</button>
      <span class="ptam" hidden><button data-pilha="menor" title="Cards menores (mais por linha)">−</button><button data-pilha="maior" title="Cards maiores (menos por linha)">+</button></span>
      <button data-pilha="grade" title="Ver todas as perguntas">${IC.grade}</button></span>` : '<span>última</span>'}</div>
    <div class="pilha atras-${resto}" id="pilha">${abertas.map(card).join('')}</div>`;
  } else if (passo?.status === 'aguardando_revisao' && [4, 6].includes(passo.n) && semDecisaoDo(passo.n, tarefas).length) {
    const n = semDecisaoDo(passo.n, tarefas).length;
    [titulo, texto, acoes] = passo.n === 4
      ? [`Revise as tarefas · ${n} sem decisão`, 'Aprove (vira subtarefa no Jira), reprove ou peça alteração em cada card. Depois aprove o passo 4 aqui.', '<button class="primario" data-acao="aba" data-id="tarefas">Abrir Tarefas</button>']
      : ['Revise o plano de testes', 'O card [QA] está na aba Tarefas: aprove (cria a subtarefa [QA] no Jira com o plano), reprove ou peça alteração. Depois aprove o passo 6 aqui.', '<button class="primario" data-acao="aba" data-id="tarefas">Abrir Tarefas</button>'];
  } else if (passo?.status === 'aguardando_revisao') [titulo, texto] = [`Revise o passo ${passo.n} · ${passo.titulo}`, `Abra <b>${esc(path.basename(arquivoPasso(t, passo.n)))}</b> no cartão do passo, leia e clique em <b>Aprovar</b> ou <b>Pedir ajuste</b>.`];
  else if (!passo) [titulo, texto] = ['Spec concluída', 'Todos os passos aprovados.'];
  else if (modo === 'aguardando_inicio') [titulo, texto, acoes] = ['Spec criada', `Próximo: passo ${passo.n} · ${passo.titulo}.`, '<button class="primario" data-acao="darInicio">Dar início</button>'];
  else if (modo === 'pausado') [titulo, texto, acoes] = ['Refinamento pausado', `Para em: passo ${passo.n} · ${passo.titulo}.`, '<button class="primario" data-acao="retomar">▶ Retomar</button>'];
  else if (duvidasAbertas) [titulo, texto, acoes] = [`Passo ${passo.n} · ${passo.titulo} bloqueado`, `Há ${duvidasAbertas} dúvida(s) em aberto. A spec só avança quando todas forem respondidas.`, '<button class="primario" data-acao="aba" data-id="duvidas">Ver dúvidas</button>'];
  else [titulo, texto, acoes] = [`Pronto para o passo ${passo.n} · ${passo.titulo}`, 'O Claude não está rodando agora.', '<button class="primario" data-acao="retomar">Continuar</button>'];
  return `<div class="agora ${rodandoAgora ? 'trabalhando' : ''}"><div class="atitulo">${rodandoAgora ? '<span class="vivo-bola"></span>' : ''}${titulo}</div>
    ${texto ? `<div class="atexto">${texto}</div>` : ''}${acoes ? `<div class="aacoes">${acoes}</div>` : ''}</div>`;
}

// Corpo da aba Spec: cartão Agora, caixas de mudança, Ao vivo e a constituição.
const corpoAba = (t, d) => `${emRefino(t) || d.estado ? cartaoAgora(t, d.estado, d.vivoRodando, d.tarefas, d.impactos) : ''}${mudancas.caixaDecisao(d.impactos)}${mudancas.caixaMudancas(d.impactos)}${aoVivo.caixa(d.dir, d.vivoRodando, 'spec')}<div class="folha">${t.spec?.dir ? telaConstituicao(t, d.estado, d.abertos, d.impactos)
    : `<div class="vazio-aba">A spec ainda não foi iniciada.<br>Clique em <b>▶</b> no topo: o Claude cria <code>${esc(t.chave)}-…/</code> no repositório de specs e começa pelo passo 0.</div>`}</div>`;

const acoes = (s) => ({
  // ▶ Iniciar refinamento: modo aguardando_inicio + conversa nova que o hook do plugin sdd acorda com o /sdd:iniciar.
  // A spec mora no repositório de specs (craftingTable.specsDir), em <CHAVE>-<slug>/. Spec já existente: continua de onde parou.
  async refinar() {
    const t = s.ticketAberto();
    if (!t) return;
    if (estadoSpec(t)) { s.mudarAba('spec'); return acoes(s).retomar(); }
    let repo = t.spec?.repo || vscode.workspace.getConfiguration('craftingTable').get('specsDir') || SPECS_PADRAO;
    if (!fs.existsSync(repo)) {
      const uri = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, title: 'Repositório de specs (onde a spec vai morar)', openLabel: 'Usar este repositório' });
      if (!uri) return;
      repo = uri[0].fsPath;
    }
    modo(t.chave, 'aguardando_inicio');
    tickets.gravar({ ...tickets.ler(t.chave), refinamento: { ...tickets.ler(t.chave).refinamento, iniciadoPor: os.userInfo().username } });
    s.mudarAba('spec'); // o refinamento acontece na aba Spec
    s.atualizarJira(t.chave); // anexos do ticket aparecem em Docs para baixar
    // Maestro (prova): o Claude roda em segundo plano e a caixa Ao vivo da aba Spec mostra o que ele faz.
    orq.etapa(t, `/sdd:iniciar ${pasta(t.chave)} ${repo}\nTicket aguardando início: só crie a spec (init + status) e termine dizendo para clicar em Dar início.`, false, repo, 'Criando a spec do ticket');
    s.render();
  },
  darInicio() { return acoes(s).retomar(); },
  pausar() { modo(s.aberto, 'pausado'); s.render(); },
  // Dar início / ▶ Retomar / Continuar: modo rodando e, se nada espera por você, o Claude começa a próxima etapa.
  retomar() {
    const t = s.ticketAberto();
    if (!t) return;
    modo(t.chave, 'rodando');
    if (!orq.seguir(t)) s.render();
  },
  specAbrir({ id }) {
    const r = s.ticketAberto(), n = Number(id), est = estadoSpec(r);
    const arq = arquivoPasso(r, n);
    if (!fs.existsSync(arq)) return vscode.window.showWarningMessage(`O arquivo ainda não existe: ${arq}`);
    abertos.add(`${r.id}:${n}:${est?.passos[n]?.hash}`); // libera o Aprovar: só depois de ler
    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arq));
    s.render();
  },
  specMudancas({ id }) {
    const r = s.ticketAberto(), n = Number(id), est = estadoSpec(r);
    abertos.add(`${r.id}:${n}:${est?.passos[n]?.hash}`); // ver o diff também conta como leitura
    vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(copiaAprovada(r, n)), vscode.Uri.file(arquivoPasso(r, n)),
      `${path.basename(arquivoPasso(r, n))}: aprovado ↔ atual`);
    s.render();
  },
  specMencionar({ id }) { mencionar(`@${arquivoPasso(s.ticketAberto(), Number(id))}`); },
  specContinuar() { return acoes(s).refinar(); },
  async specAprovar({ id }) {
    const r = s.ticketAberto(), n = Number(id), est = estadoSpec(r);
    if (maestro.rodando(pasta(r.id))) return vscode.window.showWarningMessage('O Claude ainda está trabalhando neste ticket: espere a etapa terminar.');
    if (mudancas.pendentes(impactosDe(pasta(r.id))).length) return vscode.window.showWarningMessage('Há uma mudança pedida em comentário do Jira esperando sua decisão (caixa vermelha acima): decida antes de aprovar.');
    const cards = tarefasDe(pasta(r.id));
    const semDecisao = [4, 6].includes(n) ? semDecisaoDo(n, cards) : [];
    if (semDecisao.length) { s.mudarAba('tarefas'); s.render(); return vscode.window.showWarningMessage(n === 4 ? `Decida as tarefas antes de aprovar o passo 4: ${semDecisao.length} sem decisão (${semDecisao.map((x) => x.id).join(', ')}).` : 'Decida o card [QA] na aba Tarefas antes de aprovar o passo 6.'); }
    if (n === 6 && !cards.some((x) => x.tipo === 'qa')) return vscode.window.showWarningMessage('O Claude ainda não criou o card [QA] com o plano de testes: peça ajuste no passo 6.');
    if (!abertos.has(`${r.id}:${n}:${est?.passos[n]?.hash}`)) return vscode.window.showWarningMessage('Abra e leia o arquivo antes de aprovar.');
    const ok = await vscode.window.showInformationMessage(`Aprovar o passo ${n} (${est.passos[n].titulo})?`, { modal: true, detail: 'Depois de aprovado, o Claude pode seguir para o próximo passo.' }, 'Aprovar');
    if (!ok) return;
    const bin = sddState();
    if (!bin) return vscode.window.showErrorMessage('Plugin sdd não encontrado (claude plugin install sdd@crafting-local).');
    require('child_process').execFile(bin, ['aprovar', String(n), '--ref', pasta(r.id), '--por', os.userInfo().username], (err, out, errOut) => {
      s.render();
      if (err) return vscode.window.showErrorMessage(String(errOut || err.message).replace(/^sdd-state: /, ''));
      // Aprovado: próximo passo numa execução nova (contexto limpo), se o refinamento estiver rodando.
      vscode.window.setStatusBarMessage(`$(check) ${out.trim()}`, 6000);
      orq.seguir(ticketDe(r.id));
    });
  },
  async specAjuste({ id }) {
    const r = s.ticketAberto(), n = Number(id);
    if (maestro.rodando(pasta(r.id))) return vscode.window.showWarningMessage('O Claude ainda está trabalhando neste ticket: espere a etapa terminar.');
    const texto = await vscode.window.showInputBox({ title: `Ajuste no passo ${n} (${estadoSpec(r)?.passos[n]?.titulo})`, prompt: 'O que o Claude deve mudar?', ignoreFocusOut: true });
    if (!texto?.trim()) return;
    await orq.sdd(['ajuste', String(n), '--ref', pasta(r.id), '--motivo', texto.trim()]);
    orq.etapa(r, `O humano pediu ajuste no passo ${n}: "${texto.trim()}". Faça o ajuste no arquivo do passo e rode concluir ${n} de novo.`, true, undefined, `Ajuste no passo ${n} · ${estadoSpec(r)?.passos[n]?.titulo || ''}`);
  },
  // Pergunta do Claude respondida na aba (id = Qnn, op = índice da opção | 'outra' | 'duvida').
  // Todas respondidas e refinamento rodando → o Claude continua na mesma sessão com as respostas.
  async responder({ id, op }) {
    const r = s.ticketAberto();
    const q = estadoSpec(r)?.perguntas.find((x) => x.id === id);
    if (!q || q.status !== 'aberta') return;
    let resposta;
    if (op === 'duvida') {
      await orq.sdd(['duvida', 'add', '--ref', pasta(r.id), '--texto', q.pergunta, '--contexto', `${q.id} · passo ${q.passo ?? '?'}${q.contexto ? ` · ${q.contexto}` : ''}${q.opcoes?.length ? ` · opções: ${q.opcoes.join(' / ')}` : ''}`]);
      await orq.sdd(['pergunta', 'descartar', id, '--ref', pasta(r.id)]);
      resposta = 'Tirar dúvida (vai para o time; trate como em aberto)';
    } else {
      resposta = op === 'outra' ? (await vscode.window.showInputBox({ title: q.pergunta, prompt: 'Sua resposta', ignoreFocusOut: true }))?.trim() : q.opcoes?.[Number(op)];
      if (!resposta) return;
      await orq.sdd(['pergunta', 'responder', id, '--ref', pasta(r.id), '--resposta', resposta]);
    }
    orq.respondidas.push(`${id} → ${resposta}`);
    const est = estadoSpec(r);
    if (!est.perguntas.some((x) => x.status === 'aberta') && orq.estadoDe(r.id) === 'rodando' && !maestro.rodando(pasta(r.id))) {
      orq.etapa(r, `Respostas do humano na aba: ${orq.respondidas.join('; ')}. Continue o passo ${est.proximoPasso} com elas.`, true, undefined, `Aplicando suas respostas · passo ${est.proximoPasso}`);
      orq.respondidas.length = 0;
    }
    s.render();
  }
});

// Script da webview da pilha de perguntas. Espera `vscode` (acquireVsCodeApi) já definido no <script> da página.
const scriptPilha = () => `// Pilha de perguntas: ‹ › troca o card de cima, ▦ alterna para a grade com todas. Lembra a pergunta e o modo.
  const pilha = document.getElementById('pilha');
  if (pilha) {
    const cards = [...pilha.querySelectorAll('.pcard')], pos = document.getElementById('pPos');
    const st = vscode.getState() || {};
    let i = Math.max(0, cards.findIndex((c) => c.dataset.qid === st.pqId));
    if (i === 0 && st.pqId && !cards.some((c) => c.dataset.qid === st.pqId)) i = Math.min(st.pq || 0, cards.length - 1); // respondida: fica na mesma posição
    let grade = !!st.pgrade && cards.length > 1;
    // Largura mínima do card na grade: o número de colunas se ajusta sozinho (auto-fill) à largura da tela.
    let largura = st.pw || 240;
    const tam = document.querySelector('.ptam');
    const mostrar = () => {
      pilha.classList.toggle('grade', grade);
      pilha.style.setProperty('--pw', largura + 'px');
      if (tam) tam.hidden = !grade;
      cards.forEach((c, k) => { c.hidden = !grade && k !== i; });
      if (pos) pos.textContent = grade ? cards.length + ' perguntas' : (i + 1) + ' de ' + cards.length;
      document.querySelector('[data-pilha="grade"]')?.classList.toggle('is-on', grade);
      vscode.setState({ ...(vscode.getState() || {}), pq: i, pqId: cards[i]?.dataset.qid, pgrade: grade, pw: largura });
    };
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pilha]');
      if (!b) return;
      if (b.dataset.pilha === 'maior' || b.dataset.pilha === 'menor') largura = Math.min(560, Math.max(160, largura + (b.dataset.pilha === 'maior' ? 40 : -40)));
      else if (b.dataset.pilha === 'grade') grade = !grade;
      else { grade = false; i = (i + (b.dataset.pilha === 'prox' ? 1 : -1) + cards.length) % cards.length; }
      mostrar();
    });
    mostrar();
  }`;

const CSS = `
  /* Constituição: os 7 passos do SDD — cinza até acontecer */
  .sdd-topo { font-size: 11.5px; color: var(--text-dim); margin-bottom: 10px; line-height: 1.5; }
  .sdd-topo b { color: var(--text); }
  .passos { display: flex; flex-direction: column; gap: 8px; }
  .passo { border-radius: var(--r-lg); border: 1px solid var(--border); background: var(--surface-2); padding: 9px 10px; }
  .passo .cab { display: flex; align-items: center; gap: 8px; }
  .num { flex: none; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
    background: var(--border); color: var(--text-dim); }
  .passo .nome { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; }
  .passo .st { flex: none; font-size: 10px; padding: 1px 7px; border-radius: var(--r-pill); border: 1px solid var(--border); color: var(--text-dim); }
  .passo .corpo-passo { margin: 8px 0 0 30px; font-size: 11.5px; color: var(--text-dim); line-height: 1.55; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
  .chip { font-size: 10.5px; padding: 0 7px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .chip.alerta { color: var(--perigo); border-color: color-mix(in srgb, var(--perigo) 45%, transparent); }
  .arquivo { display: inline-flex; gap: 2px; margin-top: 6px; }
  .acoes-passo { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .acoes-passo button { height: 26px; padding: 0 10px; border-radius: var(--r-md); font-size: 11.5px; font-weight: 600; border: 1px solid var(--border) !important; background: var(--surface) !important; color: var(--text); }
  .acoes-passo button.aprovar { background: var(--ok) !important; color: var(--on-cor); border-color: transparent !important; }
  .acoes-passo button:disabled, .acoes-passo button.travado { opacity: .45; cursor: not-allowed; }
  .motivo { color: var(--perigo); }
  .lista-mini { margin: 4px 0 0; padding-left: 14px; }
  .lista-mini li { margin: 2px 0; }
  .s-pendente { opacity: .45; filter: grayscale(1); }
  .s-em_andamento { border-color: var(--accent); animation: pulsa 1.6s infinite; }
  .s-em_andamento .num { background: var(--accent); color: var(--on-cor); }
  @keyframes pulsa { 50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); } }
  .s-aguardando_revisao { border-color: var(--warn); }
  .s-aguardando_revisao .num { background: var(--warn); color: var(--on-cor); }
  .s-aguardando_revisao .st { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 50%, transparent); }
  .s-aprovado { border-color: color-mix(in srgb, var(--ok) 55%, transparent); background: color-mix(in srgb, var(--ok) 8%, var(--surface-2)); }
  .s-aprovado .num { background: var(--ok); color: var(--on-cor); }
  .s-aprovado .st { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, transparent); }
  .s-desatualizado { border-color: var(--warn); }
  .s-desatualizado .num { background: var(--warn); color: var(--on-cor); }
  .s-desatualizado .st { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 50%, transparent); }
  .aguardando { color: var(--warn); }
  .agora { margin: 0 12px 10px; padding: 10px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border);
    border-left: 3px solid var(--ia); box-shadow: var(--sombra); font-size: 12px; line-height: 1.5; }
  .agora .atitulo { font-weight: 600; font-size: 12.5px; display: flex; align-items: center; }
  .agora .atexto { color: var(--text-dim); margin-top: 2px; }
  .agora .aacoes { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
  .agora .aacoes > .primario { align-self: flex-start; height: 28px; }
  .pilha-t { display: flex; justify-content: space-between; align-items: center; margin: 0 12px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-dim); }
  .pilha { position: relative; margin: 0 12px 26px; }
  .pilha::before, .pilha::after { content: ''; position: absolute; left: 10px; right: 10px; height: 100%; border-radius: var(--r-lg);
    background: var(--surface); border: 1px solid var(--border); z-index: 0; display: none; }
  .pilha::before { top: 7px; opacity: .75; } .pilha::after { top: 14px; left: 20px; right: 20px; opacity: .45; }
  .pilha.atras-1::before, .pilha.atras-2::before, .pilha.atras-2::after { display: block; }
  .pnav { display: inline-flex; align-items: center; gap: 2px; text-transform: none; letter-spacing: 0; font-size: 11px; }
  .pnav button { width: 22px; height: 22px; border-radius: var(--r-md); color: var(--text); display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }
  .pnav button:hover { background: var(--surface-2); }
  .pnav button svg { width: 13px; height: 13px; }
  .ptam { display: inline-flex; gap: 2px; margin: 0 2px; padding: 0 2px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
  .pnav #pPos { min-width: 42px; text-align: center; }
  .pilha.grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(var(--pw, 240px), 100%), 1fr)); gap: 10px; margin-bottom: 12px; }
  .pilha.grade::before, .pilha.grade::after { display: none !important; }
  .pilha.grade .pcard { min-height: 0; max-height: none; animation: none; }
  .pnav button.is-on { background: color-mix(in srgb, var(--ia) 22%, transparent); color: var(--ia); }
  .pcard { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 8px; min-height: 200px; max-height: 320px; overflow: auto;
    padding: 14px 14px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--ia);
    box-shadow: var(--sombra); animation: sobe 220ms ease-out; }
  @keyframes sobe { from { transform: translateY(8px); opacity: 0; } }
  .pcab { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim); }
  .pcab b { color: var(--ia); }
  .pcard .ptexto { font-size: 13px; font-weight: 600; line-height: 1.45; }
  .pcard .pctx { font-size: 11.5px; color: var(--text-dim); line-height: 1.45; }
  .popcoes { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
  .popcoes button { padding: 7px 10px; border: 1px solid var(--border) !important; border-radius: var(--r-md); background: var(--surface-2) !important;
    font-size: 12px; text-align: left; line-height: 1.35; }
  .popcoes button:hover { border-color: var(--ia) !important; }
  .prod { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 10px; margin-top: auto; padding-top: 4px; }
  .prod button { white-space: nowrap; }
  .prod button { font-size: 11.5px; color: var(--text-dim); padding: 2px 0; }
  .prod button:hover { color: var(--text); text-decoration: underline; }
  .prod .duv { color: var(--accent); }
  .passo.s-atencao { border-color: #f58a1f; background: color-mix(in srgb, #f58a1f 12%, var(--surface-2)); opacity: 1; filter: none; }
  .passo.s-atencao .num { background: #f58a1f; color: var(--on-cor); }
  .aten { flex: none; color: #f58a1f; font-size: 13px; cursor: help; }
`;

module.exports = { STATUS, MODO_ATIVO, emRefino, botaoRefino, pillRefino, modo, abertos, telaConstituicao, cartaoAgora, corpoAba, scriptPilha, CSS, acoes };
