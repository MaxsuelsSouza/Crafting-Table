// @ts-check
// Menções do comentário da dúvida (QuickPick do VS Code).
const vscode = require('vscode');
const jira = require('../../../../infra/provedores/fachada').jira;

// Busca pessoas no Jira enquanto digita; Enter numa pessoa a menciona (Enter de novo remove), "Concluir" segue.
// Devolve [{ id, nome }] (vazio = ninguém) ou undefined se cancelou.
function escolherMencoes(t, secrets) {
  return new Promise((resolve) => {
    const qp = /** @type {vscode.QuickPick<vscode.QuickPickItem & { fim?: boolean, p?: any }>} */ (
        vscode.window.createQuickPick()
      ),
      escolhidas = new Map();
    qp.ignoreFocusOut = true;
    qp.matchOnDescription = true;
    qp.placeholder = `Digite parte do nome ou do e-mail para buscar no ${jira.ehDocumento(t) ? 'documento' : jira.nome}`;
    let seq = 0,
      timer,
      fim = false;
    const titulo = () => {
      const ja = [...escolhidas.values()].map((p) => '@' + p.nome).join(', ');
      qp.title = ja ? `Mencionando: ${ja}` : `Mencionar alguém no comentário do ${t.chave}?`;
    };
    const concluir = () => ({
      label: escolhidas.size ? '$(check) Concluir menções' : '$(check) Enviar sem menção',
      alwaysShow: true,
      fim: true
    });
    const pessoa = (p) => ({
      label: p.nome,
      description: escolhidas.has(p.id) ? 'mencionada · Enter remove' : '',
      alwaysShow: true,
      p
    });
    const inicio = () => {
      qp.busy = false;
      qp.items = [concluir(), ...[...escolhidas.values()].map(pessoa)];
    };
    qp.onDidChangeValue((v) => {
      clearTimeout(timer);
      const n = ++seq;
      if (!v.trim()) return inicio();
      qp.busy = true;
      timer = setTimeout(async () => {
        let itens;
        try {
          const achadas = await jira.pessoas(secrets, jira.alvo(t), v.trim());
          itens = achadas.length
            ? achadas.map(pessoa)
            : [{ label: `Ninguém encontrado para "${v}"`, alwaysShow: true }];
        } catch (e) {
          itens = [{ label: `$(error) ${e.message}`, alwaysShow: true }];
        }
        if (n !== seq) return;
        qp.busy = false;
        qp.items = itens;
      }, 300);
    });
    qp.onDidAccept(() => {
      const i = qp.activeItems[0];
      if (!i) return;
      if (i.fim) {
        fim = true;
        resolve([...escolhidas.values()]);
        return qp.hide();
      }
      if (!i.p) return;
      if (escolhidas.has(i.p.id)) escolhidas.delete(i.p.id);
      else escolhidas.set(i.p.id, i.p);
      titulo();
      qp.value = '';
      inicio();
    });
    qp.onDidHide(() => {
      clearTimeout(timer);
      qp.dispose();
      if (!fim) resolve(undefined);
    });
    titulo();
    inicio();
    qp.show();
  });
}

module.exports = { escolherMencoes };
