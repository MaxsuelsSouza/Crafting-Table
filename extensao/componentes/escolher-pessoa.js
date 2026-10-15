// @ts-check
const vscode = require('vscode');

// Escolhe UMA pessoa buscando enquanto digita (a mesma busca das menções do comentário: jira.pessoas). Enter na pessoa confirma e fecha.
// `fixas`: itens no topo da lista vazia, [{ label, description?, pessoa: { id, nome } | null }] (ex.: "Eu", "Sem responsável").
// Devolve { pessoa } ou undefined se cancelou (pessoa null = nenhuma).
/** @param {{ titulo: string, placeholder?: string, buscar: (texto: string) => Promise<{ id: string, nome: string }[]>, fixas?: { label: string, description?: string, pessoa: { id: string, nome: string } | null }[] }} o */
function escolherPessoa({ titulo, placeholder, buscar, fixas = [] }) {
  return new Promise((resolve) => {
    const qp = /** @type {vscode.QuickPick<vscode.QuickPickItem & { pessoa?: { id: string, nome: string } | null }>} */ (vscode.window.createQuickPick());
    qp.ignoreFocusOut = true; qp.matchOnDescription = true; qp.title = titulo;
    qp.placeholder = placeholder || 'Digite parte do nome ou do e-mail para buscar';
    let seq = 0, timer, feito = false;
    const inicio = () => { qp.busy = false; qp.items = fixas.map((f) => ({ label: f.label, description: f.description, alwaysShow: true, pessoa: f.pessoa })); };
    qp.onDidChangeValue((v) => {
      clearTimeout(timer);
      const n = ++seq;
      if (!v.trim()) return inicio();
      qp.busy = true;
      timer = setTimeout(async () => {
        let itens;
        try {
          const achadas = await buscar(v.trim());
          itens = achadas.length ? achadas.map((p) => ({ label: p.nome, alwaysShow: true, pessoa: p })) : [{ label: `Ninguém encontrado para "${v}"`, alwaysShow: true }];
        } catch (e) { itens = [{ label: `$(error) ${e.message}`, alwaysShow: true }]; }
        if (n !== seq) return;
        qp.busy = false; qp.items = itens;
      }, 300);
    });
    qp.onDidAccept(() => {
      const i = qp.activeItems[0];
      if (!i || i.pessoa === undefined) return; // aviso de "ninguém encontrado"/erro: não escolhe
      feito = true;
      resolve({ pessoa: i.pessoa });
      qp.hide();
    });
    qp.onDidHide(() => { clearTimeout(timer); qp.dispose(); if (!feito) resolve(undefined); });
    inicio(); qp.show();
  });
}

module.exports = { escolherPessoa };
