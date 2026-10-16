// @ts-check
// Roda as buscas da receita (todas numa chamada ao banco) e distribui os registros entre os cenários, sem IA e sem repetir registro.
// Cada massa registrada guarda uma consulta de conferência = a busca filtrada pelo próprio registro (o "Validar massa" fica exato).

// Colunas que identificam a linha (as que parecem chave primeiro), sem data nem coluna mascarada; no máximo 3.
function colunasChave(linha) {
  const ok = Object.entries(linha).filter(
    ([, v]) => v !== null && v !== '' && v !== '***' && typeof v !== 'object' && !/^\d{4}-\d\d-\d\d/.test(String(v))
  );
  const peso = ([k]) => (/^(id|num|cod|seq|nr|pk)|(_id|id)$/i.test(k) ? 0 : 1);
  return ok.sort((a, b) => peso(a) - peso(b)).slice(0, 3);
}
const literal = (v) => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const conferencia = (busca, linha) => {
  const ks = colunasChave(linha);
  return ks.length
    ? `SELECT * FROM (${busca}) WHERE ${ks.map(([k, v]) => `${k.toUpperCase()} = ${literal(v)}`).join(' AND ')}`
    : busca;
};
const maiusculas = (linha) => Object.fromEntries(Object.entries(linha).map(([k, v]) => [k.toUpperCase(), v]));
const assinatura = (dados) =>
  JSON.stringify(
    Object.keys(dados)
      .sort()
      .map((k) => [k.toUpperCase(), String(dados[k])])
  );

/**
 * @param {any} receita
 * @param {{ ok: boolean, itens?: any[], erro?: string }[]} resultados um por papel, na ordem da receita
 * @param {string[]} cens cenários que precisam de massa agora
 * @param {Record<string, any>[]} usados dados das massas válidas que já existem (não repete registro)
 * @returns {{ registros: { papel: string, cenarios: string[], dados: any, consulta: string }[], faltam: { papel: number, cenarios: string[] }[], erros: string[] }}
 */
function distribuir(receita, resultados, cens, usados = []) {
  const ja = new Set(usados.map(assinatura)),
    registros = [],
    faltam = [],
    erros = [];
  receita.papeis.forEach((p, i) => {
    const alvo = p.cenarios.filter((c) => cens.includes(c));
    if (!alvo.length) return;
    const r = resultados[i];
    if (!r?.ok) {
      erros.push(`${p.papel}: ${r?.erro || 'sem resposta do banco'}`);
      return faltam.push({ papel: i, cenarios: alvo });
    }
    const livres = r.itens.map(maiusculas).filter((l) => !ja.has(assinatura(l)));
    const grupos = p.por_cenario === false ? [alvo] : alvo.map((c) => [c]);
    for (const g of grupos) {
      const l = livres.shift();
      if (!l) {
        faltam.push({ papel: i, cenarios: g });
        continue;
      }
      ja.add(assinatura(l));
      registros.push({ papel: p.papel, cenarios: g, dados: l, consulta: conferencia(p.busca, l) });
    }
  });
  return { registros, faltam, erros };
}

module.exports = { distribuir, conferencia, maiusculas, assinatura };
