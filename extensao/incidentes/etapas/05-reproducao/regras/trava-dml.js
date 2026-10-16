// @ts-check
// Trava de prova da etapa 5 (usada na 5.2): só INSERT em linhas novas (Massa de Teste); a trava recusa DML que cite chave da Massa Real.
const banco = require('../../../../plugins/mapa/lib/banco');

// ── Trava de prova: chaves da Massa Real = números de 4+ dígitos e códigos (strings com dígito, 4+ chars) do massa-real.sql.
// ponytail: heurística por literal; chave curta (id de 1 a 3 dígitos) escapa. Troque por parse das colunas-chave se virar problema.
const chavesReais = (sql) => {
  const k = new Set(),
    semCom = String(sql)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ');
  const resto = semCom.replace(/'((?:[^']|'')*)'/g, (_, v) => {
    if (v.length >= 4 && /\d/.test(v)) k.add(v.toLowerCase());
    return ' ';
  });
  for (const m of resto.matchAll(/\b\d{4,}\b/g)) k.add(m[0]);
  return k;
};
const citaChave = (stmt, chaves) => {
  const t = stmt.toLowerCase();
  return [...chaves].find((c) =>
    /^\d+$/.test(c) ? new RegExp(`(^|[^\\d.])${c}([^\\d]|$)`).test(t) : t.includes(`'${c}'`)
  );
};
// Devolve { ok, erro? }. Só INSERT/UPDATE/DELETE; nenhum pode citar chave real; DDL, MERGE e PL/SQL recusados.
function travaDml(sqlTeste, sqlReal) {
  const chaves = chavesReais(sqlReal),
    stmts = banco.dividir(sqlTeste);
  if (!stmts.length) return { ok: false, erro: 'massa-teste.sql vazio' };
  for (const s of stmts) {
    const verbo = s
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ')
      .trim()
      .match(/^\w+/)?.[0]
      ?.toLowerCase();
    if (!['insert', 'update', 'delete'].includes(verbo))
      return {
        ok: false,
        erro: `comando "${verbo}" não é permitido na Massa de Teste (só INSERT/UPDATE/DELETE em linhas novas)`
      };
    if (
      verbo !== 'insert' &&
      !/\bwhere\b/i.test(
        s
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/--[^\n]*/g, ' ')
          .replace(/'(?:[^']|'')*'/g, "''")
      )
    )
      return {
        ok: false,
        erro: `${verbo.toUpperCase()} sem WHERE mexeria em linhas que não são suas: ${s.slice(0, 80)}`
      };
    const c = citaChave(s, chaves);
    if (c)
      return { ok: false, erro: `o comando mexe na chave ${c} da Massa Real (prova preservada): ${s.slice(0, 80)}` };
  }
  return { ok: true };
}

module.exports = { chavesReais, citaChave, travaDml };
