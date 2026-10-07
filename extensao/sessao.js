const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Conversa ativa do Claude neste workspace, marcada pelos hooks (~/.claude/hooks/documentos.py).
// Tudo da conversa (documentos, .notas.html, evidencias/, .decisoes.json) mora numa pasta só:
// a do ticket quando a conversa está vinculada (<TICKETS>/.conversas/<sid> → chave), senão <RAIZ>/<sid>.
// Os hooks resolvem igual (documentos.py: pasta_da_conversa).
const RAIZ = path.join(os.homedir(), '.claude', 'documentos');
const { RAIZ: TICKETS, ticketDa } = require('./tickets');
const ATUAL = path.join(RAIZ, '.atual');

const workspace = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
const marca = () => path.join(ATUAL, crypto.createHash('sha1').update(workspace()).digest('hex').slice(0, 16));

function conversaAtual() {
  try { return fs.readFileSync(marca(), 'utf8').trim() || null; } catch { return null; }
}

// id = id da conversa ou chave de um ticket (o painel abre o ticket direto, sem conversa).
const pasta = (id) => {
  const t = /^[A-Z][A-Z0-9]+-\d+$/.test(id) ? id : ticketDa(id);
  return t ? path.join(TICKETS, t) : path.join(RAIZ, id);
};

// Ticket aberto no painel: as seções de dentro dele (evidências, conversas) mostram o ticket, não a conversa.
let foco = null;
const atual = () => foco || conversaAtual();

// Avisa quando a conversa ativa muda (nova conversa, troca na barra lateral + mensagem).
const mudou = new vscode.EventEmitter();
let ultima = conversaAtual();
let observador;
function vigiar() {
  fs.mkdirSync(ATUAL, { recursive: true });
  observador = fs.watch(ATUAL, () => {
    const sid = conversaAtual();
    if (sid !== ultima) { ultima = sid; mudou.fire(sid); }
  });
}

module.exports = {
  RAIZ, TICKETS, conversaAtual, pasta, ticketDa, workspace, atual,
  foco: () => foco,
  focar: (chave) => { if (chave !== foco) { foco = chave; mudou.fire(atual()); } },
  onDidChange: mudou.event,
  iniciar: () => { vigiar(); return { dispose: () => observador?.close() }; }
};
