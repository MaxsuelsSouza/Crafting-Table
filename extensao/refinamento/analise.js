// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { HANDOFF, arqHandoff } = require('./locais');
const { markdown } = require('../componentes/markdown');

// Aba Análise (cards Backend/Mobile): a tela, o CSS do seletor de lado e as ações de handoff.
const corpoAba = (d) => {
  const texto = d.handoffs[d.lado];
  return `<div class="lado">${['backend', 'mobile'].map((l) => `<button data-acao="lado" data-id="${l}" class="${d.lado === l ? 'is-on' : ''}">${l === 'backend' ? 'Backend' : 'Mobile'}</button>`).join('')}</div>
    <div class="folha">${texto && texto.trim() ? `<div class="md">${markdown(texto)}</div>`
      : `<div class="vazio-aba">Ainda não há análise do ${d.lado}.<br>Mencione no Claude e peça para gravar a análise aqui.</div>`}
      <div class="acoes-aba"><div class="format-bar">
        <button class="fb-btn" data-acao="handoffMencionar" data-id="${d.lado}" title="Mencionar o arquivo no Claude">@ Mencionar</button>
        ${texto !== null ? `<span class="fb-sep"></span><button class="fb-btn" data-acao="handoffPrevia" data-id="${d.lado}">Prévia</button>
        <button class="fb-btn" data-acao="handoffEditar" data-id="${d.lado}">Editar</button>`
          : `<span class="fb-sep"></span><button class="fb-btn" data-acao="handoffCriar" data-id="${d.lado}">Criar arquivo</button>`}
      </div></div></div>`;
};

const CSS = `
  .lado { display: flex; gap: 4px; margin: 0 12px 10px; }
  .lado button { flex: 1; height: 28px; border-radius: var(--r-md); border: 1px solid var(--border) !important; background: var(--surface) !important; font-size: 12px; }
  .lado button.is-on { border-color: var(--accent) !important; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent) !important; }
`;

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

module.exports = { corpoAba, CSS, acoes };
