// @ts-check
// Dependência externa da Etapa 5: roda o lote aprovado no SQLcl (veio de infra/agentes/banco.js) e as consultas só leitura
// (MCP do SQLcl; o mapa-db só com b.modo 'antigo', que o humano autorizou em orquestrador/banco.js).
const lib = require('../../../../infra/plugins/mapa/lib/banco');
const mcp = require('../../../../infra/agentes/mcp-sqlcl');
const { liberado } = require('../../../../infra/agentes/banco');
const { validarAlteracao } = require('./regras/sql');

/**
 * Roda o lote na conexão salva do SQLcl numa transação só: qualquer erro desfaz tudo. Recusa produção e conexão sem ambiente definido.
 * @param {{ conexao: string, ambiente: string, sqlcl?: string }} b
 * @param {string[]} stmts instruções já validadas
 */
async function executar(b, stmts, { timeoutMs = 120000 } = {}) {
  if (!liberado(b))
    return {
      ok: false,
      saida: 'banco não configurado ou marcado como produção (Configurações → Banco de dados): nada foi executado'
    };
  const v = validarAlteracao(stmts.join(';\n'));
  if (!v.ok) return { ok: false, saida: v.erro };
  const sqlcl = lib.acharSqlcl(b.sqlcl),
    conexao = String(b.conexao).replace(/[^\w .-]/g, '');
  if (!sqlcl) return { ok: false, saida: 'SQLcl não encontrado (Configurações → Banco de dados)' };
  const script = [
    `connect -name ${conexao}`,
    'whenever sqlerror exit failure rollback',
    'set feedback on',
    ...v.stmts.map((x) => `${x.replace(/;+\s*$/, '')};`),
    'commit;',
    'exit',
    ''
  ].join('\n');
  const r = await lib.rodarSqlcl(sqlcl, script, timeoutMs);
  const saida = `${r.out}\n${r.erro || ''}`.trim();
  return { ok: !r.estourou && !/ORA-\d|SP2-\d|Connection Failed/i.test(saida), saida: saida.slice(-2000) };
}

/**
 * Consultas só leitura (SELECT) na conexão salva, num lote só (MCP: sessão já aberta, ~0,1 s; antigo: um SQLcl por lote, ~10 s): [{ ok, colunas, itens, mascaradas, erro }] na ordem, ou { erro } se o banco não abriu.
 * @param {{ conexao: string, ambiente: string, sqlcl?: string, sensiveis?: string[] }} b
 */
async function consultar(b, sqls) {
  const res =
    b.modo === 'antigo'
      ? await lib.rodar({ ...b, limite: 200 }, sqls)
      : await mcp.consultar({ ...b, limite: 200 }, sqls);
  return res.erro ? { erro: res.erro } : { base: res.base, resultados: res.resultados };
}

module.exports = { executar, consultar };
