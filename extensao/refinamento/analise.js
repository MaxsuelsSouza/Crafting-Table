// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { HANDOFF, arqHandoff } = require('./locais');

// Aba Análise (cards Backend/Mobile): por ora só as ações; a tela inteira entra aqui na etapa 10.
const acoes = (s) => ({
  handoffMencionar({ id }) { if (HANDOFF[id]) require('../claude').mencionar(`@${arqHandoff(s.ticketAberto(), id)}`); },
  handoffPrevia({ id }) { if (HANDOFF[id]) vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arqHandoff(s.ticketAberto(), id))); },
  handoffEditar({ id }) { if (HANDOFF[id]) vscode.commands.executeCommand('vscode.open', vscode.Uri.file(arqHandoff(s.ticketAberto(), id))); },
  handoffCriar({ id }) {
    const t = s.ticketAberto();
    if (!t || !HANDOFF[id]) return;
    const arq = arqHandoff(t, id);
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, `# Análise ${id} — ${t.chave} ${t.titulo || ''}\n\n## O que foi analisado\n\n## Arquivos e pontos de alteração\n\n## Riscos e dúvidas\n`);
    acoes(s).handoffEditar({ id });
  }
});

module.exports = { acoes };
