const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Conversa ativa do Claude neste workspace, marcada pelos hooks (~/.claude/hooks/documentos.py).
// Tudo da conversa mora em <RAIZ>/<session_id>/: documentos, .notas.html e evidencias/.
const RAIZ = path.join(os.homedir(), '.claude', 'documentos');
const ATUAL = path.join(RAIZ, '.atual');

const workspace = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
const marca = () => path.join(ATUAL, crypto.createHash('sha1').update(workspace()).digest('hex').slice(0, 16));

function conversaAtual() {
  try { return fs.readFileSync(marca(), 'utf8').trim() || null; } catch { return null; }
}

const pasta = (sid) => path.join(RAIZ, sid);

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
  RAIZ, conversaAtual, pasta, workspace,
  onDidChange: mudou.event,
  iniciar: () => { vigiar(); return { dispose: () => observador?.close() }; }
};
