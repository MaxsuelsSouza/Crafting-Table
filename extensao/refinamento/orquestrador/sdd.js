// @ts-check
// Chama o binário sdd-state do plugin sdd; erro vira aviso no VS Code. Devolve true se deu certo.
const vscode = require('vscode');
const { sddState } = require('../../configuracao/configuracao');

const sdd = (args) =>
  new Promise((ok) =>
    sddState()
      ? require('child_process').execFile(sddState(), args, (e, out, err) => {
          if (e) vscode.window.showErrorMessage(String(err || e.message).replace(/^sdd-state: /, ''));
          ok(!e);
        })
      : ok(false)
  );

module.exports = { sdd };
