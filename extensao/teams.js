const vscode = require('vscode');
const { execFile } = require('child_process');
const { trazerParaFrente } = require('./emulador');

// O Teams não abre dentro do VS Code (a Microsoft bloqueia iframe). Este botão usa a janela
// que já existe na máquina: ~/.local/share/applications/teams.desktop (Chromium --app, perfil chromium-teams).
const aberto = () => new Promise((r) => execFile('pgrep', ['-f', 'user-data-dir=.*chromium-teams'], (err) => r(!err)));

exports.abrir = async () => {
  if (await aberto()) {
    if (!await trazerParaFrente(0, 'Microsoft Teams')) vscode.window.showWarningMessage('O Teams está aberto, mas não achei a janela dele (está minimizado na bandeja?).');
  } else {
    execFile('gtk-launch', ['teams'], (err) => err && vscode.window.showErrorMessage('Não consegui abrir o Teams: ' + err.message));
  }
};
