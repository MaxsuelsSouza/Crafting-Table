// @ts-check
// Aba Massa: validar no banco, marcar válida/inválida, copiar campo, desfazer no banco e editar à mão.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const qa = require('../../motor');
const { depsQa } = require('./dependencias');
const acoes = (s) => require('.').acoes(s); // ciclo: o index junta este arquivo

const massa = (s) => ({
  qaMassaEstado({ id, op }) {
    const t = s.ticketAberto();
    try {
      if (t && typeof id === 'string') qa.massaEstado(s.pastaAba(t.id), id, op);
    } catch (e) {
      vscode.window.showErrorMessage(e.message);
    }
    s.render();
  },
  // Validar massa: roda de novo a consulta do item (só SELECT). true → válida (medida agora) · false → inválida · null → não deu para conferir.
  async qaMassaValidar({ id }) {
    const t = s.ticketAberto();
    if (!t || typeof id !== 'string') return;
    const dir = s.pastaAba(t.id);
    const r = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Validando a massa ${id} no banco…` },
      () => qa.validarMassa(dir, depsQa(s, t), [id])
    );
    const v = r[id];
    if (v === null)
      vscode.window.showWarningMessage(
        `${id}: não deu para conferir (banco não configurado/liberado ou a consulta falhou)`
      );
    else vscode.window.setStatusBarMessage(`${id}: ${v ? 'válida' : 'inválida'}`, 4000);
    s.render();
  },
  async qaMassaCopiar({ id, key }) {
    const t = s.ticketAberto(),
      i = t && qa.massa(s.pastaAba(t.id)).itens.find((x) => x.id === id);
    if (!i || !(key in (i.dados || {}))) return;
    const v = i.dados[key];
    await vscode.env.clipboard.writeText(typeof v === 'object' ? JSON.stringify(v) : String(v));
    vscode.window.setStatusBarMessage(`${key} copiado`, 2000);
  },
  // Desfazer no banco uma massa montada por SQL: roda o SQL de desfazer que a IA propôs e você aprovou junto, depois de um modal.
  async qaMassaDesfazer({ id }) {
    const t = s.ticketAberto();
    if (!t || typeof id !== 'string') return;
    const dir = s.pastaAba(t.id),
      i = qa.massa(dir).itens.find((x) => x.id === id);
    if (!i?.desfazer?.length) return;
    const ok = await vscode.window.showWarningMessage(
      `Desfazer a massa ${id} no banco (${i.desfazer.length} instrução(ões))?`,
      { modal: true, detail: `${i.desfazer.join(';\n')};` },
      'Desfazer'
    );
    if (!ok) return;
    try {
      await qa.desfazerMassa(dir, id, depsQa(s, t));
      qa.registrarDecisao(dir, `Usuário desfez a massa ${id} no banco`, { ticket: t.chave });
    } catch (e) {
      vscode.window.showErrorMessage(`Não consegui desfazer: ${e.message}`);
    }
    s.render();
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
