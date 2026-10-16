// @ts-check
// Massa na aba Roteiro (componentes/roteiros.js): copiar campo (Massas mortas) e editar o .massa.json à mão.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const qa = require('../../motor');

const massa = (s) => ({
  async qaMassaCopiar({ id, key }) {
    const t = s.ticketAberto(),
      m = t && qa.massa(s.pastaAba(t.id)),
      i = m && [...m.itens, ...(m.mortas || [])].find((x) => x.id === id);
    if (!i || !(key in (i.dados || {}))) return;
    const v = i.dados[key];
    await vscode.env.clipboard.writeText(typeof v === 'object' ? JSON.stringify(v) : String(v));
    vscode.window.setStatusBarMessage(`${key} copiado`, 2000);
  },
  qaMassaEditar() {
    const t = s.ticketAberto();
    if (!t) return;
    const arq = path.join(s.pastaAba(t.id), qa.MASSA);
    if (!fs.existsSync(arq)) {
      fs.mkdirSync(path.dirname(arq), { recursive: true });
      fs.writeFileSync(arq, JSON.stringify({ itens: [] }, null, 2));
    }
    vscode.commands.executeCommand('vscode.open', vscode.Uri.file(arq));
  }
});

module.exports = { massa };
