// @ts-check
const { esc } = require('./texto');
const { provedorAtivo } = require('../provedores');
const { OPERACOES } = require('../provedores/contrato');

// Fachada do provedor de gestão de trabalho (provedores/): cada operação vai para o provedor ativo, escolhido na hora da
// chamada (trocar de provedor nas configurações vale sem recarregar). Aqui fica só a UI do ticket (aba Ticket e pills).
const operacoes = Object.fromEntries(OPERACOES.map((op) => [op, (...a) => provedorAtivo()[op](...a)]));

// Estilo da folha do ticket (aba Ticket do painel).
const estiloDetalhe = `
  /* ── Detalhe: o conteúdo fica numa folha, como a nota ── */
  .folha { margin: 0 12px 12px; padding: 12px 14px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--sombra); }
  .folha h3 { margin: 0 0 8px; font-size: 14px; line-height: 1.35; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
  .meta span { font-size: 10.5px; padding: 1px 8px; border-radius: var(--r-pill); color: var(--text-dim); border: 1px solid var(--border); }
  .meta span.status { color: var(--cor); border-color: color-mix(in srgb, var(--cor) 40%, transparent); background: color-mix(in srgb, var(--cor) 12%, transparent); }
  .horas { display: flex; gap: 6px; margin: 0 0 4px; }
  .horas div { flex: 1; border-radius: var(--r-md); padding: 6px 8px; display: flex; flex-direction: column; gap: 2px; background: var(--surface-2); }
  .horas small { color: var(--text-dim); font-size: 10px; }
  .horas b { font-size: 13px; }
  details { margin-top: 14px; }
  summary { cursor: pointer; font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); margin-bottom: 8px; }
  details ul li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--r-md); cursor: pointer; }
  details ul li:hover { background: var(--surface-2); }
  details ul .key { font-family: var(--fc-font); font-size: 11.5px; font-weight: 600; color: var(--accent); white-space: nowrap; }
  details ul .resumo { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  details ul .status { font-size: 10px; color: var(--text-dim); white-space: nowrap; }
  .descricao { font-size: 12.5px; line-height: 1.55; }
  .descricao img { max-width: 100%; }
  .descricao table { display: block; overflow-x: auto; max-width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
  .descricao th, .descricao td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; vertical-align: top; min-width: 60px; }
  .descricao th { background: var(--surface-2); font-weight: 600; }
  .descricao pre, .descricao code { white-space: pre-wrap; word-break: break-word; font-family: var(--fc-mono); }
  .descricao .confluence-information-macro, .descricao .panel { border-left: 3px solid var(--accent); padding: 4px 10px; margin: 8px 0; }
  .comentario { padding: 8px 0; border-top: 1px solid var(--border); }
  .comentario:first-of-type { border-top: none; padding-top: 0; }
  .comentario .autor { font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
`;

const corStatus = (st = '') => /conclu|done|fechad|resolv|pronto p\/ ?qa|homolog/i.test(st) ? 'ok'
  : /andamento|progress|desenv|review|revis|teste|qa/i.test(st) ? 'andando' : 'novo';

// A descrição vem como HTML do próprio Jira; a CSP acima impede que scripts dela rodem.
const dataBr = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// Só o conteúdo do ticket (sem topo e botões): também usado na aba Ticket do painel.
const folhaTicket = (t) => `
  <div class="folha st-${corStatus(t.status)}">
    <h3>${esc(t.resumo)}</h3>
    <div class="meta"><span class="status">${esc(t.status)}</span><span>${esc(t.prioridade)}</span><span>${esc(t.responsavel)}</span></div>
    <div class="horas">
      <div><small>Estimativa original</small><b>${esc(t.horas.original || '—')}</b></div>
      <div><small>Restante</small><b>${esc(t.horas.restante || '—')}</b></div>
      <div><small>Registrado</small><b>${esc(t.horas.registrado || '—')}</b></div>
    </div>
    ${t.subtarefas.length ? `<details open><summary>Subtarefas (${t.subtarefas.length})</summary><ul>${t.subtarefas.map((s) => `
      <li data-acao="abrir" data-key="${esc(s.key)}" title="${esc(s.tipo)}${s.responsavel ? ' · ' + esc(s.responsavel) : ''}">
        <span class="key">${esc(s.key)}</span><span class="resumo">${esc(s.resumo)}</span><span class="status">${esc(s.status)}</span>
      </li>`).join('')}</ul></details>` : ''}
    <details open><summary>Descrição</summary><div class="descricao">${t.descricao}</div></details>
    <details open><summary>Comentários (${t.comentarios.length})</summary>
      ${t.comentarios.length ? t.comentarios.map((c) => `<div class="comentario">
        <div class="autor"><b>${esc(c.autor)}</b> · ${esc(dataBr(c.data))}</div>
        <div class="descricao">${c.corpo}</div>
      </div>`).join('') : '<p class="vazio">Nenhum comentário.</p>'}
    </details>
  </div>`;

exports.jira = { ...operacoes, get nome() { return provedorAtivo().nome; }, get capacidades() { return provedorAtivo().capacidades; }, folhaTicket, corStatus, estiloDetalhe };
