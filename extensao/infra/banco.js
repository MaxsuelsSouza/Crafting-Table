// @ts-check
// Banco para a IA em segundo plano: lê a configuração (Configurações > Banco) e entrega o env do mapa-db e o texto do prompt.
// Só leitura via <mapa>/bin/mapa-db, só quando configurado e fora de produção; sem isso a IA não consulta e registra pendência.
const path = require('path');
const lib = require('../plugins/mapa/lib/banco');

/** @param {{ get: (k: string) => any }} c */
const daConfig = (c) => ({ conexao: c.get('bancoConexao') || '', ambiente: c.get('bancoAmbiente') || '', sqlcl: c.get('bancoSqlcl') || '', sensiveis: c.get('bancoColunasSensiveis') || [] });
const liberado = (b) => !!(b.conexao && b.ambiente && b.ambiente !== 'producao');
const texto = (b) => (liberado(b) ? `configurado (${b.ambiente === 'qas' ? 'QAS' : 'cópia de produção'}): mapa-db, só leitura` : 'NÃO configurado: não consulte banco; registre como pendência');
/** Variáveis que o mapa-db lê; log em <dir>/.mapa-db.jsonl. */
const env = (b, dir) => ({ MAPA_DB_CONEXAO: b.conexao, MAPA_DB_AMBIENTE: b.ambiente, MAPA_DB_SQLCL: b.sqlcl, MAPA_DB_SENSIVEIS: b.sensiveis.join(','), MAPA_DB_LOG: path.join(dir, '.mapa-db.jsonl') });

// ── Alteração de massa (a única escrita no banco que a esteira de QA faz): lote proposto pela IA, aprovado por você e executado pela extensão ──
const limpo = (sql) => String(sql).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').replace(/'(?:[^']|'')*'/g, "''").replace(/"[^"]*"/g, '""');
const PROIBIDAS = /\b(drop|alter|create|truncate|grant|revoke|merge|begin|declare|call|execute|exec|commit|rollback|savepoint|lock|rename|purge|flashback|connect|spool|host|start|copy)\b/i;
/**
 * Só INSERT/UPDATE/DELETE; UPDATE e DELETE com WHERE; nada de DDL, PL/SQL, db link, DBMS_/UTL_ nem controle de transação.
 * @returns {{ ok: boolean, erro?: string, stmts: string[] }}
 */
function validarAlteracao(texto, { max = 25 } = {}) {
  const stmts = lib.dividir(String(texto || ''));
  if (!stmts.length) return { ok: false, erro: 'nenhuma instrução', stmts };
  if (stmts.length > max) return { ok: false, erro: `no máximo ${max} instruções por lote (tem ${stmts.length})`, stmts };
  for (const s of stmts) {
    const l = limpo(s).trim(), verbo = l.match(/^\w+/)?.[0]?.toLowerCase();
    if (!['insert', 'update', 'delete'].includes(verbo)) return { ok: false, erro: `"${verbo || '?'}" não é permitido (só INSERT, UPDATE e DELETE): ${s.slice(0, 60)}`, stmts };
    if (verbo !== 'insert' && !/\bwhere\b/i.test(l)) return { ok: false, erro: `${verbo.toUpperCase()} sem WHERE recusado: ${s.slice(0, 60)}`, stmts };
    const p = l.match(PROIBIDAS);
    if (p) return { ok: false, erro: `"${p[0].toLowerCase()}" não é permitido: ${s.slice(0, 60)}`, stmts };
    if (l.includes('@') || /\b(dbms_|utl_)\w*/i.test(l)) return { ok: false, erro: `link de banco e pacotes DBMS_/UTL_ não são permitidos: ${s.slice(0, 60)}`, stmts };
  }
  return { ok: true, stmts };
}
/**
 * Roda o lote na conexão salva do SQLcl numa transação só: qualquer erro desfaz tudo. Recusa produção e conexão sem ambiente definido.
 * @param {{ conexao: string, ambiente: string, sqlcl?: string }} b
 * @param {string[]} stmts instruções já validadas
 */
async function executar(b, stmts, { timeoutMs = 120000 } = {}) {
  if (!liberado(b)) return { ok: false, saida: 'banco não configurado ou marcado como produção (Configurações → Banco de dados): nada foi executado' };
  const v = validarAlteracao(stmts.join(';\n'));
  if (!v.ok) return { ok: false, saida: v.erro };
  const sqlcl = lib.acharSqlcl(b.sqlcl), conexao = String(b.conexao).replace(/[^\w .-]/g, '');
  if (!sqlcl) return { ok: false, saida: 'SQLcl não encontrado (Configurações → Banco de dados)' };
  const script = [`connect -name ${conexao}`, 'whenever sqlerror exit failure rollback', 'set feedback on', ...v.stmts.map((x) => `${x.replace(/;+\s*$/, '')};`), 'commit;', 'exit', ''].join('\n');
  const r = await lib.rodarSqlcl(sqlcl, script, timeoutMs);
  const saida = `${r.out}\n${r.erro || ''}`.trim();
  return { ok: !r.estourou && !/ORA-\d|SP2-\d|Connection Failed/i.test(saida), saida: saida.slice(-2000) };
}

module.exports = { daConfig, liberado, texto, env, validarAlteracao, executar };
