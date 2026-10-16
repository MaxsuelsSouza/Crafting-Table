// @ts-check
// Envio para o Teams: POST na URL do Cofre (TEAMS_WEBHOOK, nunca em log), pausa depois de 3 falhas seguidas e o ciclo de 30 s.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const tickets = require('../../ticket/tickets');
const { SOSSEGO, MAX_FALHAS, ENVIADO, ler, ms, card, mensagens } = require('./card');

// Só o código HTTP (ou o da rede) sai daqui; a URL nunca.
async function post(url, msg) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) });
    return r.ok ? { ok: true } : { ok: false, erro: String(r.status) };
  } catch (e) { return { ok: false, erro: e.cause?.code || 'sem conexão' }; }
}

// Sem URL no Cofre: não faz nada.
async function enviar(ctx, dados) {
  const url = await ctx.secrets.get('cofre:TEAMS_WEBHOOK');
  return url ? post(url, card(dados)) : { ok: false, semUrl: true };
}

let falhas = 0, pausado = false, ultimaUrl;
const falhou = (erro) => {
  if (++falhas >= MAX_FALHAS) {
    pausado = true;
    vscode.window.showWarningMessage('Teams: 3 falhas seguidas, avisos pausados. Confira a URL (TEAMS_WEBHOOK) no Cofre.');
  } else vscode.window.setStatusBarMessage(`Teams: falha ao enviar (${erro})`, 8000);
};

// Um ciclo: por ticket, envia as linhas novas dos tipos ligados. O marcador só avança se tudo foi enviado.
async function ciclo(ctx, agora = Date.now()) {
  const url = await ctx.secrets.get('cofre:TEAMS_WEBHOOK');
  if (!url) return;
  if (url !== ultimaUrl) { ultimaUrl = url; falhas = 0; pausado = false; }
  if (pausado) return;
  const lista = tickets.listar();
  if (!ctx.globalState.get('teamsLigado')) { // primeira vez: o que já existe conta como enviado
    for (const t of lista) fs.writeFileSync(path.join(tickets.pasta(t.chave), ENVIADO), new Date(agora).toISOString());
    return ctx.globalState.update('teamsLigado', true);
  }
  // Cada aba do ticket (raiz, impl/, qa/, incidentes/) tem o seu .notificacoes.jsonl e o seu marcador.
  for (const [t, dir] of lista.flatMap((t) => [...new Set([tickets.REFINAMENTO, ...tickets.listasDe(t)])].map((l) => [t, tickets.pasta(t.chave, l)]))) {
    let marca = 0, texto;
    try { marca = ms(fs.readFileSync(path.join(dir, ENVIADO), 'utf8')); } catch {}
    try { texto = fs.readFileSync(path.join(dir, '.notificacoes.jsonl'), 'utf8'); } catch { continue; }
    const novas = texto.split('\n').flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).filter((l) => ms(l.em) > marca);
    if (!novas.length) continue;
    const ultima = Math.max(...novas.map((l) => ms(l.em)));
    if (agora - ultima < SOSSEGO) continue; // rajada ainda rolando
    let ok = true;
    for (const { msg } of mensagens(t, novas, ler(path.join(dir, '.impactos.json'), []), ler(path.join(dir, '.tarefas.json'), []))) {
      const r = await post(url, msg);
      if (r.ok) { falhas = 0; continue; }
      falhou(r.erro); ok = false; break;
    }
    if (ok) fs.writeFileSync(path.join(dir, ENVIADO), new Date(ultima).toISOString());
    if (pausado) return;
  }
}

exports.encaminhar = (ctx) => {
  const id = setInterval(() => ciclo(ctx).catch(() => {}), 30e3);
  return { dispose: () => clearInterval(id) };
};

exports.testar = async (ctx) => {
  const r = await enviar(ctx, { titulo: 'Crafting Table conectada', texto: 'Se você está lendo isto, o aviso para o Teams está funcionando.' });
  if (r.semUrl) return vscode.window.showWarningMessage('Guarde a URL do fluxo no Cofre com o nome TEAMS_WEBHOOK.');
  if (r.ok) vscode.window.showInformationMessage('Teams: card de teste enviado.');
  else vscode.window.showErrorMessage(`Teams: falha ao enviar (${r.erro}).`);
};

exports.reset = () => { falhas = 0; pausado = false; ultimaUrl = undefined; };
exports.post = post;
exports.enviar = enviar;
exports.ciclo = ciclo;
