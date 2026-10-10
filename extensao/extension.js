// @ts-check
const vscode = require('vscode');

exports.activate = (ctx) => {
  // O ícone de entrada é o da Crafting Table: o chat oficial do Claude é movido (uma vez) para o nosso contêiner.
  // Se o usuário arrastar o chat de volta, a extensão respeita.
  if (!ctx.globalState.get('claudeMovido')) {
    vscode.commands.executeCommand('vscode.moveViews', { viewIds: ['claudeVSCodeSidebarSecondary'], destinationId: 'workbench.view.extension.craftingTable' })
      .then(() => ctx.globalState.update('claudeMovido', true), () => {});
  }
  ctx.subscriptions.push(
    require('./infra/sessao').iniciar(),
    require('./painel/painel').provider(ctx), // Tickets: lista e o ticket aberto (seção principal do grupo)
    require('./modulos/comandos').provider(ctx),
    require('./modulos/evidencias').provider(ctx),
    require('./modulos/emulador').provider(),
    require('./modulos/cofre').provider(ctx),
    require('./modulos/conversas').provider(),
    require('./integracoes/testes').iniciar(),
    require('./integracoes/teams').encaminhar(ctx), // avisos do 🔔 para o Teams (só com TEAMS_WEBHOOK no Cofre)
    require('./infra/grupo').provider(ctx), // Tickets: painel + Comandos, Emulador, Evidências, Cofre e Conversas dentro do ticket
    ...Object.entries({
      abrirClaude: 'craftingTable',
      abrirTickets: 'claudeAbas-tickets'
    }).map(([cmd, container]) => vscode.commands.registerCommand(`claudeAbas.${cmd}`,
      () => vscode.commands.executeCommand(`workbench.view.extension.${container}`))),
    vscode.commands.registerCommand('claudeAbas.abrirTeams', require('./integracoes/teams').abrir),
    vscode.commands.registerCommand('claudeAbas.testarTeams', () => require('./integracoes/teams').testar(ctx))
  );
};
