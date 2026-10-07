const vscode = require('vscode');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Cola na caixa da conversa do Claude que está na frente (painel ou barra lateral) e devolve a área de transferência.
async function colar(texto) {
  const anterior = await vscode.env.clipboard.readText();
  await vscode.env.clipboard.writeText(texto);
  // claude-vscode.focus anexaria a seleção do editor como @menção; só usa sem seleção.
  if (vscode.window.activeTextEditor?.selection.isEmpty !== false) await vscode.commands.executeCommand('claude-vscode.focus');
  await esperar(300);
  await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
  await esperar(500);
  await vscode.env.clipboard.writeText(anterior);
}

// Conversa mais recente de um ticket que ainda tem histórico (dá para reabrir), de qualquer projeto.
exports.ultimaConversa = (t) => {
  const { historico } = require('./conversas')._teste;
  const fs = require('fs');
  return t.conversas.filter((sid) => fs.existsSync(historico(sid)))
    .sort((a, b) => fs.statSync(historico(b)).mtimeMs - fs.statSync(historico(a)).mtimeMs)[0] || null;
};

// Botão @ de todas as abas: abre a conversa no editor (como o ✦ do ticket) com a referência já escrita
// (arquivo como @/caminho, o resto como bloco curto) para o usuário completar a frase.
// Com ticket aberto no painel: a conversa do ticket; sem conversa ainda, uma nova que o painel vincula ao ticket
// (ela leva a pasta do ticket no texto). Sem ticket: a conversa atual.
exports.mencionar = async (texto) => {
  const sessao = require('./sessao'), tickets = require('./tickets');
  const chave = sessao.foco(), t = chave && tickets.ler(chave);
  let sid = t ? exports.ultimaConversa(t) : sessao.conversaAtual();
  if (t && !sid) {
    tickets.gravar({ ...t, pedidoEm: Date.now() });
    texto = `Ticket ${t.chave} (pasta do ticket: ${tickets.pasta(t.chave)})\n${texto}`;
  }
  texto = texto.trimEnd() + ' ';
  // Conversa nova: o texto vai junto. Conversa existente: o Claude recusa texto em conversa já aberta
  // ("Session is already open"), então abre/traz para frente sem texto e cola na caixa.
  if (!sid) return vscode.commands.executeCommand('claude-vscode.editor.open', undefined, texto);
  const antes = abasClaude();
  await vscode.commands.executeCommand('claude-vscode.editor.open', sid);
  await esperar(abasClaude() > antes ? 1500 : 300); // aba nova: espera a conversa carregar
  await colar(texto);
};

const abasClaude = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs)
  .filter((t) => t.input instanceof vscode.TabInputWebview && /claudeVSCodePanel/.test(t.input.viewType)).length;
