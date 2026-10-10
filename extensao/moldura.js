// @ts-check
// Moldura compartilhada do ticket: cabeçalho (abas, badges), rodapé (notificações, comandos), CSS e a página HTML da webview.
// O painel.js desenha o corpo; o grupo.js usa cabecalho/rodape/CSS_MOLDURA das outras seções via provider.moldura.
const path = require('path');
const { esc } = require('./ticket')._teste;
const jira = require('./ticket').jira;
const { ESTILO_NOTAS } = require('./comandos').ui;
const sessao = require('./sessao');
const { lerTexto, duvidasDe, tarefasDe } = require('./refinamento/locais');
const { IC } = require('./componentes/icones');
const { quando } = require('./componentes/formato');
const { LIDAS, ICONE_NOTIF, notifsDe, cmdsAberto } = require('./notificacoes');
const aoVivo = require('./componentes/ao-vivo');
const menuAbas = require('./componentes/menu-abas');
const abaDocs = require('./componentes/aba-docs');
const pill = require('./componentes/pill');
const listaTickets = require('./componentes/lista-tickets');
const vinculados = require('./componentes/vinculados');
const configuracao = require('./configuracao/configuracao');
const tarefas = require('./refinamento/tarefas');
const mudancas = require('./refinamento/mudancas');
const spec = require('./refinamento/spec');
const analise = require('./refinamento/analise');
const { emRefino, botaoRefino, pillRefino } = spec;
const acoesQa = require('./qa/acoes');
const duvidas = require('./refinamento/duvidas');
const notas = require('./notas').editor;
const { SEM_TICKET } = require('./componentes/card-ticket');
const { pastaDe, pastaAba, naRaiz } = require('./pastas');
const PRINCIPAL = 'claudeAbas.painel';

// Abas do menu do ticket em cada lista (componentes/menu-abas.js): { id, nome } = aba desta página, { secao, nome } = outra seção.
// Evidências é só do QA, logo depois de Docs.
const EVID = 'claudeAbas.evidencias';
const DOCS = { id: 'docs', nome: 'Docs' }, TICKET = { id: 'ticket', nome: 'Ticket' }, DECISOES = { id: 'decisoes', nome: 'Decisões' };
const ABAS = {
  refinamento: [DOCS, { id: 'spec', nome: 'Spec' }, TICKET, { id: 'analise', nome: 'Análise' }, { id: 'tarefas', nome: 'Tarefas' }, DECISOES, { id: 'duvidas', nome: 'Dúvidas' }],
  impl: [DOCS, TICKET, DECISOES],
  qa: [DOCS, { secao: EVID, nome: 'Evidências' }, TICKET, DECISOES, { id: 'massa', nome: 'Massa' }],
  semTicket: [DOCS, DECISOES]
};
/** @returns {{ id?: string, secao?: string, nome: string }[]} */
const abasDe = (t) => ABAS[t.id === SEM_TICKET ? 'semTicket' : sessao.focoLista()] || ABAS.impl;
const FORA = () => require('./grupo')._teste.GRUPOS['claudeAbas.tickets'].slice(1).filter(([id]) => id !== EVID);

// Cabeçalho e rodapé do ticket aberto: na página do painel os botões falam com ele direto (data-acao);
// na moldura de outra seção, passam pelo grupo.js (data-painel / data-secao).
const CSS_MOLDURA = `<style>
  .ct-cab { position: sticky; top: 0; z-index: 100; flex: none; padding: 8px 10px 0; background: var(--bg);
    border-bottom: 1px solid var(--border); font-family: var(--fc-font); color: var(--text); }
  .ct-linha { display: flex; align-items: center; gap: 4px; }
  .ct-titulo { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ct-titulo .ct-chave { font-family: var(--fc-font); color: var(--accent); }
  .ct-ico.ct-play { color: var(--ia); }
  .ct-ico.ct-pausa { color: var(--warn); }
  .ct-dar { flex: none; height: 26px; padding: 0 10px; border: 0; border-radius: var(--r-md); background: var(--ia); color: var(--on-cor); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
    animation: ct-chama 1.4s infinite; }
  .ct-dar:disabled { background: color-mix(in srgb, var(--ia) 35%, transparent); animation: none; cursor: default; font-weight: 400; }
  @keyframes ct-chama { 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--ia) 30%, transparent); } }
  /* Modo refinamento: borda roxa em volta da view inteira */
  .ct-roxo { position: fixed; inset: 0; border: 2px solid var(--ia); border-radius: var(--r-sm); pointer-events: none; z-index: 300;
    box-shadow: inset 0 0 14px color-mix(in srgb, var(--ia) 22%, transparent); }
  /* Pills do topo: coluna do ticket no Jira e modo refinamento, lado a lado à esquerda */
  .ct-pills { margin: 8px 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  ${pill.CSS}
  .ct-pills .ct-ico { width: 22px; height: 22px; } .ct-pills .ct-ico svg { width: 13px; height: 13px; }
  ${menuAbas.CSS}
  .ct-rod { flex: none; height: 30px; display: flex; align-items: center; padding: 0 8px; border-top: 1px solid var(--border);
    background: var(--bg); font-family: var(--fc-font); font-size: 11.5px; color: var(--text-dim); }
  .ct-rod details { position: relative; }
  .ct-rod details[open] .ct-badge { display: none; }
  .ct-notif { display: flex; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 11.5px; line-height: 1.45; }
  .ct-notif:last-child { border-bottom: 0; }
  .ct-notif small { color: var(--text-dim); }
  .ct-notif.nova .ct-ni { color: var(--accent); }
  .ct-ni { flex: none; width: 12px; text-align: center; }
  .ct-rod summary { list-style: none; cursor: pointer; text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 11.5px; margin: 0; color: inherit; display: inline-flex; align-items: center; gap: 5px; padding: 3px 6px; border-radius: var(--r-md); }
  .ct-rod summary::-webkit-details-marker { display: none; }
  .ct-rod summary:hover { background: var(--surface-2); color: var(--text); }
  .ct-rod summary svg { width: 14px; height: 14px; }
  .ct-cmd { display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 4px; border: 0; border-radius: var(--r-md); background: none; cursor: pointer;
    font: inherit; font-size: 11.5px; color: var(--text); text-align: left; }
  .ct-cmd:hover { background: var(--surface-2); }
  .ct-cmd .ct-ci { flex: none; display: flex; color: var(--ok); }
  .ct-cmd.on .ct-ci { color: var(--perigo, var(--danger)); }
  .ct-cmd svg { width: 12px; height: 12px; }
  .ct-cmd:disabled { opacity: .55; cursor: default; }
  .ct-cmd small { color: var(--text-dim); }
  .ct-cmd-grupo { margin: 8px 0 2px; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-dim); }
  .ct-cmd-vazio { color: var(--text-dim); padding: 2px 0; }
  .ct-amb { display: inline-flex; align-items: center; gap: 6px; padding: 3px 6px; border: 0; border-radius: var(--r-md); background: none; cursor: pointer;
    font: inherit; font-size: 11.5px; color: inherit; }
  .ct-amb:hover { background: var(--surface-2); color: var(--text); }
  .ct-luz { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--text-dim); }
  .ct-luz.ok { background: var(--ok); }
  .ct-luz.prep { background: var(--ia); animation: ct-pisca 1.2s infinite; }
  .ct-luz.erro { background: var(--danger); box-shadow: 0 0 6px var(--danger); }
  .ct-luz.erro.pisca { animation: ct-pisca .8s infinite; }
  @keyframes ct-pisca { 50% { opacity: .2; } }
  .ct-badge-erro { background: var(--danger); }
  .ct-notifs { position: absolute; bottom: 30px; left: 0; width: min(320px, 90vw); max-height: 280px; overflow: auto; padding: 10px 12px; border-radius: var(--r-lg);
    background: var(--surface); border: 1px solid var(--border); box-shadow: 0 8px 30px rgb(0 0 0 / 53%); }
</style>`;

function cabecalho(t, { aba, secao, dentro = false }) {
  const b = (cmd) => (dentro ? `data-acao="${cmd}"` : `data-painel="${cmd}"`);
  const semTicket = t.id === SEM_TICKET;
  const refino = !semTicket && naRaiz();
  const contador = (id) => (id === 'duvidas' ? [duvidasDe(pastaDe(t.id)).filter((x) => !x.resposta).length, 'dúvida(s) em aberto: a spec só avança quando todas forem respondidas']
    : id === 'tarefas' ? [tarefasDe(pastaDe(t.id)).filter((x) => x.status === 'pendente' || x.revisao).length, 'tarefa(s) esperando sua decisão'] : [0, '']);
  const itens = [...abasDe(t).map((a) => { const [badge, dica] = contador(a.id); return { ...a, badge, dica: `${badge} ${dica}` }; }),
    '|', ...FORA().map(([secao, nome]) => ({ secao, nome }))];
  return `<header class="ct-cab"><div class="ct-linha">
      <button class="ct-ico" ${dentro ? 'data-acao="voltar"' : `data-secao="${PRINCIPAL}" data-cmd="voltar"`} title="Voltar para a lista de tickets">${IC.voltar}</button>
      <span class="ct-titulo">${semTicket ? 'Sem ticket' : `<span class="ct-chave">${esc(t.chave)}</span> · ${esc(t.titulo || '')}`}</span>
      ${refino ? botaoRefino(t, b) : !semTicket && sessao.focoLista() === 'qa' ? acoesQa.botaoPlay(pastaAba(t.id), b) : ''}
      <button class="ct-ico" ${b('claude')} title="Abrir a conversa do Claude${semTicket ? '' : ' deste ticket'}">${IC.claude}</button>
      ${semTicket ? '' : `<button class="ct-ico" ${b('jira')} title="Ver o ticket no Jira">${IC.jira}</button>`}
    </div>
    <div class="ct-pills">${semTicket ? pill.pill('Sem ticket vinculado', { grande: true, bola: false, dica: 'Documentos e notas da conversa atual do Claude, que não pertence a nenhum ticket' })
      : `${pill.status(t.status, { grande: true, dica: `Coluna do ticket no board do Jira${t.tipo ? ` · ${t.tipo}` : ''}` })}
      ${refino && emRefino(t) ? pillRefino(t) : ''}
      <button class="ct-ico" ${b('atualizar')} title="Atualizar status e anexos do Jira">${IC.atualizar}</button>`}</div>
    ${refino && emRefino(t) && t.refinamento.estado !== 'pausado' ? '<div class="ct-roxo"></div>' : ''}
    ${menuAbas.menu(itens, { aba, secao, principal: PRINCIPAL, dentro })}
  </header>`;
}

// Notificações (notificacoes.js). Abrir o 🔔 marca como lidas (o contador some pelo CSS na hora e no próximo desenho pelo arquivo).
const rodape = (t, dentro = false) => {
  const dir = t && pastaAba(t.id);
  const l = notifsDe(dir), lidas = Date.parse((dir && lerTexto(path.join(dir, LIDAS))) || '') || 0;
  const nova = (n) => Date.parse(n.em) > lidas; // o hook (Python) e o sdd-state (JS) escrevem ISO em formatos diferentes
  const novas = l.filter(nova).length;
  const cmds = require('./comandos').api?.lista() || [], emus = require('./emulador').api?.lista() || [];
  const acao = dentro ? 'data-acao' : 'data-painel';
  const caixaCmds = `<details class="ct-cmds"${cmdsAberto() ? ' open' : ''}><summary ${acao}="cmdsAlternar">${IC.play} Comandos</summary>
    <div class="ct-notifs">${cmds.length ? cmds.map((c) => `<button class="ct-cmd ${c.rodando ? 'on' : ''}" ${acao}="cmdAlternar" data-id="${esc(c.id)}"
      title="${c.rodando ? 'Parar' : 'Executar'}"><span class="ct-ci">${c.rodando ? IC.parar : IC.play}</span>${esc(c.nome)}</button>`).join('') : '<div class="ct-cmd-vazio">Nenhum comando. Cadastre em Configurações → Comandos.</div>'}
    ${emus.length ? `<div class="ct-cmd-grupo">Emuladores</div>${emus.map((c) => `<button class="ct-cmd ${c.rodando ? 'on' : ''}" ${acao}="emuAlternar" data-id="${esc(c.id)}" ${c.ocupado ? 'disabled' : ''}
      title="${esc(c.ocupado || (c.rodando ? 'Desligar' : 'Ligar'))}"><span class="ct-ci">${c.rodando ? IC.parar : IC.play}</span>${esc(c.nome)}${c.ocupado ? ` <small>${esc(c.ocupado)}</small>` : ''}</button>`).join('')}` : ''}</div></details>`;
  // QA: ambiente depois de Comandos. Preparando → abre o log ao vivo; erro → luz vermelha piscando e bolinha até abrir a análise (Evidências).
  const caixaAmb = t && t.id !== SEM_TICKET && sessao.focoLista() === 'qa' ? acoesQa.caixaAmbiente(dir, acao) : '';
  return `<footer class="ct-rod"><details><summary ${dentro ? 'data-acao' : 'data-painel'}="notifLidas">${IC.sino} Notificações
    ${novas ? `<span class="ct-badge">${novas}</span>` : ''}</summary>
  <div class="ct-notifs">${l.length ? l.map((n) => `<div class="ct-notif ${nova(n) ? 'nova' : ''}"><span class="ct-ni">${ICONE_NOTIF[n.tipo] || '•'}</span>
    <span>${esc(n.texto)}<br><small>${esc(quando(n.em))}</small></span></div>`).join('') : 'Nenhuma notificação ainda.'}</div></details>${caixaCmds}${caixaAmb}</footer>`;
};

const estilo = ESTILO_NOTAS + CSS_MOLDURA + `<style>
  .tipo { flex: none; font-size: 9.5px; font-weight: 600; padding: 1px 7px; border-radius: var(--r-pill); color: var(--cor); background: color-mix(in srgb, var(--cor) 15%, transparent); }
  .t-tecnico { --cor: var(--ia); } .t-funcional { --cor: var(--warn); } .t-spec { --cor: var(--ok); }
  .secundario { flex: none; height: 34px; padding: 0 12px; border-radius: var(--r-md); font-size: 12px; font-weight: 600;
    color: var(--ok) !important; border: 1px solid color-mix(in srgb, var(--ok) 55%, transparent) !important; background: var(--surface) !important; box-shadow: var(--sombra); }
  .secundario:hover { background: color-mix(in srgb, var(--ok) 14%, transparent) !important; }
  ${spec.CSS}
  /* Detalhe */
  .menu { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; max-width: 100%; }
  .menu .fb-btn { flex: none; padding: 0 6px; font-size: 11.5px; }
  .menu::-webkit-scrollbar { display: none; }
  .aba[hidden] { display: none; }
  .folha { padding: 12px 14px; }
  .folha h3 { margin: 0 0 6px; font-size: 13px; }
  .vazio-aba { color: var(--text-dim); font-size: 12px; line-height: 1.6; text-align: center; padding: 18px 6px; }
  .acoes-aba { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .md { font-size: 12.5px; line-height: 1.55; }
  .md h3, .md h4, .md h5, .md h6 { margin: .8em 0 .3em; } .md h3:first-child { margin-top: 0; }
  .md pre { background: var(--surface-2); padding: 8px; border-radius: var(--r-md); white-space: pre-wrap; font-size: 11.5px; }
  .md code { font-family: var(--fc-mono); font-size: .92em; }
  .md ul { padding-left: 1.3em; margin: .3em 0; }
  .ticket-link { font-family: var(--fc-mono); font-size: 13px; color: var(--accent); word-break: break-all; }
  /* Decisões: histórico; clique expande o resumo embaixo */
  .hist { display: flex; flex-direction: column; }
  .decisao { border-left: 2px solid var(--border); margin-left: 4px; padding: 0 0 2px 12px; position: relative; }
  .decisao::before { content: ''; position: absolute; left: -5px; top: 9px; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
  .decisao summary { list-style: none; cursor: pointer; display: flex; align-items: baseline; gap: 8px; padding: 5px 6px; border-radius: var(--r-md); }
  .decisao summary::-webkit-details-marker { display: none; }
  .decisao summary:hover { background: var(--surface-2); }
  .quando { flex: none; font-family: var(--fc-font); font-size: 10.5px; color: var(--text-dim); }
  .dtitulo { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .decisao[open] .dtitulo { white-space: normal; }
  .origem { flex: none; font-size: 9.5px; padding: 0 6px; border-radius: var(--r-pill); border: 1px solid var(--border); color: var(--text-dim); }
  .o-pergunta { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .dresumo { margin: 2px 6px 10px; padding: 8px 10px; border-radius: var(--r-md); background: var(--surface-2); font-size: 12px; line-height: 1.55; }
  .dresumo p { margin: 0 0 6px; }
  .dtrecho { font-size: 11.5px; color: var(--text-dim); }
  ${tarefas.CSS}
  ${mudancas.CSS}
  .md table { border-collapse: collapse; margin: 6px 0; font-size: 11.5px; }
  .md th, .md td { border: 1px solid var(--border); padding: 3px 7px; text-align: left; }
  .md th { background: var(--surface-2); }
  .previa-acoes { display: flex; gap: 8px; padding: 6px 0 8px; }
  .previa-acoes button { height: 28px; padding: 0 12px; border: 1px solid var(--border) !important; border-radius: var(--r-md); font-size: 12px; }
  .previa-acoes .primario { border-color: transparent !important; }
  ${aoVivo.CSS}
  ${duvidas.CSS}
  .dtrecho .esc { color: var(--ok); }

  /* Painel do ticket */
  html, body { height: 100%; }
  body { display: flex; flex-direction: column; }
  .rolagem { flex: 1; min-height: 0; overflow-y: auto; padding-top: 10px; }
  .caixa-t { margin: 0 12px 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); display: flex; gap: 6px; }
  .caixa-t span { margin-left: auto; text-transform: none; letter-spacing: 0; }
  ${analise.CSS}
  .erro { color: var(--danger); font-size: 12px; margin: 0 12px 8px; }
  ${abaDocs.CSS}
  ${listaTickets.CSS}
  ${configuracao.CSS}
</style><style>${jira.estiloDetalhe}</style>`;

// Aviso no topo quando o instalar.sh precisa rodar de novo (preenchido por conferirInstalacao).
const bannerInstalacao = () => (configuracao.aviso() ? `<div style="padding:8px 10px;background:var(--accent-soft);color:var(--on-cor);font:12px var(--fc-font)">
  <b>Atualização pendente</b><div style="margin:2px 0 6px;opacity:.85">${esc(configuracao.aviso().motivos.join(' · '))}</div>
  <button data-acao="atualizarExtensao" style="height:24px;padding:0 10px;border-radius:6px;background:var(--bg);color:var(--text);font-size:11.5px">Atualizar agora</button></div>` : '');
function pagina(nonce, corpo, nota) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>body { font-family: var(--fc-font); margin: 0; } button { font: inherit; cursor: pointer; border: 0; background: none; color: inherit; } [hidden] { display: none !important; }</style>
${nota ? notas.CSS_NOTAS : ''}</head><body>${bannerInstalacao()}${corpo}
${nota ? `<script nonce="${nonce}">${notas.scriptNotas(nota.html, nota.sid, nota.estilo)}</script>` : ''}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const enviar = (m) => vscode.postMessage(m);
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-acao]');
    if (!el) return;
    e.stopPropagation();
    enviar({ acao: el.dataset.acao, id: el.dataset.id, op: el.dataset.op, key: el.dataset.key });
  });

  // Decisões abertas continuam abertas depois do redesenho.
  const abertas = new Set((vscode.getState() || {}).decisoes || []);
  document.querySelectorAll('[data-dec]').forEach((d) => {
    if (abertas.has(d.dataset.dec)) d.open = true;
    d.addEventListener('toggle', () => {
      d.open ? abertas.add(d.dataset.dec) : abertas.delete(d.dataset.dec);
      vscode.setState({ ...(vscode.getState() || {}), decisoes: [...abertas] });
    });
  });

  // Lista de tickets: pesquisa, ordem e os seletores da caixa de vinculados.
  ${listaTickets.script('ticketsAntigos')}
  ${vinculados.script()}

  ${spec.scriptPilha()}

  // A página é redesenhada a cada linha nova do Ao vivo: a caixa e o corpo voltam para onde estavam.
  ${aoVivo.script('vivo')}
  const corpo = document.querySelector('main.rolagem');
  if (corpo) {
    corpo.scrollTop = (vscode.getState() || {}).rolagem || 0;
    corpo.addEventListener('scroll', () => vscode.setState({ ...(vscode.getState() || {}), rolagem: corpo.scrollTop }));
  }

  ${tarefas.script()}
</script></body></html>`;
}

module.exports = { PRINCIPAL, CSS_MOLDURA, abasDe, cabecalho, rodape, estilo, pagina };
