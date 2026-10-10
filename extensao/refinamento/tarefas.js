// @ts-check
const vscode = require('vscode');
const os = require('os');
const jira = require('../infra/ticket').jira;
const { esc } = require('../infra/ticket')._teste;
const { markdown } = require('../componentes/markdown');
const { quando, iniciais } = require('../componentes/formato');
const { TAREFAS, lerTexto, tarefasDe, impactosDe } = require('./locais');
const mudancas = require('./mudancas');

// ── Tarefas: cards do passo 4 (como no Jira). Pendentes → você aprova (vira subtarefa no Jira), reprova ou pede
// alteração (o Claude ajusta em segundo plano). O detalhe abre por cima do quadro (script "Tarefas" em pagina()).
const STATUS_T = { pendente: 'Pendente', em_alteracao: 'Claude alterando', aprovada: 'Aprovada', reprovada: 'Reprovada' };
const COLUNAS_T = [['Pendentes', ['pendente', 'em_alteracao']], ['Aprovadas', ['aprovada']], ['Reprovadas', ['reprovada']]];
function telaTarefas(t, l, impactos = []) {
  const atencao = mudancas.cardsAfetados(impactos);
  if (!l.length) return `<div class="folha"><div class="vazio-aba">Nenhuma tarefa ainda.<br>No passo 4 da spec o Claude cria as tarefas e elas aparecem aqui como cards,
    para você aprovar (vira subtarefa no Jira em ${esc(t.chave)}), reprovar ou pedir alteração.</div></div>`;
  const chip = (c) => `${c.camada ? `<span class="tcam cam-${esc(c.camada)}">${esc(c.camada)}</span>` : ''}
    ${c.estimativa ? `<span class="test" title="Estimativa original">⏱ ${esc(c.estimativa)}</span>` : ''}
    ${c.jira ? `<span class="tjira">${esc(c.jira)}</span>` : ''}
    ${c.vinculado ? `<span class="tav" title="Vinculada a você">${esc(iniciais())}</span>` : ''}`;
  const card = (c) => `<div class="tcard ts-${esc(c.status)} ${c.tipo === 'qa' ? 'tqa' : ''} ${atencao.has(c.id) ? 'tatencao' : ''}" data-tcard="${esc(c.id)}" title="Abrir ${esc(c.id)}">
    <div class="ttit">${atencao.has(c.id) ? '<span class="taten" title="Uma mudança pedida em comentário do Jira pode atingir este card (aguarda sua decisão na aba Spec)">⚠</span>' : ''}${c.tipo === 'qa' ? '<span class="selo-qa">QA</span>' : ''}${esc(c.titulo || c.id)}${c.revisao ? '<span class="trev" title="Uma mudança no ticket atingiu esta subtarefa">↻ revisar</span>' : ''}</div>
    ${c.tipo === 'qa' && c.resumo ? `<div class="tres">${esc(c.resumo)}</div>` : ''}
    ${c.status === 'em_alteracao' ? '<div class="tproc"><span class="vivo-bola"></span>Claude alterando…</div>' : ''}
    <div class="tpe"><span class="tid">${esc(c.id)}</span>${chip(c)}</div></div>`;
  const linha = (rot, v) => (v ? `<div class="tm-l"><span>${rot}</span><div>${v}</div></div>` : '');
  const modal = (c) => {
    const aberta = c.status === 'pendente';
    return `<div class="tmodal" data-tmodal="${esc(c.id)}" hidden><div class="tm-caixa">
      <div class="tm-cab"><span class="tid">${esc(c.id)}</span><span class="tstatus ts-${esc(c.status)}">${STATUS_T[c.status] || esc(c.status)}</span>
        <button class="tm-x" data-tfechar title="Fechar (Esc)">✕</button></div>
      <h3>${esc(c.titulo || c.id)}</h3>
      ${c.status === 'em_alteracao' ? `<div class="tproc"><span class="vivo-bola"></span>Claude aplicando: “${esc(c.alteracao || '')}”</div>` : ''}
      ${c.tipo === 'qa' ? `<div class="tm-desc md">${markdown(lerTexto(c.arquivo || '') || 'Plano de testes não encontrado.')}</div>`
        : `<div class="tm-desc">${esc(c.descricao || 'Sem descrição.')}</div>`}
      <div class="tm-ls">
        ${linha('Pronto quando', esc(c.pronto || ''))}
        ${linha('Requisitos', esc((c.rf || []).join(', ')))}
        ${linha('Depende de', esc((c.depende || []).join(', ')))}
        ${linha('Camada', esc(c.camada || ''))}
        ${linha('Jira', c.jira ? `<a href="${esc(t.site)}/browse/${esc(c.jira)}">${esc(c.jira)}</a>` : '')}
        ${!aberta ? linha('Estimativa original', esc(c.estimativa || '—')) + linha('Responsável', c.vinculado ? 'você' : '—') : ''}
        ${c.motivo ? linha('Motivo', esc(c.motivo)) : ''}
      </div>
      ${aberta ? `<div class="tm-campos">
        <label>Estimativa original<input data-tcampo="estimativa" value="${esc(c.estimativa || '')}" placeholder="ex.: 30m, 2h, 1d"></label>
        <label class="tchk"><input type="checkbox" data-tcampo="vinculado" ${c.vinculado ? 'checked' : ''}>Vincular a mim (responsável no Jira)</label></div>
      <div class="tm-acoes"><button class="aprovar" data-tacao="tarefaAprovar">Aprovar</button>
        <button class="reprovar" data-tacao="tarefaReprovar">Reprovar</button><button data-talterar>Pedir alteração</button></div>
      <div class="tm-alt" hidden><textarea placeholder="O que o Claude deve mudar nesta tarefa?"></textarea>
        <div class="tm-acoes"><button class="primario" data-tenviar>Enviar para o Claude</button><button data-tcancelar>Cancelar</button></div></div>` : ''}
      ${c.revisao ? `<div class="tm-rev"><b>↻ Alteração proposta</b> — ${esc(c.revisao.motivo)}
        ${c.revisao.comentario ? ` · <a href="${esc(c.revisao.comentario)}">comentário</a>` : ''}
        ${Object.entries(c.revisao.campos || {}).map(([k, v]) => `<div class="tm-l"><span>${esc(k)} (novo)</span><div>${esc(v)}</div></div>`).join('')}
        ${c.tipo === 'qa' ? '<div class="tm-l"><span>Plano</span><div>testes.md atualizado (acima)</div></div>' : ''}
        <div class="tm-acoes"><button class="aprovar" data-tacao="revisaoAplicar">Aplicar no Jira</button><button data-tacao="revisaoDescartar">Descartar</button></div></div>` : ''}
      ${(c.historico || []).length ? `<div class="tm-hist">${c.historico.map((h) => `<div><span>${esc(quando(h.em))}</span> ${esc(h.texto || h.evento)}</div>`).join('')}</div>` : ''}
    </div></div>`;
  };
  return `<div class="tboard">${COLUNAS_T.map(([nome, sts]) => {
    const cs = l.filter((c) => sts.includes(c.status));
    return `<div class="tcol"><div class="tcol-t">${nome}<span>${cs.length}</span></div>${cs.map(card).join('') || '<div class="tvazio">—</div>'}</div>`;
  }).join('')}</div>${l.map(modal).join('')}`;
}

// Script da webview do modal de tarefas. Espera `vscode` (acquireVsCodeApi) e `enviar` já definidos no <script> da página.
const script = () => `// Tarefas: clique no card abre o detalhe; Esc/✕/fundo fecha. Campos e ações vão para a extensão.
  // O detalhe aberto e o rascunho do pedido de alteração sobrevivem ao redesenho.
  if (document.querySelector('[data-tmodal]')) {
    const estado = () => vscode.getState() || {};
    const abrirT = (id) => {
      document.querySelectorAll('[data-tmodal]').forEach((m) => { m.hidden = m.dataset.tmodal !== id; });
      vscode.setState({ ...estado(), tmodal: id || null });
    };
    const rascunho = (id, texto) => { const r = { ...(estado().talt || {}) }; if (texto === null) delete r[id]; else r[id] = texto; vscode.setState({ ...estado(), talt: r }); };
    const camposDe = (m) => m.querySelectorAll('[data-tcampo]').forEach((i) =>
      enviar({ acao: 'tarefaCampo', id: m.dataset.tmodal, campo: i.dataset.tcampo, valor: i.type === 'checkbox' ? i.checked : i.value }));
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-tcard]');
      if (c) return abrirT(c.dataset.tcard);
      const m = e.target.closest('[data-tmodal]');
      if (!m) return;
      const id = m.dataset.tmodal, alt = m.querySelector('.tm-alt');
      if (e.target === m || e.target.closest('[data-tfechar]')) return abrirT(null);
      const a = e.target.closest('[data-tacao]');
      if (a) { camposDe(m); return enviar({ acao: a.dataset.tacao, id }); }
      if (e.target.closest('[data-talterar]')) { alt.hidden = false; alt.querySelector('textarea').focus(); return; }
      if (e.target.closest('[data-tcancelar]')) { alt.hidden = true; rascunho(id, null); return; }
      if (e.target.closest('[data-tenviar]')) {
        const texto = alt.querySelector('textarea').value.trim();
        if (!texto) return alt.querySelector('textarea').focus();
        enviar({ acao: 'tarefaAlterar', id, texto });
        rascunho(id, null);
        abrirT(null);
      }
    });
    document.querySelectorAll('[data-tcampo]').forEach((i) => i.addEventListener('change', () =>
      enviar({ acao: 'tarefaCampo', id: i.closest('[data-tmodal]').dataset.tmodal, campo: i.dataset.tcampo, valor: i.type === 'checkbox' ? i.checked : i.value })));
    document.querySelectorAll('.tm-alt textarea').forEach((ta) => ta.addEventListener('input', () => rascunho(ta.closest('[data-tmodal]').dataset.tmodal, ta.value)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrirT(null); });
    const st = estado();
    for (const [id, texto] of Object.entries(st.talt || {})) {
      const m = document.querySelector('[data-tmodal="' + id + '"] .tm-alt');
      if (m) { m.hidden = false; m.querySelector('textarea').value = texto; }
    }
    if (st.tmodal && document.querySelector('[data-tmodal="' + st.tmodal + '"]')) abrirT(st.tmodal);
  }`;

// Subtarefa de QA que já existe no ticket / texto que vai para a descrição da subtarefa no Jira.
const QA_EXISTENTE = /^\[QA\]\s*(Planejamento|Teste de Qualidade)/i; // subtarefa de QA que já existe no ticket
const descricaoJira = (t, c) => [c.descricao || '', '',
  c.pronto && `Pronto quando: ${c.pronto}`, (c.rf || []).length && `Requisitos: ${c.rf.join(', ')}`,
  (c.depende || []).length && `Depende de: ${c.depende.join(', ')}`, c.camada && `Camada: ${c.camada}`,
  `Origem: spec ${t.spec?.dir || ''} · tarefa ${c.id} (Crafting Table)`].filter((x) => x !== false && x !== undefined && x !== 0).join('\n');

const CSS = `
  .tboard { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 12px 12px; align-items: flex-start; }
  .tcol { flex: 1 0 210px; min-width: 210px; display: flex; flex-direction: column; gap: 6px; padding: 6px; border-radius: var(--r-lg); background: var(--surface-2); }
  .tcol-t { display: flex; justify-content: space-between; padding: 2px 4px 4px; font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-dim); }
  .tvazio { text-align: center; color: var(--text-dim); font-size: 11px; padding: 8px 0; }
  .tcard { display: flex; flex-direction: column; gap: 6px; padding: 9px 10px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--border);
    box-shadow: 0 1px 2px rgb(0 0 0 / 18%); cursor: pointer; font-size: 12px; line-height: 1.4; }
  .tcard:hover { border-color: var(--accent); }
  .tcard.ts-em_alteracao { border-color: var(--ia); }
  .tcard.ts-reprovada .ttit { color: var(--text-dim); text-decoration: line-through; }
  .ttit { font-weight: 500; word-break: break-word; }
  .tpe { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; font-size: 10.5px; color: var(--text-dim); }
  .tid { font-weight: 600; color: var(--text-dim); }
  .tcam { padding: 0 5px; border-radius: var(--r-sm); font-size: 10px; text-transform: uppercase; background: var(--surface-2); }
  .cam-backend { background: color-mix(in srgb, var(--text) 14%, transparent); color: var(--text); }
  .cam-mobile { background: color-mix(in srgb, var(--ok) 22%, transparent); color: var(--ok); }
  .tjira { color: var(--accent-soft); font-weight: 600; }
  .tav { margin-left: auto; width: 20px; height: 20px; border-radius: 50%; background: var(--accent); color: var(--on-cor); font-size: 9px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  .tcard.tatencao { border-color: #f58a1f; background: color-mix(in srgb, #f58a1f 10%, var(--surface)); }
  .tcard .taten { color: #f58a1f; margin-right: 4px; cursor: help; }
  .trev { display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: var(--r-sm); font-size: 10px; background: color-mix(in srgb, var(--ia) 25%, transparent); color: var(--ia); }
  .tm-rev { padding: 8px 10px; border-radius: var(--r-md); border: 1px solid var(--ia); background: color-mix(in srgb, var(--ia) 8%, transparent); }
  .tm-rev b { color: var(--ia); }
  .tqa { border-left: 3px solid var(--warn); }
  .selo-qa { display: inline-block; margin-right: 6px; padding: 0 5px; border-radius: var(--r-sm); font-size: 10px; font-weight: 700; background: var(--warn); color: var(--on-cor); vertical-align: 1px; }
  .tres { font-size: 11px; color: var(--text-dim); line-height: 1.4; }
  .tm-desc.md { white-space: normal; max-height: 50vh; overflow: auto; }
  .tm-desc.md h3, .tm-desc.md h4, .tm-desc.md h5 { margin: 10px 0 4px; }
  .tproc { display: flex; align-items: center; font-size: 11px; color: var(--ia); }
  .tmodal { position: fixed; inset: 0; z-index: 300; background: rgb(0 0 0 / 55%); display: flex; align-items: flex-start; justify-content: center; padding: 24px 10px; overflow: auto; }
  .tm-caixa { width: min(560px, 100%); display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: var(--r-lg); background: var(--surface);
    border: 1px solid var(--border); box-shadow: 0 12px 40px rgb(0 0 0 / 45%); font-size: 12.5px; line-height: 1.5; }
  .tm-cab { display: flex; align-items: center; gap: 8px; }
  .tm-x { margin-left: auto; width: 26px; height: 26px; border-radius: var(--r-md); }
  .tm-x:hover { background: var(--surface-2); }
  .tstatus { padding: 0 7px; border-radius: var(--r-pill); font-size: 10.5px; border: 1px solid var(--border); }
  .tstatus.ts-aprovada { color: var(--ok); border-color: var(--ok); } .tstatus.ts-reprovada { color: var(--danger); border-color: var(--danger); }
  .tstatus.ts-em_alteracao { color: var(--ia); border-color: var(--ia); }
  .tm-caixa h3 { margin: 0; font-size: 14px; }
  .tm-desc { white-space: pre-wrap; word-break: break-word; padding: 8px 10px; border-radius: var(--r-md); background: var(--surface-2); }
  .tm-ls { display: flex; flex-direction: column; gap: 4px; }
  .tm-l { display: flex; gap: 10px; font-size: 12px; } .tm-l > span { flex: none; width: 130px; color: var(--text-dim); }
  .tm-l a { color: var(--accent-soft); }
  .tm-campos { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
  .tm-campos label { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-dim); }
  .tm-campos input:not([type]) { flex: 1; max-width: 160px; height: 26px; padding: 0 8px; border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface-2); color: var(--text); font: inherit; }
  .tchk { cursor: pointer; } .tchk input { margin: 0; }
  .tm-acoes { display: flex; gap: 6px; flex-wrap: wrap; }
  .tm-acoes button { height: 28px; padding: 0 12px; border: 1px solid var(--border) !important; border-radius: var(--r-md); font-size: 12px; }
  .tm-acoes .aprovar { background: var(--ok) !important; border-color: var(--ok) !important; color: var(--on-cor); }
  .tm-acoes .reprovar { color: var(--danger); }
  .tm-alt textarea { width: 100%; min-height: 80px; box-sizing: border-box; margin-bottom: 6px; padding: 8px; border: 1px solid var(--border); border-radius: var(--r-md);
    background: var(--surface-2); color: var(--text); font: inherit; resize: vertical; }
  .tm-hist { font-size: 11px; color: var(--text-dim); border-top: 1px solid var(--border); padding-top: 6px; display: flex; flex-direction: column; gap: 2px; }
  .tm-hist span { margin-right: 6px; }
`;

// Ações do card de tarefa (handlers da webview). Contrato: acoes(servicos), ver teste-acoes.js.
const acoes = (s) => ({
  tarefaCampo({ id, campo, valor }) {
    const l = tarefasDe(s.pasta(s.aberto)), c = l.find((x) => x.id === id);
    if (!c || c.status !== 'pendente') return;
    if (campo === 'estimativa') {
      const v = String(valor || '').trim();
      if (v && !/^(\d+(\.\d+)?[wdhm]\s*)+$/i.test(v)) return vscode.window.showWarningMessage('Estimativa no formato do Jira: 30m, 2h, 1d ou 1d 4h.');
      if ((c.estimativa || '') === v) return;
      c.estimativa = v;
    } else if (campo === 'vinculado') {
      if (!!c.vinculado === !!valor) return;
      c.vinculado = !!valor;
    } else return;
    s.gravar(s.aberto, TAREFAS, l);
  },
  // Aprovar = criar a subtarefa no Jira (com confirmação). Só então o card vai para Aprovadas.
  async tarefaAprovar({ id }) {
    const t = s.ticketAberto();
    const c0 = t && tarefasDe(s.pasta(t.chave)).find((x) => x.id === id);
    if (!c0 || c0.status !== 'pendente') return;
    await new Promise((ok) => setTimeout(ok, 150)); // os campos do detalhe chegam antes
    const c = tarefasDe(s.pasta(t.chave)).find((x) => x.id === id);
    if (c.tipo === 'qa') return acoes(s).qaAprovar(t, c);
    const ok = await vscode.window.showWarningMessage(`Aprovar ${c.id}? A subtarefa será criada no Jira, no ticket ${t.chave}.`, { modal: true,
      detail: `“${c.titulo}”\nResponsável: ${c.vinculado ? 'você' : 'sem responsável'} · Estimativa original: ${c.estimativa || 'sem estimativa'}` }, 'Aprovar e criar no Jira');
    if (!ok) return;
    let r;
    try {
      r = await jira.criarSubtarefa(s.secrets, { key: t.chave, site: t.site }, { resumo: c.titulo, descricao: descricaoJira(t, c), estimativa: c.estimativa, atribuirAMim: c.vinculado });
    } catch (e) { return vscode.window.showErrorMessage(`Subtarefa não criada: ${e.message}`); }
    const l = tarefasDe(s.pasta(t.chave)), x = l.find((y) => y.id === id);
    Object.assign(x, { status: 'aprovada', jira: r.key });
    (x.historico ||= []).push({ em: new Date().toISOString(), evento: 'aprovada', texto: `Aprovada: subtarefa ${r.key} criada no Jira` });
    s.gravar(t.chave, TAREFAS, l);
    s.notificar(t.chave, 'jira', `subtarefa ${r.key} criada`);
    vscode.window.showInformationMessage(`${id} aprovada: subtarefa ${r.key} criada em ${t.chave}.${r.aviso ? ` Atenção: ${r.aviso}.` : ''}`);
    s.render();
  },
  async qaAprovar(t, c) {
    if (!t?.chave || c?.tipo !== 'qa') return; // só pelo tarefaAprovar
    const plano = lerTexto(c.arquivo || '');
    if (!plano) return vscode.window.showErrorMessage(`Plano de testes não encontrado: ${c.arquivo || '(sem arquivo)'}`);
    let existente = null;
    try {
      const j = s.cacheJira[t.chave] || await jira.buscar(s.secrets, { key: t.chave, site: t.site });
      existente = (j.subtarefas || []).find((s) => QA_EXISTENTE.test(s.resumo || ''));
    } catch (e) { return vscode.window.showErrorMessage(`Não consegui ler as subtarefas de ${t.chave}: ${e.message}`); }
    const ok = await vscode.window.showWarningMessage(existente
      ? `Aprovar o plano de testes? A subtarefa ${existente.key} (“${existente.resumo}”) já existe em ${t.chave}: a descrição dela será substituída pelo plano.`
      : `Aprovar o plano de testes? A subtarefa “${c.titulo}” será criada no Jira, no ticket ${t.chave}.`, { modal: true,
      detail: `${c.resumo || ''}\nResponsável: ${c.vinculado ? 'você' : 'sem responsável'} · Estimativa original: ${c.estimativa || 'sem estimativa'}` },
      existente ? 'Aprovar e atualizar no Jira' : 'Aprovar e criar no Jira');
    if (!ok) return;
    let key, aviso;
    try {
      if (existente) { await jira.atualizarDescricao(s.secrets, { site: t.site }, existente.key, plano); key = existente.key; }
      else ({ key, aviso } = await jira.criarSubtarefa(s.secrets, { key: t.chave, site: t.site }, { resumo: c.titulo, descricao: plano, estimativa: c.estimativa, atribuirAMim: c.vinculado }));
    } catch (e) { return vscode.window.showErrorMessage(`Plano de testes não enviado: ${e.message}`); }
    const l = tarefasDe(s.pasta(t.chave)), x = l.find((y) => y.id === c.id);
    Object.assign(x, { status: 'aprovada', jira: key });
    (x.historico ||= []).push({ em: new Date().toISOString(), evento: 'aprovada', texto: existente ? `Aprovada: descrição de ${key} atualizada` : `Aprovada: subtarefa ${key} criada no Jira` });
    s.gravar(t.chave, TAREFAS, l);
    s.notificar(t.chave, 'jira', `subtarefa ${key} [QA] ${existente ? 'atualizada' : 'criada'}`);
    vscode.window.showInformationMessage(`Plano de testes aprovado: ${existente ? `${key} atualizada` : `${key} criada`} em ${t.chave}.${aviso ? ` Atenção: ${aviso}.` : ''}`);
    delete s.cacheJira[t.chave];
    s.render();
  },
  // Revisão de card já no Jira: aplica o texto novo (descrição/título/estimativa) e comenta na subtarefa o motivo,
  // quem pediu a mudança (autor do comentário, com o link) e quem aplicou.
  async revisaoAplicar({ id }) {
    const t = s.ticketAberto();
    const c = t && tarefasDe(s.pasta(t.chave)).find((x) => x.id === id);
    if (!c?.revisao || !c.jira) return;
    const novo = { ...c, ...c.revisao.campos };
    const descricao = c.tipo === 'qa' ? lerTexto(c.arquivo || '') : descricaoJira(t, novo);
    const origem = impactosDe(s.pasta(t.chave)).find((i) => i.link === c.revisao.comentario);
    const ok = await vscode.window.showWarningMessage(`Aplicar a alteração em ${c.jira}?`, { modal: true,
      detail: `A descrição de ${c.jira} será substituída${c.revisao.campos.titulo ? ' (e o título)' : ''} e um comentário vai registrar o motivo.\n\nMotivo: ${c.revisao.motivo}${origem ? `\nMudança pedida por: ${origem.autor}` : ''}` }, 'Aplicar no Jira');
    if (!ok) return;
    let r = {}, eu = { nome: os.userInfo().username };
    try {
      r = await jira.atualizarDescricao(s.secrets, { site: t.site }, c.jira, descricao, { titulo: c.revisao.campos.titulo, estimativa: c.revisao.campos.estimativa });
      try { eu = await jira.eu(s.secrets, t.site); } catch {}
      await jira.comentar(s.secrets, { key: c.jira, site: t.site }, ['🔄 **Descrição atualizada pela Crafting Table**', '',
        `**Motivo:** ${c.revisao.motivo}`,
        origem ? `**Mudança pedida por:** ${origem.autor} — [comentário em ${t.chave}](${origem.link})` : c.revisao.comentario ? `**Origem:** [comentário](${c.revisao.comentario})` : null,
        `**Alteração feita por:** ${eu.nome}`].filter((x) => x !== null).join('\n'));
    } catch (e) { return vscode.window.showErrorMessage(`Alteração não aplicada em ${c.jira}: ${e.message}`); }
    const l = tarefasDe(s.pasta(t.chave)), x = l.find((y) => y.id === id);
    Object.assign(x, x.revisao.campos);
    (x.historico ||= []).push({ em: new Date().toISOString(), evento: 'revisao', texto: `Alteração aplicada em ${c.jira} (${x.revisao.motivo.slice(0, 120)})` });
    delete x.revisao;
    s.gravar(t.chave, TAREFAS, l);
    s.notificar(t.chave, 'jira', `subtarefa ${c.jira} atualizada${origem ? ` por mudança de ${origem.autor}` : ''}`);
    vscode.window.showInformationMessage(`${c.jira} atualizada e comentada.${r.aviso ? ` Atenção: ${r.aviso}.` : ''}`);
    s.render();
  },
  async revisaoDescartar({ id }) {
    const t = s.ticketAberto();
    const l = t ? tarefasDe(s.pasta(t.chave)) : [], x = l.find((y) => y.id === id);
    if (!x?.revisao) return;
    const ok = await vscode.window.showWarningMessage(`Descartar a alteração proposta para ${x.jira || id}?`, { modal: true, detail: 'A subtarefa no Jira fica como está.' }, 'Descartar');
    if (!ok) return;
    (x.historico ||= []).push({ em: new Date().toISOString(), evento: 'revisao', texto: `Alteração descartada (${x.revisao.motivo.slice(0, 120)})` });
    delete x.revisao;
    s.gravar(t.chave, TAREFAS, l);
    s.render();
  },
  async tarefaReprovar({ id }) {
    const t = s.ticketAberto();
    if (!t?.chave || tarefasDe(s.pasta(t.chave)).find((x) => x.id === id)?.status !== 'pendente') return;
    const motivo = await vscode.window.showInputBox({ title: `Reprovar ${id}`, prompt: 'Motivo (opcional): vai para o Claude na análise de consistência', ignoreFocusOut: true });
    if (motivo === undefined) return;
    const l = tarefasDe(s.pasta(t.chave)), x = l.find((y) => y.id === id);
    Object.assign(x, { status: 'reprovada', motivo: motivo.trim() });
    (x.historico ||= []).push({ em: new Date().toISOString(), evento: 'reprovada', texto: `Reprovada${motivo.trim() ? `: ${motivo.trim()}` : ''}` });
    s.gravar(t.chave, TAREFAS, l);
    s.render();
  },
  // Pedido de alteração: o card fica "Claude alterando" e entra na fila; o Claude roda assim que estiver livre.
  tarefaAlterar({ id, texto }) {
    const t = s.ticketAberto();
    const l = t ? tarefasDe(s.pasta(t.chave)) : [], x = l.find((y) => y.id === id);
    if (!x || x.status !== 'pendente' || !String(texto || '').trim()) return;
    Object.assign(x, { status: 'em_alteracao', alteracao: texto.trim(), fila: true });
    (x.historico ||= []).push({ em: new Date().toISOString(), evento: 'alteracao', texto: `Alteração pedida: ${texto.trim()}` });
    s.gravar(t.chave, TAREFAS, l);
    s.render();
    s.orq.filaTarefas(t);
  }
});

module.exports = { telaTarefas, script, CSS, acoes };
