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
    require('./painel').provider(ctx), // Tickets: lista e o ticket aberto (seção principal do grupo)
    require('./comandos').provider(ctx),
    require('./evidencias').provider(ctx),
    require('./emulador').provider(),
    require('./cofre').provider(ctx),
    require('./conversas').provider(),
    require('./testes').iniciar(),
    require('./teams').encaminhar(ctx), // avisos do 🔔 para o Teams (só com TEAMS_WEBHOOK no Cofre)
    require('./grupo').provider(ctx), // Tickets: painel + Comandos, Emulador, Evidências, Cofre e Conversas dentro do ticket
    ...Object.entries({
      abrirClaude: 'craftingTable',
      abrirTickets: 'claudeAbas-tickets'
    }).map(([cmd, container]) => vscode.commands.registerCommand(`claudeAbas.${cmd}`,
      () => vscode.commands.executeCommand(`workbench.view.extension.${container}`))),
    vscode.commands.registerCommand('claudeAbas.abrirTeams', require('./teams').abrir),
    vscode.commands.registerCommand('claudeAbas.testarTeams', () => require('./teams').testar(ctx))
  );
};
