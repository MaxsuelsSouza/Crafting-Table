// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { esc } = require('../infra/texto');
const { pagina, ESTILO_NOTAS } = require('./comandos').ui;
const { icone } = require('../componentes/botao');
const sessao = require('../infra/ticket/sessao');
const transcricao = require('../componentes/transcricao');

// Conversas do Claude Code deste projeto e tudo o que cada uma deixou na máquina.
// O Claude guarda o histórico em ~/.claude/projects/<cwd com não-alfanuméricos trocados por ->/<id>.jsonl.
const CLAUDE = path.join(os.homedir(), '.claude');
const projeto = () => path.join(CLAUDE, 'projects', sessao.workspace().replace(/[^a-zA-Z0-9]/g, '-'));
// Histórico de uma conversa: no projeto atual ou em qualquer outro (conversa de ticket aberta em outro repositório).
function historico(sid) {
  const aqui = path.join(projeto(), `${sid}.jsonl`);
  if (fs.existsSync(aqui)) return aqui;
  let dirs = [];
  try { dirs = fs.readdirSync(path.join(CLAUDE, 'projects')); } catch {}
  return dirs.map((d) => path.join(CLAUDE, 'projects', d, `${sid}.jsonl`)).find((f) => fs.existsSync(f)) || aqui;
}

// Tudo o que é da conversa: histórico, subagentes, documentos/notas/evidências, backups de edição, env.
const rastros = (sid) => [
  historico(sid), path.join(path.dirname(historico(sid)), sid),
  path.join(sessao.RAIZ, sid), path.join(CLAUDE, 'file-history', sid), path.join(CLAUDE, 'session-env', sid)
].filter((p) => fs.existsSync(p));

// Título: o último ai-title/custom-title do arquivo; sem ele, o começo da primeira mensagem.
function titulo(arquivo) {
  let t = null, primeira = null;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    if (!linha.includes('title') && primeira) continue;
    try {
      const d = JSON.parse(linha);
      if (d.type === 'custom-title' || d.type === 'ai-title') t = d.customTitle || d.aiTitle || t;
      if (!primeira && d.type === 'user' && typeof d.message?.content === 'string') primeira = d.message.content.slice(0, 80);
    } catch {}
  }
  return t || primeira || '(sem título)';
}

const contar = (dir) => { try { return fs.readdirSync(dir).filter((n) => !n.startsWith('.') && n !== 'evidencias').length; } catch { return 0; } };

function listar() {
  let nomes = [];
  // Com um ticket aberto no painel: só as conversas dele na aba em que foi aberto, de qualquer projeto.
  const tk = require('../infra/ticket/tickets');
  const doTicket = sessao.foco() && tk.ler(sessao.foco())?.conversas.filter((sid) => tk.listaDa(sid) === sessao.focoLista());
  if (doTicket) nomes = doTicket.map((sid) => `${sid}.jsonl`).filter((n) => fs.existsSync(historico(n.slice(0, -6))));
  else try { nomes = fs.readdirSync(projeto()).filter((n) => n.endsWith('.jsonl')); } catch { nomes = []; }
  if (!doTicket) { // sessões em segundo plano fora de pasta de ticket (anexarConversa): de qualquer projeto
    let av = []; try { av = fs.readFileSync(path.join(require('../infra/agentes/area-ia').RAIZ, 'avulsas.txt'), 'utf8').split('\n').filter(Boolean); } catch {}
    nomes = [...new Set([...nomes, ...av.map((sid) => `${sid}.jsonl`).filter((n) => fs.existsSync(historico(n.slice(0, -6))))])];
  }
  return nomes.map((n) => {
    const sid = n.slice(0, -6);
    const arq = historico(sid);
    const docs = path.join(sessao.RAIZ, sid);
    return {
      sid, titulo: titulo(arq), mtime: fs.statSync(arq).mtimeMs,
      documentos: contar(docs), evidencias: contar(path.join(docs, 'evidencias')),
      notas: fs.existsSync(path.join(docs, '.notas.html'))
    };
  }).sort((a, b) => b.mtime - a.mtime);
}

const estiloConversas = ESTILO_NOTAS + `<style>
  .folha { padding: 4px; }
  .grupo { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); margin: 6px 8px 4px; }
  ul.conversas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
  ul.conversas > li { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: var(--r-md); cursor: pointer; }
  ul.conversas > li:hover { background: var(--surface-2); }
  ul.conversas > li.atual { background: color-mix(in srgb, var(--ok) 10%, transparent); box-shadow: inset 2px 0 0 var(--ok); }
  .corpo { flex: 1; min-width: 0; }
  .titulo { font-size: 12.5px; display: flex; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; }
  .titulo span { overflow: hidden; text-overflow: ellipsis; }
  .agora { flex: none; font-style: normal; font-size: 9.5px; font-weight: 600; padding: 0 6px; border-radius: var(--r-pill); color: var(--ok); background: color-mix(in srgb, var(--ok) 15%, transparent); }
  .meta { display: flex; align-items: center; gap: 10px; margin-top: 3px; font-size: 10.5px; color: var(--text-dim); }
  .meta .n { display: inline-flex; align-items: center; gap: 3px; }
  .meta svg { width: 12px; height: 12px; }
  .meta .zero { opacity: .45; }
  .del { flex: none; height: 24px; min-width: 24px; padding: 0 6px; border: 0; border-radius: var(--r-md); background: transparent; color: var(--text-dim);
    opacity: 0; transition: opacity 140ms; }
  ul.conversas > li:hover .del { opacity: 1; }
  .del:hover { background: color-mix(in srgb, var(--perigo) 14%, transparent); color: var(--perigo); }
  .marca { flex: none; width: 16px; height: 16px; border-radius: var(--r-sm); border: 1.5px solid var(--text-dim); display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--on-cor); }
  li.sel .marca { background: var(--accent); border-color: var(--accent); }
  ul.conversas > li.sel { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  li.bloqueada .marca { opacity: .25; }
  .primario.perigo { background: var(--danger); }
  .primario.perigo:hover { background: var(--perigo); }
  .primario:disabled { opacity: .4; cursor: default; box-shadow: none; }
  .fb-btn.contador { font-weight: 600; cursor: default; }
  .fb-btn.contador:hover { background: transparent; }
</style>`;

const IC = {
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
  evid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8.5 7l1.5-2.5h4L15.5 7"/></svg>',
  nota: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>'
};

// Agrupa como a lista de sessões do Claude: Hoje, Ontem, Últimos 7 dias, Mais antigas.
function grupoDe(ms) {
  const dia = (d) => new Date(d).setHours(0, 0, 0, 0);
  const dias = Math.round((dia(Date.now()) - dia(ms)) / 86400000);
  return dias === 0 ? 'Hoje' : dias === 1 ? 'Ontem' : dias < 7 ? 'Últimos 7 dias' : 'Mais antigas';
}
const hora = (ms) => new Date(ms).toLocaleString('pt-BR', grupoDe(ms) === 'Hoje' || grupoDe(ms) === 'Ontem' ? { timeStyle: 'short' } : { dateStyle: 'short' });
const cont = (n, ic, rotulo) => `<span class="n ${n ? '' : 'zero'}" title="${n} ${rotulo}">${ic}${n}</span>`;

const tela = (lista, atual, sel = null) => {
  if (!lista.length) return estiloConversas + '<div class="topo"><span class="rotulo">Conversas</span></div><div class="folha"><div class="centro"><div class="icone">💬</div>Nenhuma conversa do Claude neste projeto.</div></div>';
  let grupoAnterior;
  const marcaveis = lista.filter((c) => c.sid !== atual);
  const cab = `<div class="topo"><span class="rotulo">Conversas</span><span class="titulo"></span>
      <span class="extra">${lista.length} conversa${lista.length === 1 ? '' : 's'}</span></div>
    <div class="barras">${sel
      ? `<div class="format-bar">
          <span class="fb-btn contador">${sel.size} selecionada${sel.size === 1 ? '' : 's'}</span>
          <span class="fb-sep"></span>
          <button class="fb-btn" data-acao="todas">${sel.size === marcaveis.length ? 'Nenhuma' : 'Todas'}</button>
          <button class="fb-btn" data-acao="cancelar">Cancelar</button>
        </div>
        <span class="espaco"></span>
        <button class="primario perigo" data-acao="excluirSelecionadas" ${sel.size ? '' : 'disabled'}>Excluir</button>`
      : `<span class="dica">da mais recente para a mais antiga</span><span class="espaco"></span>
        ${marcaveis.length ? '<div class="format-bar"><button class="fb-btn" data-acao="selecionar">Selecionar</button></div>' : ''}`}
    </div>`;
  return `${estiloConversas}${cab}
  ${lista.map((c) => {
    const g = grupoDe(c.mtime);
    const titulo = g !== grupoAnterior ? `${grupoAnterior ? '</ul></div>' : ''}<div class="folha"><div class="grupo">${g}</div><ul class="conversas">` : '';
    grupoAnterior = g;
    const bloqueada = c.sid === atual;
    const marcada = sel?.has(c.sid);
    return `${titulo}<li class="${bloqueada ? 'atual' : ''} ${sel && bloqueada ? 'bloqueada' : ''} ${marcada ? 'sel' : ''}"
      data-acao="${sel ? (bloqueada ? '' : 'marcar') : 'abrir'}" data-id="${esc(c.sid)}" title="${sel ? (bloqueada ? 'A conversa aberta não pode ser excluída' : 'Selecionar') : 'Abrir a conversa'}">
      ${sel ? `<span class="marca">${marcada ? '✓' : ''}</span>` : ''}
      <div class="corpo">
        <div class="titulo"><span>${esc(c.titulo)}</span>${c.sid === atual ? '<em class="agora">aberta</em>' : ''}</div>
        <div class="meta">
          <span>${esc(hora(c.mtime))}</span>
          ${cont(c.documentos, IC.doc, 'documento(s)')}
          ${cont(c.evidencias, IC.evid, 'evidência(s)')}
          ${c.notas ? `<span class="n" title="Tem notas">${IC.nota}</span>` : ''}
        </div>
      </div>
      ${c.sid === atual || sel ? '' : `<button class="del" data-acao="excluir" data-id="${esc(c.sid)}" title="Excluir a conversa e tudo dela">${icone('lixo')}</button>`}
    </li>`;
  }).join('')}</ul></div>`;
};

// Transcrição de uma conversa só para leitura (componentes/transcricao.js): cabeçalho com voltar e atualizar.
const telaLeitura = (sid) => `${estiloConversas}<style>${transcricao.CSS}</style>
  <div class="topo"><span class="rotulo" data-acao="fechar" style="cursor:pointer" title="Voltar para a lista de conversas">← Conversas</span><span class="titulo"></span>
    <span class="extra">somente leitura <button class="fb-btn" data-acao="recarregar" title="Atualizar">↻</button></span></div>
  <div class="folha">${transcricao.html(historico(sid))}</div>`;

exports.provider = () => {
  let view, sel = null, lendo = null; // sel: Set de ids no modo seleção; lendo: conversa aberta na transcrição (somente leitura)
  const render = () => view && (view.webview.html = pagina(crypto.randomBytes(16).toString('hex'), lendo ? telaLeitura(lendo) : tela(listar(), sessao.conversaAtual(), sel)));
  const apagar = async (ids) => {
    for (const id of ids) {
      if (id === sessao.conversaAtual()) continue; // a conversa aberta continua escrevendo nesses arquivos
      for (const p of rastros(id)) await vscode.workspace.fs.delete(vscode.Uri.file(p), { recursive: true, useTrash: true });
    }
  };

  const acoes = {
    // Mesmo comando interno usado pela lista de sessões do Claude (args: id da sessão).
    abrir: ({ id }) => {
      // Etapa em segundo plano (claude -p): não abre no chat do Claude (vira chat vazio); mostra a transcrição aqui mesmo, só para ler.
      if (transcricao.ehSegundoPlano(historico(id))) { lendo = id; return render(); }
      return vscode.commands.executeCommand('claude-vscode.editor.open', id);
    },
    fechar() { lendo = null; render(); },
    recarregar() { render(); },
    async excluir({ id }) {
      if (id === sessao.conversaAtual()) return; // a conversa aberta continua escrevendo nesses arquivos
      const c = listar().find((x) => x.sid === id);
      const ok = await vscode.window.showWarningMessage(`Excluir a conversa "${c?.titulo || id}"?`, {
        modal: true,
        detail: `Vai para a lixeira do sistema (dá para restaurar):\n• histórico do chat\n• ${c?.documentos ?? 0} item(ns) da pasta da conversa: documentos, notas e ${c?.evidencias ?? 0} evidência(s)\n• backups de edição e variáveis da sessão\n\nDocumentos que eram atalhos para arquivos do repositório: some só o atalho, o arquivo original fica.`
      }, 'Excluir');
      if (!ok) return;
      await apagar([id]);
      render();
    },
    selecionar() { sel = new Set(); render(); },
    cancelar() { sel = null; render(); },
    marcar({ id }) {
      if (!sel || id === sessao.conversaAtual()) return;
      sel.has(id) ? sel.delete(id) : sel.add(id);
      render();
    },
    todas() {
      const marcaveis = listar().filter((c) => c.sid !== sessao.conversaAtual()).map((c) => c.sid);
      sel = new Set(sel.size === marcaveis.length ? [] : marcaveis);
      render();
    },
    async excluirSelecionadas() {
      if (!sel?.size) return;
      const escolhidas = listar().filter((c) => sel.has(c.sid) && c.sid !== sessao.conversaAtual());
      const soma = (k) => escolhidas.reduce((t, c) => t + (c[k] || 0), 0);
      const ok = await vscode.window.showWarningMessage(`Excluir ${escolhidas.length} conversa${escolhidas.length === 1 ? '' : 's'}?`, {
        modal: true,
        detail: `${escolhidas.slice(0, 8).map((c) => '• ' + c.titulo).join('\n')}${escolhidas.length > 8 ? `\n… e mais ${escolhidas.length - 8}` : ''}\n\nVai para a lixeira do sistema (dá para restaurar): histórico do chat, ${soma('documentos')} documento(s), ${soma('evidencias')} evidência(s), notas, backups de edição e variáveis da sessão.`
      }, 'Excluir');
      if (!ok) return;
      await apagar(escolhidas.map((c) => c.sid));
      sel = null;
      render();
    }
  };

  return vscode.Disposable.from(
    sessao.onDidChange(() => render()),
    require('../painel/grupo').registrar('claudeAbas.conversas', {
      resolveWebviewView(v) {
        view = v;
        view.webview.options = { enableScripts: true };
        view.webview.onDidReceiveMessage((m) => acoes[m.acao]?.(m));
        view.onDidChangeVisibility(() => view.visible && render());
        render();
      }
    })
  );
};

// ── Vínculo com as conversas do Claude (ticket ↔ conversa) ──
const { dirSpec } = require('../infra/ticket/spec');
const { lerTexto, NOTAS } = require('../infra/ticket/pasta-ticket');
const jsonl = (sid) => historico(sid);
function inicioDa(sid) {
  const t = (lerTexto(jsonl(sid)) || '').match(/"timestamp":"([^"]+)"/)?.[1];
  return t ? Date.parse(t) : Date.now();
}
// Conversa com histórico, aberta depois do pedido, que menciona a pasta do ticket (está no texto pré-preenchido).
function localizarConversa(t) {
  const tickets = require('../infra/ticket/tickets');
  let nomes;
  try { nomes = fs.readdirSync(projeto()).filter((n) => n.endsWith('.jsonl')); } catch { return null; }
  const desde = t.pedidoEm - 5000;
  return nomes.map((n) => path.basename(n, '.jsonl'))
    .filter((sid) => !tickets.ticketDa(sid))
    .filter((sid) => { try { return fs.statSync(jsonl(sid)).mtimeMs >= desde; } catch { return false; } })
    .filter((sid) => (lerTexto(jsonl(sid)) || '').includes(tickets.pasta(t.chave, t.pedidoLista)) && inicioDa(sid) >= desde)
    .sort((a, b) => inicioDa(a) - inicioDa(b))[0] || null;
}
// Título da conversa: a mesma linha que o /rename do Claude grava (custom-title vence o ai-title).
function titularConversa(sid, titulo, tentativas = 20) {
  const arq = jsonl(sid);
  if (!fs.existsSync(arq)) { if (tentativas) setTimeout(() => titularConversa(sid, titulo, tentativas - 1), 1500); return; }
  const atual = fs.readFileSync(arq, 'utf8');
  fs.appendFileSync(arq, (atual.endsWith('\n') ? '' : '\n') + JSON.stringify({ type: 'custom-title', sessionId: sid, customTitle: titulo }) + '\n');
}
const ultimaConversa = (t) => require('../infra/agentes/conversa').ultimaConversa(t, sessao.focoLista());

// Primeira mensagem da conversa nova aberta pelo ticket: vincula ao ticket e dá a ela o título dele.
const tituloConversa = (t, lista) => {
  const implementacoes = require('../implementacoes/implementacoes'), incidentes = require('../incidentes/incidentes'), qa = require('../qa/qa');
  const etapa = { [implementacoes.ID]: implementacoes.ETAPA, [qa.ID]: qa.ETAPA, [incidentes.ID]: incidentes.ETAPA }[lista];
  return [t.chave, etapa, t.titulo || t.documento?.nome].filter(Boolean).join(' · ');
};
const reconciliar = (s) => {
  const tickets = require('../infra/ticket/tickets'), implementacoes = require('../implementacoes/implementacoes'), incidentes = require('../incidentes/incidentes');
  let mudou = false;
  for (const t of tickets.listar()) {
    if (!t.pedidoEm) continue;
    const sid = localizarConversa(t);
    if (sid) {
      tickets.vincular(sid, t.chave, t.pedidoLista);
      const { pedidoEm, pedidoLista, ...resto } = tickets.ler(t.chave);
      tickets.gravar(resto);
      titularConversa(sid, tituloConversa(t, pedidoLista));
      mudou = true;
    } else if (Date.now() - t.pedidoEm > 24 * 3600e3) { const { pedidoEm, pedidoLista, ...resto } = t; tickets.gravar(resto); }
  }
  if (mudou) s.render();
};

// Implementações e Incidentes: dossiê/entrada e artefatos da esteira que já existem na pasta da aba (contexto do ticket, entendimento, varredura, plano), para a conversa começar de onde a esteira parou.
const ARQUIVOS_ESTEIRA = {
  [require('../implementacoes/implementacoes').ID]: require('../implementacoes/implementacoes').ARQUIVOS_CONVERSA,
  [require('../incidentes/incidentes').ID]: require('../incidentes/incidentes').ARQUIVOS_CONVERSA
};
const esteiraArquivos = (s, t) => {
  const e = ARQUIVOS_ESTEIRA[sessao.focoLista()];
  if (!e) return '';
  const dir = s.pastaAba(t.chave), achados = e.nomes.filter((n) => fs.existsSync(path.join(dir, n)));
  return achados.length ? `${e.rotulo} (leia antes de começar): ${achados.map((n) => path.join(dir, n)).join(', ')}.\n` : '';
};
const pedido = (s, t) => {
  const refinamento = require('../refinamento/refinamento'), implementacoes = require('../implementacoes/implementacoes'), incidentes = require('../incidentes/incidentes'), qa = require('../qa/qa');
  return (sessao.focoLista() === refinamento.ID ? refinamento.pedidoConversa(s, t) // Refinamento: refinamento/conversa.js
    // Implementações / QA: escreve só na pasta da aba; do refinamento recebe só o resultado (spec), sem as conversas dele.
    : `Ticket ${t.chave}: ${t.titulo || ''} · ${{ [qa.ID]: qa.ETAPA_PEDIDO, [incidentes.ID]: incidentes.ETAPA }[sessao.focoLista()] || implementacoes.ETAPA}\n${require('../infra/ticket/contexto').blocoDocumento(t) || t.link}\n`
      + `Pasta desta etapa: ${s.pastaAba(t.chave)} (documentos, notas em ${NOTAS}). Grave só nela.\n`
      + (dirSpec(t) ? `Entrada, só leitura: a spec em ${dirSpec(t)}. ` : '')
      + esteiraArquivos(s, t)
      + `Anexos do ticket em ${s.pasta(t.chave)}. Não use as outras pastas nem conversas do ticket.\n`);
};
// Abre a conversa mais recente do ticket com o texto; sem conversa, abre uma nova e vincula quando a 1ª mensagem chegar.
const abrirConversa = async (s, t, texto) => {
  const tickets = require('../infra/ticket/tickets');
  const sid = ultimaConversa(t);
  if (sid) return vscode.commands.executeCommand('claude-vscode.editor.open', sid, texto);
  tickets.gravar({ ...tickets.ler(t.chave), pedidoEm: Date.now(), pedidoLista: sessao.focoLista() });
  await vscode.commands.executeCommand('claude-vscode.editor.open', undefined, texto || pedido(s, t));
};

const acoes = (s) => ({
  async claude() {
    const t = s.ticketAberto();
    if (t) return abrirConversa(s, t);
    const sid = sessao.conversaAtual();
    return vscode.commands.executeCommand('claude-vscode.editor.open', sid || undefined);
  }
});

exports.reconciliar = reconciliar;
exports._teste2 = { pedido, tituloConversa };
exports.acoes = acoes;
exports._teste = { listar, rastros, titulo, projeto, historico, telaLeitura };
