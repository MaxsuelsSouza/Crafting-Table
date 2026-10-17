// @ts-check
// Servidores MCP de uma execução (opção `mcp` do rodar: { mcpServers }) num --mcp-config só, junto com o que já vier em extras
// (ex.: o SQLcl do QA). Usado por rodar.js; quem passa: QA (orquestrador/claude.js) e Incidentes (5.4) com o ambiente web.
function juntarMcp(extras, mcp) {
  if (!mcp) return extras;
  const i = extras.indexOf('--mcp-config');
  if (i < 0) return [...extras, '--mcp-config', JSON.stringify(mcp)];
  let atual = {};
  try { atual = JSON.parse(extras[i + 1]); } catch {}
  const junto = { mcpServers: { ...(atual.mcpServers || {}), ...mcp.mcpServers } };
  return [...extras.slice(0, i), '--mcp-config', JSON.stringify(junto), ...extras.slice(i + 2)];
}

module.exports = { juntarMcp };
