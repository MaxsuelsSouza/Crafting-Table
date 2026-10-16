// @ts-check
const fs = require('fs');
const path = require('path');

// Ações da aba Ticket de um ticket-documento (componentes/folha-documento.js). Só leem/gravam a pasta do ticket: zero rede.
// Módulo de ações do painel: registrado em modulosAcoes (painel/painel.js); `s` são os serviços (ticketAberto, render…).
const { STATUS } = require('../componentes/folha-documento');
const tickets = () => require('../infra/ticket/tickets');
const doc = require('../infra/provedores/documento');
const vs = () => require('vscode');

const acoes = (s) => ({
  docSalvarDescricao({ texto }) {
    const t = s.ticketAberto();
    if (!t || !doc.ehDocumento(t) || typeof texto !== 'string') return;
    fs.mkdirSync(tickets().pasta(t.chave), { recursive: true });
    fs.writeFileSync(path.join(tickets().pasta(t.chave), '.documento-texto.md'), texto);
    s.render();
  },
  async docEditarTitulo() {
    const t = s.ticketAberto();
    if (!t || !doc.ehDocumento(t)) return;
    const titulo = await vs().window.showInputBox({ title: 'Título do ticket', value: t.titulo || '', ignoreFocusOut: true });
    if (!titulo?.trim()) return;
    tickets().gravar({ ...tickets().ler(t.chave), titulo: titulo.trim() });
    s.render();
  },
  async docEditarStatus() {
    const t = s.ticketAberto();
    if (!t || !doc.ehDocumento(t)) return;
    const st = await vs().window.showQuickPick(STATUS, { title: 'Status do ticket', placeHolder: t.status || 'Documento' });
    if (!st) return;
    tickets().gravar({ ...tickets().ler(t.chave), status: st });
    s.render();
  },
  docComentar({ texto }) {
    const t = s.ticketAberto();
    if (!t || !doc.ehDocumento(t) || !String(texto || '').trim()) return;
    doc.adicionarComentario(t.chave, { autor: 'Você', texto: String(texto).trim(), externo: true });
    s.render();
    s.orq?.vigiarComentarios?.(); // o vigia classifica na hora: resposta de dúvida (triagem) ou mudança (impacto)
  },
  async docAbrir() {
    const t = s.ticketAberto();
    if (!t || !doc.ehDocumento(t) || !t.documento?.arquivo) return;
    const a = path.isAbsolute(t.documento.arquivo) ? t.documento.arquivo : path.join(tickets().pasta(t.chave), t.documento.arquivo);
    const v = vs(), u = v.Uri.file(a);
    if (String(t.documento.tipo).toLowerCase() === 'pdf') return v.commands.executeCommand('vscode.open', u);
    return v.env.openExternal(u);
  },
  async docAnexar() {
    const t = s.ticketAberto();
    if (!t || !doc.ehDocumento(t)) return;
    const esc = await vs().window.showOpenDialog({ canSelectMany: true, canSelectFolders: false, openLabel: 'Adicionar anexo', title: 'Anexos do incidente (prints, vídeos)' });
    if (!esc?.length) return;
    const d = tickets().pasta(t.chave), an = path.join(d, '.anexos'), orig = path.join(d, '.origem.json');
    fs.mkdirSync(an, { recursive: true });
    let o = {}; try { o = JSON.parse(fs.readFileSync(orig, 'utf8')); } catch { /* sem origem */ }
    for (const u of esc) { // copia (o original do usuário não é tocado); nome repetido ganha -2, -3
      const { name, ext } = path.parse(u.fsPath);
      let nome = name + ext;
      for (let n = 2; fs.existsSync(path.join(an, nome)); n++) nome = `${name}-${n}${ext}`;
      fs.copyFileSync(u.fsPath, path.join(an, nome));
      o[nome] = { origem: 'documento', id: nome };
    }
    fs.writeFileSync(orig, JSON.stringify(o, null, 2));
    s.render();
  },
  async docAbrirAnexo({ id }) {
    const t = s.ticketAberto();
    if (!t || !doc.ehDocumento(t) || !id) return;
    const a = path.join(tickets().pasta(t.chave), '.anexos', path.basename(String(id)));
    if (fs.existsSync(a)) return vs().env.openExternal(vs().Uri.file(a));
  },
  async docPasta() {
    const t = s.ticketAberto();
    if (!t || !doc.ehDocumento(t)) return;
    const v = vs(), d = tickets().pasta(t.chave), a = t.documento?.arquivo ? path.join(d, t.documento.arquivo) : d;
    return v.commands.executeCommand('revealFileInOS', v.Uri.file(fs.existsSync(a) ? a : d));
  }
});

module.exports = { acoes };
