// @ts-check
// Banco pelo MCP do SQLcl (`sql -mcp`): uma sessão aberta por conexão, para a extensão e para a IA.
//   cliente.js     processo e JSON-RPC por stdio
//   sessao.js      uma sessão por conexão (conecta, fixa número/data, fecha ociosa)
//   consultar.js   SELECT em lote, mesmo contrato do mapa-db (validação, só leitura, máscara, log)
//   claude.js      o servidor, as ferramentas e o hook para a sessão do claude -p
//   so-select.js   o hook: só SELECT e só a conexão configurada
// Usado por janelas/qa/orquestrador/banco.js. O mapa-db (infra/plugins/mapa) fica de reserva, só com a confirmação do humano.
const { consultar, saude } = require('./consultar');
const { fechar } = require('./sessao');
const { paraClaude } = require('./claude');

module.exports = { consultar, saude, fechar, paraClaude };
