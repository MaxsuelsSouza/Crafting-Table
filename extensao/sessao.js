// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Conversa ativa do Claude neste workspace, marcada pelos hooks (~/.claude/hooks/documentos.py).
// Tudo da conversa (documentos, .notas.html, evidencias/, .decisoes.json) mora numa pasta só:
// a do ticket (na subpasta da aba) quando a conversa está vinculada (<TICKETS>/.conversas/<sid> → chave[/aba]), senão <RAIZ>/<sid>.
// Os hooks resolvem igual (documentos.py: pasta_da_conversa).
const RAIZ = path.join(os.homedir(), '.claude', 'documentos');
const tickets = require('./tickets');
const { RAIZ: TICKETS, ticketDa } = tickets;
const ATUAL = path.join(RAIZ, '.atual');

const workspace = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
const marca = () => path.join(ATUAL, crypto.createHash('sha1').update(workspace()).digest('hex').slice(0, 16));

function conversaAtual() {
  try { return fs.readFileSync(marca(), 'utf8').trim() || null; } catch { return null; }
}

// id = id da conversa ou chave de um ticket (o painel abre o ticket direto, sem conversa: vale a aba em que ele foi aberto).
const pasta = (id) => {
  if (/^[A-Z][A-Z0-9]+-\d+$/.test(id)) return tickets.pasta(id, id === foco ? focoLista : undefined);
  const t = ticketDa(id);
  return t ? tickets.pasta(t, tickets.listaDa(id)) : path.join(RAIZ, id);
};

// Ticket aberto no painel (e a aba da lista em que foi aberto): as seções de dentro dele (evidências, conversas)
// mostram o ticket naquela aba, não a conversa.
let foco = null, focoLista = tickets.REFINAMENTO;
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
  focoLista: () => focoLista,
  focar: (chave, lista = tickets.REFINAMENTO) => { if (chave !== foco || lista !== focoLista) { foco = chave; focoLista = lista; mudou.fire(atual()); } },
  onDidChange: mudou.event,
  iniciar: () => { vigiar(); return { dispose: () => observador?.close() }; }
};
