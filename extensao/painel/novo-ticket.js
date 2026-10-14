// @ts-check

// Pergunta de "Novo ticket": o campo pede o link do ticket (padrão, sem citar ferramenta) e, embaixo, "Anexar documento" é sempre opcional.
// Enter com o link digitado cria pelo link; escolher o item de baixo (seta + Enter, ou clique) abre a escolha do arquivo.
// pedir(vscode) → { link } | { documento: true } | null (fechou sem escolher).
const ANEXAR = '$(attach) Anexar documento';
const DESCRICAO = 'opcional · PDF, imagem, texto ou Word, para quem trabalha com documentos';

function pedir(/** @type {any} */ vscode) {
  return new Promise((ok) => {
    const q = vscode.window.createQuickPick();
    q.title = 'Novo ticket';
    q.placeholder = 'Cole o link do ticket da sua ferramenta de gestão e tecle Enter';
    q.ignoreFocusOut = true;
    const item = { label: ANEXAR, description: DESCRICAO, alwaysShow: true }; // alwaysShow: o filtro do campo não esconde o botão
    q.items = [item];
    q.activeItems = []; // sem item ativo, Enter usa o que foi digitado
    let fim = false;
    const fechar = (r) => { if (fim) return; fim = true; ok(r); q.dispose(); };
    q.onDidChangeValue(() => { q.activeItems = []; }); // a lista reativa o 1º item ao filtrar: Enter continua valendo para o link
    q.onDidAccept(() => {
      if (q.selectedItems[0] === item) return fechar({ documento: true });
      const link = String(q.value || '').trim();
      if (link) fechar({ link });
    });
    q.onDidHide(() => fechar(null));
    q.show();
  });
}

module.exports = { pedir, ANEXAR };
