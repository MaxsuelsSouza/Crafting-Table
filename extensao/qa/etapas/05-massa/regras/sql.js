// @ts-check
// O que um lote de alteração de massa pode ter (veio de infra/agentes/banco.js; só o QA escreve no banco).
const lib = require('../../../../infra/plugins/mapa/lib/banco');

// ── Alteração de massa (a única escrita no banco que a esteira de QA faz): lote proposto pela IA, aprovado por você e executado pela extensão ──
const limpo = (sql) =>
  String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"[^"]*"/g, '""');
const PROIBIDAS =
  /\b(drop|alter|create|truncate|grant|revoke|merge|begin|declare|call|execute|exec|commit|rollback|savepoint|lock|rename|purge|flashback|connect|spool|host|start|copy)\b/i;
/**
 * Só INSERT/UPDATE/DELETE; UPDATE e DELETE com WHERE; nada de DDL, PL/SQL, db link, DBMS_/UTL_ nem controle de transação.
 * @returns {{ ok: boolean, erro?: string, stmts: string[] }}
 */
function validarAlteracao(texto, { max = 25 } = {}) {
  const stmts = lib.dividir(String(texto || ''));
  if (!stmts.length) return { ok: false, erro: 'nenhuma instrução', stmts };
  if (stmts.length > max)
    return { ok: false, erro: `no máximo ${max} instruções por lote (tem ${stmts.length})`, stmts };
  for (const s of stmts) {
    const l = limpo(s).trim(),
      verbo = l.match(/^\w+/)?.[0]?.toLowerCase();
    if (!['insert', 'update', 'delete'].includes(verbo))
      return {
        ok: false,
        erro: `"${verbo || '?'}" não é permitido (só INSERT, UPDATE e DELETE): ${s.slice(0, 60)}`,
        stmts
      };
    if (verbo !== 'insert' && !/\bwhere\b/i.test(l))
      return { ok: false, erro: `${verbo.toUpperCase()} sem WHERE recusado: ${s.slice(0, 60)}`, stmts };
    const p = l.match(PROIBIDAS);
    if (p) return { ok: false, erro: `"${p[0].toLowerCase()}" não é permitido: ${s.slice(0, 60)}`, stmts };
    if (l.includes('@') || /\b(dbms_|utl_)\w*/i.test(l))
      return { ok: false, erro: `link de banco e pacotes DBMS_/UTL_ não são permitidos: ${s.slice(0, 60)}`, stmts };
  }
  return { ok: true, stmts };
}

module.exports = { limpo, PROIBIDAS, validarAlteracao };
