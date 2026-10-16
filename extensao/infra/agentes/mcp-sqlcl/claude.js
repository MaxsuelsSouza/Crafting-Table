// @ts-check
// O MCP do SQLcl na sessão da IA (claude -p): servidor só desta sessão (--mcp-config), as ferramentas liberadas e o hook (SELECT, e UPDATE sempre com WHERE).
// Usado por janelas/qa/orquestrador/banco.js. O --strict-mcp-config do enxuto.js continua: entra só este servidor.
const path = require('path');
const lib = require('../../plugins/mapa/lib/banco');
const { LOCALE } = require('./cliente');

const SERVIDOR = 'sqlcl';
const FERRAMENTAS = ['connect', 'sql_run', 'schema_information', 'connections_list'].map((t) => `mcp__${SERVIDOR}__${t}`);
const PROIBIDAS = ['sqlcl_run', 'disconnect', 'annotation_generate', 'skills_sync', 'request_status'].map((t) => `mcp__${SERVIDOR}__${t}`);
const HOOK = path.join(__dirname, 'so-select.js');

/** @param {{ conexao: string, sqlcl?: string }} b */
function paraClaude(b) {
  const bin = lib.acharSqlcl(b.sqlcl) || 'sql';
  const jh = process.env.MAPA_DB_JAVA_HOME || process.env.JAVA_HOME || '/usr/lib/jvm/java-17-openjdk-amd64';
  const mcp = { mcpServers: { [SERVIDOR]: { command: bin, args: ['-mcp'], env: { ...LOCALE, JAVA_HOME: jh } } } };
  return {
    ferramentas: FERRAMENTAS,
    proibidas: PROIBIDAS,
    extras: ['--mcp-config', JSON.stringify(mcp)],
    // vai no --settings do enxuto.js (um --settings só por sessão)
    hooks: { PreToolUse: [{ matcher: `mcp__${SERVIDOR}__.*`, hooks: [{ type: 'command', command: `node "${HOOK}"` }] }] },
    env: { QA_DB_CONEXAO: String(b.conexao) },
    texto:
      `pelo MCP ${SERVIDOR} (rápido, ~0,1 s por consulta): primeiro mcp__${SERVIDOR}__connect com connection_name "${b.conexao}", depois ` +
      `mcp__${SERVIDOR}__sql_run com SELECT (uma consulta por chamada). Escrita: só UPDATE, uma instrução por chamada e SEMPRE com WHERE pela chave do registro ` +
      '(sem WHERE, 1=1, INSERT, DELETE e DDL são recusados); antes leia por SELECT os valores originais, e depois do UPDATE rode COMMIT (a sessão não faz autocommit). ' +
      'Para colunas de uma tabela use a aba Conhecimentos antes de consultar o dicionário'
  };
}

module.exports = { paraClaude, FERRAMENTAS, PROIBIDAS, SERVIDOR, HOOK };
