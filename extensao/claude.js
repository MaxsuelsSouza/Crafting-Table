const vscode = require('vscode');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Escreve o texto na caixa da conversa atual do Claude da barra lateral (sem enviar).
// A extensão do Claude não tem comando para isso: foca a caixa e cola pela área de
// transferência, que volta ao conteúdo anterior logo depois.
exports.enviar = async (texto) => {
  const anterior = await vscode.env.clipboard.readText();
  await vscode.env.clipboard.writeText(texto);
  await vscode.commands.executeCommand('claude-vscode.sidebar.open');
  await esperar(300);
  // claude-vscode.focus anexaria a seleção do editor como @menção; só usa sem seleção.
  if (vscode.window.activeTextEditor?.selection.isEmpty !== false) await vscode.commands.executeCommand('claude-vscode.focus');
  await esperar(300);
  await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
  await esperar(500);
  await vscode.env.clipboard.writeText(anterior);
};

// Botão @ das abas: cola só a referência (arquivo como @/caminho, o resto como bloco curto) para o usuário completar a frase.
exports.mencionar = (texto) => exports.enviar(texto.trimEnd() + ' ');
