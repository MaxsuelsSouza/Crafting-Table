// @ts-check
// Consulta do roteiro: binds no SQL, comparação antes × depois (P7: 200 não prova efeito) e o .txt de evidência.

// :nome → literal. Número fica cru; o resto vai entre aspas com ' dobrada. O SQL já passou pela validação de só SELECT.
// ponytail: troca textual (não ignora :nome dentro de string do SQL); bind de verdade se o mapa-db passar a aceitar binds.
const comBinds = (sql, binds = {}) =>
  String(sql).replace(/:(\w+)\b/g, (m, n) => {
    if (!(n in binds)) return m;
    const v = String(binds[n]);
    return /^-?\d+(\.\d+)?$/.test(v) ? v : `'${v.replace(/'/g, "''")}'`;
  });

// Igual = mesmas colunas, na mesma ordem, e mesmas linhas (a skill só olhava as linhas: mudança de projeção passava como igual).
const chave = (r) => JSON.stringify([r.colunas, r.itens.map((it) => r.colunas.map((c) => it[c] ?? ''))]);
function comparar(ref, atual, esperado) {
  const iguais = chave(ref) === chave(atual),
    ok = esperado === 'igual' ? iguais : !iguais;
  return { ok, texto: `${iguais ? 'igual' : 'diferente'} de "${ref.nome}" (esperado: ${esperado})` };
}

// -- consulta `nome` em data (base) / sql / -- binds / tabela / -- N linha(s)
function texto({ nome, sql, binds, colunas, itens, base, em = new Date() }) {
  const cel = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return [
    `-- consulta \`${nome}\` em ${em.toISOString().replace('T', ' ').slice(0, 19)} (${base || '?'})`,
    sql,
    `-- binds: ${JSON.stringify(binds || {})}`,
    '',
    colunas.join(' | '),
    ...itens.map((it) => colunas.map((c) => cel(it[c])).join(' | ')),
    `-- ${itens.length} linha(s)`,
    ''
  ].join('\n');
}

module.exports = { comBinds, comparar, texto };
