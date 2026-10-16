// @ts-check
// Cliques da aba Conhecimentos: buscar (QuickPick), abrir/editar o qa.json, apagar, definir a tela de início e refazer os flows de início.
const vscode = require('vscode');
const fs = require('fs');
const k = require('../../conhecimentos');

const abrirNo = async (id) => {
  const arq = k.ARQ();
  if (!fs.existsSync(arq)) k.definirTelaInicio(k.ler().telaInicio); // cria o arquivo vazio
  const doc = await vscode.workspace.openTextDocument(arq),
    ed = await vscode.window.showTextDocument(doc);
  const n = id ? doc.getText().indexOf(`"id": "${id}"`) : -1;
  if (n >= 0) {
    const p = doc.positionAt(n);
    ed.selection = new vscode.Selection(p, p);
    ed.revealRange(new vscode.Range(p, p), vscode.TextEditorRevealType.AtTop);
  }
};

const conhecimentos = (s) => ({
  async qaConhecimentoBuscar() {
    const itens = k.ler().itens;
    if (!itens.length) return vscode.window.showInformationMessage('Nenhum conhecimento registrado ainda.');
    const r = await vscode.window.showQuickPick(
      itens.map((i) => ({
        label: `${i.chave}`,
        description: `${i.tipo} · ${i.id}`,
        detail: String(i.conteudo).replace(/\s+/g, ' ').slice(0, 200),
        id: i.id
      })),
      {
        placeHolder: 'Buscar nos conhecimentos (chave, tipo ou conteúdo)',
        matchOnDescription: true,
        matchOnDetail: true
      }
    );
    if (r) await abrirNo(r.id);
  },
  qaConhecimentoArquivo: () => abrirNo(''),
  qaConhecimentoEditar: ({ id }) => abrirNo(id),
  async qaConhecimentoApagar({ id }) {
    const i = k.ler().itens.find((x) => x.id === id);
    if (!i) return;
    const ok = await vscode.window.showWarningMessage(
      `Apagar o conhecimento ${i.id} (${i.chave})?`,
      { modal: true, detail: 'A IA vai descobrir de novo quando precisar.' },
      'Apagar'
    );
    if (ok && k.apagar(id)) s.render();
  },
  async qaConhecimentoTelaInicio() {
    const nome = await vscode.window.showInputBox({
      prompt: 'Tela em que todo teste começa (o flow "inicio" para nela)',
      value: k.ler().telaInicio || 'Menu principal'
    });
    if (nome === undefined || nome.trim() === k.ler().telaInicio) return;
    k.definirTelaInicio(nome);
    // tela nova: os flows de início antigos param noutra tela; a IA escreve de novo no próximo ▶
    for (const f of ['inicio', 'voltar-inicio']) {
      const i = k.flow(f);
      if (i) k.apagar(i.id);
    }
    s.render();
  },
  async qaConhecimentoRefazerInicio() {
    for (const f of ['inicio', 'voltar-inicio']) {
      const i = k.flow(f);
      if (i) k.apagar(i.id);
    }
    s.render();
  }
});

module.exports = { conhecimentos };
