const fs = require('fs');
const os = require('os');
const path = require('path');

// Um ticket = pasta ~/.claude/tickets/<CHAVE>/ com .ticket.json e tudo das conversas vinculadas
// (documentos na raiz, .notas.html, evidencias/, .decisoes.json — mesmo layout da pasta de uma conversa).
// Vínculo conversa → ticket: .conversas/<sid> contém a chave. Sem vínculo, a conversa usa ~/.claude/documentos/<sid>.
// Sem dependência do vscode: também roda em bin/migrar-tickets.js.
const RAIZ = path.join(os.homedir(), '.claude', 'tickets');
const VINCULOS = path.join(RAIZ, '.conversas');
const ARQUIVADOS = path.join(RAIZ, '_arquivados');

const chaveDo = (texto) => String(texto || '').match(/[A-Z][A-Z0-9]+-\d+/i)?.[0].toUpperCase() || null;
const pasta = (chave) => path.join(RAIZ, chave);
const lerJson = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };

const ler = (chave) => lerJson(path.join(pasta(chave), '.ticket.json'), null);
function gravar(t) {
  fs.mkdirSync(pasta(t.chave), { recursive: true });
  fs.writeFileSync(path.join(pasta(t.chave), '.ticket.json'), JSON.stringify(t, null, 2));
  return t;
}

// link do Jira (…/browse/WMS-123) → ticket novo; se já existe, devolve o existente.
function criar(link, extras = {}) {
  const chave = chaveDo(link);
  if (!chave) throw new Error('Link sem chave do ticket (ex.: .../browse/WMS-123)');
  return ler(chave) || gravar({ chave, link, site: new URL(link).origin, titulo: '', status: '', conversas: [],
    refinamento: { estado: 'desligado' }, criado: Date.now(), ...extras });
}

function listar() {
  let nomes;
  try { nomes = fs.readdirSync(RAIZ); } catch { return []; }
  return nomes.filter((n) => !n.startsWith('.') && !n.startsWith('_')).map(ler).filter(Boolean).sort((a, b) => b.criado - a.criado);
}

const ticketDa = (sid) => { try { return fs.readFileSync(path.join(VINCULOS, sid), 'utf8').trim() || null; } catch { return null; } };
function vincular(sid, chave) {
  const t = ler(chave);
  if (!t) throw new Error(`Ticket ${chave} não existe`);
  fs.mkdirSync(VINCULOS, { recursive: true });
  fs.writeFileSync(path.join(VINCULOS, sid), chave);
  if (!t.conversas.includes(sid)) gravar({ ...t, conversas: [...t.conversas, sid] });
}

// Excluir = tirar da lista: a pasta vai para _arquivados/ e as conversas voltam a ser avulsas. Nada é apagado.
function arquivar(chave) {
  const t = ler(chave);
  if (!t) return;
  for (const sid of t.conversas) if (ticketDa(sid) === chave) fs.rmSync(path.join(VINCULOS, sid), { force: true });
  fs.mkdirSync(ARQUIVADOS, { recursive: true });
  fs.renameSync(pasta(chave), path.join(ARQUIVADOS, `${chave}-${Date.now()}`));
}

module.exports = { RAIZ, chaveDo, pasta, ler, gravar, criar, listar, ticketDa, vincular, arquivar };
