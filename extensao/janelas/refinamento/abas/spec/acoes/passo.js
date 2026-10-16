// @ts-check
// Cliques no cartão do passo: abrir o arquivo, ver mudanças, refinamento.md, mencionar, reconciliar e pedir ajuste.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const maestro = require('../../../../../infra/agentes/maestro');
const { arquivoPasso, estadoSpec } = require('../../../locais');
const orq = require('../../../orquestrador');
const { pasta, copiaAprovada } = require('../comum');
const { abertos } = require('../abertos');

const mencionar = (texto) => require('../../../../../infra/agentes/conversa').mencionar(texto);

const acoes = (s) => ({
  specAbrir({ id }) {
    const r = s.ticketAberto(),
      n = Number(id),
      est = estadoSpec(r);
    const arq = arquivoPasso(r, n);
    if (!fs.existsSync(arq)) return vscode.window.showWarningMessage(`O arquivo ainda não existe: ${arq}`);
    abertos.add(`${r.id}:${n}:${est?.passos[n]?.hash}`); // libera o Aprovar: só depois de ler
    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arq));
    s.render();
  },
  specMudancas({ id }) {
    const r = s.ticketAberto(),
      n = Number(id),
      est = estadoSpec(r);
    abertos.add(`${r.id}:${n}:${est?.passos[n]?.hash}`); // ver o diff também conta como leitura
    vscode.commands.executeCommand(
      'vscode.diff',
      vscode.Uri.file(copiaAprovada(r, n)),
      vscode.Uri.file(arquivoPasso(r, n)),
      `${path.basename(arquivoPasso(r, n))}: aprovado ↔ atual`
    );
    s.render();
  },
  // refinamento.md: gera de novo (a pasta da spec pode ter mudado) e abre a prévia.
  refinamentoAbrir() {
    const r = s.ticketAberto();
    const arq = r && require('../../../pacote').gravar(r.id);
    if (!arq) return vscode.window.showWarningMessage('A spec ainda não existe: não há refinamento para reunir.');
    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arq));
  },
  specMencionar({ id }) {
    mencionar(`@${arquivoPasso(s.ticketAberto(), Number(id))}`);
  },
  specContinuar() {
    return require('.').acoes(s).refinar();
  }, // refinar mora em iniciar.js
  async specAjuste({ id }) {
    const r = s.ticketAberto(),
      n = Number(id);
    if (maestro.rodando(pasta(r.id)))
      return vscode.window.showWarningMessage('O Claude ainda está trabalhando neste ticket: espere a etapa terminar.');
    const texto = await vscode.window.showInputBox({
      title: `Ajuste no passo ${n} (${estadoSpec(r)?.passos[n]?.titulo})`,
      prompt: 'O que o Claude deve mudar?',
      ignoreFocusOut: true
    });
    if (!texto?.trim()) return;
    await orq.sdd(['ajuste', String(n), '--ref', pasta(r.id), '--motivo', texto.trim()]);
    orq.ajustar(r, n, texto.trim());
  }
});

module.exports = { acoes };
