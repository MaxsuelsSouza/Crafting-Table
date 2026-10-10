// @ts-check
const vscode = require('vscode');
const jira = require('../ticket').jira;
const { esc } = require('../ticket')._teste;
const { DUVIDAS, duvidasDe, textoDuvida, ticketDe } = require('./locais');
const { quando } = require('../componentes/formato');

// Dúvidas do refinamento: aba Dúvidas, envio ao ticket (com menções do Jira), resposta manual e sugestão vinda de comentário.
// Busca pessoas no Jira enquanto digita; Enter numa pessoa a menciona (Enter de novo remove), "Concluir" segue.
// Devolve [{ id, nome }] (vazio = ninguém) ou undefined se cancelou.
function escolherMencoes(t, secrets) {
  return new Promise((resolve) => {
    const qp = /** @type {vscode.QuickPick<vscode.QuickPickItem & { fim?: boolean, p?: any }>} */ (vscode.window.createQuickPick()), escolhidas = new Map();
    qp.ignoreFocusOut = true; qp.matchOnDescription = true;
    qp.placeholder = 'Digite parte do nome ou do e-mail para buscar no Jira';
    let seq = 0, timer, fim = false;
    const titulo = () => { const ja = [...escolhidas.values()].map((p) => '@' + p.nome).join(', '); qp.title = ja ? `Mencionando: ${ja}` : `Mencionar alguém no comentário do ${t.chave}?`; };
    const concluir = () => ({ label: escolhidas.size ? '$(check) Concluir menções' : '$(check) Enviar sem menção', alwaysShow: true, fim: true });
    const pessoa = (p) => ({ label: p.nome, description: escolhidas.has(p.id) ? 'mencionada · Enter remove' : '', alwaysShow: true, p });
    const inicio = () => { qp.busy = false; qp.items = [concluir(), ...[...escolhidas.values()].map(pessoa)]; };
    qp.onDidChangeValue((v) => {
      clearTimeout(timer);
      const n = ++seq;
      if (!v.trim()) return inicio();
      qp.busy = true;
      timer = setTimeout(async () => {
        let itens;
        try { const achadas = await jira.pessoas(secrets, { key: t.chave, site: t.site }, v.trim()); itens = achadas.length ? achadas.map(pessoa) : [{ label: `Ninguém encontrado para "${v}"`, alwaysShow: true }]; }
        catch (e) { itens = [{ label: `$(error) ${e.message}`, alwaysShow: true }]; }
        if (n !== seq) return;
        qp.busy = false; qp.items = itens;
      }, 300);
    });
    qp.onDidAccept(() => {
      const i = qp.activeItems[0];
      if (!i) return;
      if (i.fim) { fim = true; resolve([...escolhidas.values()]); return qp.hide(); }
      if (!i.p) return;
      if (escolhidas.has(i.p.id)) escolhidas.delete(i.p.id); else escolhidas.set(i.p.id, i.p);
      titulo(); qp.value = ''; inicio();
    });
    qp.onDidHide(() => { clearTimeout(timer); qp.dispose(); if (!fim) resolve(undefined); });
    titulo(); inicio(); qp.show();
  });
}

// Fecha a dúvida (só o humano) e, se era a última, a spec pode seguir.
function fecharDuvida(s, t, id, resposta) {
  const l = duvidasDe(s.pasta(t.chave)), x = l.find((y) => y.id === id);
  if (!x || x.resposta) return;
  x.resposta = { ...resposta, em: new Date().toISOString() }; x.sugestao = null;
  s.gravar(t.chave, DUVIDAS, l);
  s.orq.respondidas.push(`${id} (dúvida) → ${resposta.texto}`);
  s.render();
  if (!l.some((y) => !y.resposta)) s.orq.seguir(ticketDe(t.chave));
}

const acoes = (s) => ({
  // Prévia + confirmação antes de publicar: o comentário fica visível para todo o time no Jira.
  async duvidaEnviar({ id }) {
    const t = s.ticketAberto();
    const l = t ? duvidasDe(s.pasta(t.chave)) : [];
    const x = l.find((y) => y.id === id);
    if (!x || x.enviadaEm) return;
    const mencoes = await escolherMencoes(t, s.secrets);
    if (!mencoes) return;
    const ok = await vscode.window.showWarningMessage(`Comentar no ${t.chave}?`, { modal: true, detail: (mencoes.length ? `Menciona: ${mencoes.map((m) => '@' + m.nome).join(', ')}` : 'Sem menção a ninguém.') + '\n\n' + textoDuvida(x) }, 'Enviar');
    if (!ok) return;
    try { await jira.comentar(s.secrets, { key: t.chave, site: t.site }, textoDuvida(x), mencoes); }
    catch (e) { return vscode.window.showErrorMessage(e.message); }
    x.enviadaEm = new Date().toISOString();
    s.gravar(t.chave, DUVIDAS, l);
    vscode.window.showInformationMessage(`${x.id} enviada para os comentários do ${t.chave}.`);
    s.atualizarJira(t.chave);
  },
  async duvidaResponder({ id }) {
    const t = s.ticketAberto(), x = t && duvidasDe(s.pasta(t.chave)).find((y) => y.id === id);
    if (!x || x.resposta) return;
    const texto = (await vscode.window.showInputBox({ title: `${id}: ${x.texto}`.slice(0, 120), prompt: 'Resposta da dúvida', ignoreFocusOut: true }))?.trim();
    if (texto) fecharDuvida(s, t, id, { texto, origem: 'manual' });
  },
  duvidaConfirmar({ id }) {
    const t = s.ticketAberto(), sug = t && duvidasDe(s.pasta(t.chave)).find((y) => y.id === id)?.sugestao;
    if (sug) fecharDuvida(s, t, id, { texto: sug.texto, origem: 'comentario', autor: sug.autor, comentarioId: sug.comentarioId, link: sug.link });
  },
  duvidaRejeitar({ id }) {
    const t = s.ticketAberto(), l = t ? duvidasDe(s.pasta(t.chave)) : [], x = l.find((y) => y.id === id);
    if (!x?.sugestao) return;
    (x.descartados ||= []).push(x.sugestao.comentarioId); x.sugestao = null;
    s.gravar(t.chave, DUVIDAS, l); s.render();
  }
});

// Aba Dúvidas (HTML igual ao que corpoAba montava; a indentação dos templates é a original).
function corpo(d) {
    const card = (x) => {
      const aberta = !x.resposta, ev = x.enviadaEm;
      const corpo = `${x.contexto ? `<div class="dtrecho"><b>Contexto:</b> ${esc(x.contexto)}</div>` : ''}
        ${x.resposta ? `<div class="dtrecho resp"><b>Resposta${x.resposta.origem === 'comentario' ? ` · comentário de ${esc(x.resposta.autor || '')}` : ' · dada por você'}:</b> ${esc(x.resposta.texto)}</div>` : ''}
        ${aberta && x.sugestao ? `<div class="dtrecho sug"><b>Possível resposta de ${esc(x.sugestao.autor || 'alguém')}:</b> “${esc(String(x.sugestao.texto).slice(0, 600))}”<br><i>${esc(x.sugestao.motivo)}</i>
          <div class="acoes-aba"><button class="fb-btn enviar" data-acao="duvidaConfirmar" data-id="${esc(x.id)}">Confirmar como resposta</button>
          <button class="fb-btn" data-acao="duvidaRejeitar" data-id="${esc(x.id)}">Não é a resposta</button></div></div>` : ''}
        <div class="acoes-aba">${!ev ? `<button class="fb-btn enviar" data-acao="duvidaEnviar" data-id="${esc(x.id)}">Enviar para os comentários do ticket</button>` : ''}
          ${aberta ? `<button class="fb-btn" data-acao="duvidaResponder" data-id="${esc(x.id)}">Dar resposta</button>` : ''}</div>`;
      const marca = x.resposta ? '✓ Respondida' : ev ? `Aguardando resposta${x.sugestao ? ' · resposta sugerida' : ''}` : 'Não enviada';
      return `<details class="decisao duvida${ev ? ' enviada' : ''}"${!ev || x.sugestao ? ' open' : ''}>
        <summary><span class="quando">${esc(quando(x.em))}</span> <b>${esc(x.id)}</b> <span class="origem">${marca}</span><span class="dtexto">${esc(x.texto)}</span></summary>${corpo}</details>`;
    };
    const l = d.duvidas.slice().reverse(), novas = l.filter((x) => !x.enviadaEm), enviadas = l.filter((x) => x.enviadaEm);
    return `<div class="folha">${l.length ? `${novas.length ? `<div class="hist">${novas.map(card).join('')}</div>` : ''}
      ${enviadas.length ? `<div class="caixa-enviadas"><div class="titulo-caixa">Enviadas ao ticket (${enviadas.length})</div><div class="hist">${enviadas.map(card).join('')}</div></div>` : ''}`
      : '<div class="vazio-aba">Nenhuma dúvida registrada ainda.<br>No modo refinamento, quando você escolher <b>Tirar dúvida</b> numa pergunta do Claude, ela aparece aqui.</div>'}</div>`;
}

// Regras exclusivas das dúvidas (.dtrecho, .decisao, .hist, .quando, .origem e .acoes-aba são da aba Decisões também e ficam em moldura.js).
const CSS = `.duvida { padding: 4px 0 10px 12px; }
  .duvida .dlinha { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; }
  .duvida .dtexto { margin: 4px 0; font-size: 12.5px; line-height: 1.5; }
  .duvida .enviar { border: 1px solid var(--border); margin-top: 6px; }
  .duvida summary { text-transform: none; letter-spacing: 0; font-size: 11.5px; font-weight: 400; color: inherit; margin: 0; }
  .duvida .dtexto { display: block; margin-top: 4px; }
  .caixa-enviadas { margin-top: 14px; padding: 8px; border-radius: var(--r-md); background: var(--surface-2); }
  .caixa-enviadas .titulo-caixa { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); margin-bottom: 6px; }
  .duvida.enviada { opacity: .6; } .duvida.enviada:hover, .duvida.enviada[open] { opacity: .9; }
  .duvida .sug { border-left: 3px solid var(--accent); padding-left: 8px; }
`;

module.exports = { acoes, corpo, CSS };
