const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { trazerParaFrente } = require('./emulador');
const tickets = require('./tickets');

// O Teams não abre dentro do VS Code (a Microsoft bloqueia iframe). Este botão usa a janela
// que já existe na máquina: ~/.local/share/applications/teams.desktop (Chromium --app, perfil chromium-teams).
const aberto = () => new Promise((r) => execFile('pgrep', ['-f', 'user-data-dir=.*chromium-teams'], (err) => r(!err)));

exports.abrir = async () => {
  if (await aberto()) {
    if (!await trazerParaFrente(0, 'Microsoft Teams')) vscode.window.showWarningMessage('O Teams está aberto, mas não achei a janela dele (está minimizado na bandeja?).');
  } else {
    execFile('gtk-launch', ['teams'], (err) => err && vscode.window.showErrorMessage('Não consegui abrir o Teams: ' + err.message));
  }
};

// ── Avisos para o Teams (Workflows/webhook) ──
// Lê as linhas novas de <pasta do ticket>/.notificacoes.jsonl e faz POST de um Adaptive Card na URL guardada no Cofre
// (TEAMS_WEBHOOK). A URL é segredo: nunca entra em log, mensagem de erro nem notificação.
const TIPOS = ['sdd', 'pergunta', 'jira']; // ajuste aqui o que vai para o Teams (mudanca tem regra própria, abaixo)
const NIVEIS = ['MEDIO', 'ALTO']; // impacto abaixo disso não vai
const COR = { ALTO: 'Attention', MEDIO: 'Warning' };
const JANELA = 60e3; // linhas do mesmo ticket e tipo dentro disso viram uma mensagem
const SOSSEGO = 20e3; // o grupo só sai depois de ficar esse tempo sem linha nova (a rajada acabou)
const MAX_FALHAS = 3;
const ENVIADO = '.teams.enviado'; // ISO da última linha já enviada
const TITULO = { sdd: 'Spec', pergunta: 'Perguntas', jira: 'Jira' };

const ler = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const ms = (iso) => Date.parse(iso) || 0; // o hook (Python) e o sdd-state (JS) escrevem ISO em formatos diferentes

function card({ titulo, texto, fatos = [], links = [], cor = 'Default' }) {
  return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4',
    body: [
      { type: 'TextBlock', text: titulo, weight: 'Bolder', size: 'Medium', color: cor },
      { type: 'TextBlock', text: texto, wrap: true },
      ...(fatos.length ? [{ type: 'FactSet', facts: fatos.map(([title, value]) => ({ title, value })) }] : [])
    ],
    ...(links.length ? { actions: links.map(([title, url]) => ({ type: 'Action.OpenUrl', title, url })) } : [])
  } }] };
}

// Linhas novas de um ticket → mensagens (cards). `impactos`/`tarefas` dão os dados ricos do impacto.
function mensagens(t, linhas, impactos = [], tarefas = []) {
  const abrir = ['Abrir no Jira', `${t.site}/browse/${t.chave}`];
  const out = [], grupos = [];
  for (const l of linhas) {
    if (l.tipo === 'mudanca') { // mudança pedida em comentário do Jira, esperando decisão no painel
      const quem = t.refinamento?.iniciadoPor;
      if (quem && quem !== os.userInfo().username) continue; // o aviso é de quem iniciou o refinamento
      const nivel = /impacto (\w+)/i.exec(l.texto)?.[1].toUpperCase(); // "analisando o impacto" não casa
      if (!NIVEIS.includes(nivel)) continue;
      const autor = /^Comentário de (.+?): impacto/.exec(l.texto)?.[1];
      const i = impactos.slice().reverse().find((x) => x.nivel?.toUpperCase() === nivel && (!autor || x.autor === autor));
      const cards = (i?.cards || []).map((id) => tarefas.find((c) => c.id === id)?.jira || id);
      out.push({ em: ms(l.em), msg: card({ titulo: `${t.chave} · Mudança pedida · ${nivel}`, texto: `${i ? `Comentário de ${i.autor}: ${i.resumo}` : l.texto}\nNada foi alterado: decida no painel.`,
        cor: COR[nivel], links: [abrir, ...(i?.link ? [['Ver comentário', i.link]] : [])],
        fatos: [...(i && i.passo != null ? [['Spec', `passo ${i.passo} afetado`]] : []), ...(cards.length ? [['Revisar', cards.join(', ')]] : []), ...(quem ? [['Refinamento de', quem]] : [])] }) });
    } else if (TIPOS.includes(l.tipo)) {
      const g = grupos.find((x) => x.tipo === l.tipo && ms(l.em) - x.fim <= JANELA);
      if (g) { g.linhas.push(l); g.fim = ms(l.em); } else grupos.push({ tipo: l.tipo, linhas: [l], fim: ms(l.em) });
    }
  }
  for (const g of grupos) {
    const n = g.linhas.length;
    out.push({ em: g.fim, msg: card({ titulo: `${t.chave} · ${TITULO[g.tipo]}`, links: [abrir],
      texto: g.tipo === 'pergunta' && n > 1 ? `O Claude tem ${n} perguntas esperando você` : g.linhas.map((l) => l.texto).join('\n\n') }) });
  }
  return out.sort((a, b) => a.em - b.em);
}

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
  // Cada aba do ticket (raiz, impl/, qa/) tem o seu .notificacoes.jsonl e o seu marcador.
  for (const [t, dir] of lista.flatMap((t) => [...new Set(['tickets', ...tickets.listasDe(t)])].map((l) => [t, tickets.pasta(t.chave, l)]))) {
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

exports._teste = { card, mensagens, ciclo, enviar, reset: () => { falhas = 0; pausado = false; ultimaUrl = undefined; } };
