const vscode = require('vscode');

exports.activate = (ctx) => {
  // O ícone de entrada é o da Crafting Table: o chat oficial do Claude é movido (uma vez) para o nosso contêiner.
  // Se o usuário arrastar o chat de volta, a extensão respeita.
  if (!ctx.globalState.get('claudeMovido')) {
    vscode.commands.executeCommand('vscode.moveViews', { viewIds: ['claudeVSCodeSidebarSecondary'], destinationId: 'workbench.view.extension.craftingTable' })
      .then(() => ctx.globalState.update('claudeMovido', true), () => {});
  }
  ctx.subscriptions.push(
    require('./sessao').iniciar(),
    require('./notas').provider(),
    require('./ticket').provider(ctx),
    require('./comandos').provider(ctx),
    require('./evidencias').provider(ctx),
    require('./emulador').provider(),
    require('./documentos').provider(),
    require('./cofre').provider(ctx),
    require('./conversas').provider(),
    require('./refinamentos').provider(),
    require('./testes').iniciar(),
    ...Object.entries({
      abrirClaude: 'craftingTable',
      abrirNotas: 'claudeAbas-notas',
      abrirTicket: 'claudeAbas-ticket',
      abrirComandos: 'claudeAbas-comandos',
      abrirEvidencias: 'claudeAbas-evidencias',
      abrirDocumentos: 'claudeAbas-documentos',
      abrirCofre: 'claudeAbas-cofre',
      abrirConversas: 'claudeAbas-conversas',
      abrirRefinamentos: 'claudeAbas-refinamentos'
    }).map(([cmd, container]) => vscode.commands.registerCommand(`claudeAbas.${cmd}`,
      () => vscode.commands.executeCommand(`workbench.view.extension.${container}`))),
    vscode.commands.registerCommand('claudeAbas.abrirEmulador', () => {
      vscode.commands.executeCommand('workbench.view.extension.claudeAbas-emuladores');
      require('./emulador').focarAbertos();
    }),
    vscode.commands.registerCommand('claudeAbas.atualEmulador', require('./emulador').focarAbertos),
    vscode.commands.registerCommand('claudeAbas.abrirTeams', require('./teams').abrir),
    ...['Claude', 'Notas', 'Ticket', 'Comandos', 'Evidencias', 'Documentos', 'Cofre', 'Conversas', 'Refinamentos'].map((t) => vscode.commands.registerCommand(`claudeAbas.atual${t}`, () => {}))
  );
};
