// @ts-check
// A busca não achou registro: monta os UPDATEs da receita (produzir) sobre registros-base e junta TODOS numa proposta só
// (uma aprovação para o lote inteiro). Aprovado e executado, a busca filtrada pela chave de cada registro confirma e vira a massa.
const { maiusculas, conferencia } = require('./buscar');

const literal = (v) =>
  v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
// ${COL} → valor do registro-base como literal SQL ('${COL}' entre aspas também vira o literal certo).
const preencher = (sql, linha) =>
  String(sql)
    .replace(/'\$\{(\w+)\}'/g, (m, k) => (k.toUpperCase() in linha ? literal(linha[k.toUpperCase()]) : m))
    .replace(/\$\{(\w+)\}/g, (m, k) => (k.toUpperCase() in linha ? literal(linha[k.toUpperCase()]) : m));
const filtroChave = (p, linha) =>
  `SELECT * FROM (${p.busca}) WHERE ${p.produzir.chave.map((k) => `${String(k).toUpperCase()} = ${literal(linha[String(k).toUpperCase()])}`).join(' AND ')}`;

/**
 * @param {any} receita
 * @param {{ papel: number, cenarios: string[] }[]} faltam
 * @param {(sqls: string[]) => Promise<{ erro?: string, resultados?: any[] }>} consultar
 * @returns {Promise<{ proposta: any|null, semJeito: { papel: number, cenarios: string[], motivo: string }[] }>}
 */
async function montarProducao(receita, faltam, consultar) {
  const comProduzir = faltam.filter((f) => receita.papeis[f.papel].produzir),
    semJeito = faltam
      .filter((f) => !receita.papeis[f.papel].produzir)
      .map((f) => ({ ...f, motivo: 'a busca não achou registro e a receita não diz como produzir' }));
  if (!comProduzir.length) return { proposta: null, semJeito };
  const papeis = [...new Set(comProduzir.map((f) => f.papel))];
  const res = await consultar(papeis.map((i) => receita.papeis[i].produzir.base));
  if (res.erro)
    return { proposta: null, semJeito: [...semJeito, ...comProduzir.map((f) => ({ ...f, motivo: res.erro }))] };
  const bases = Object.fromEntries(papeis.map((i, k) => [i, (res.resultados?.[k]?.itens || []).map(maiusculas)]));
  const sql = [],
    desfazer = [],
    itens = [];
  for (const f of comProduzir) {
    const p = receita.papeis[f.papel],
      linha = bases[f.papel].shift();
    if (!linha) {
      semJeito.push({
        ...f,
        motivo: `nenhum registro-base para produzir (${res.resultados?.[papeis.indexOf(f.papel)]?.erro || 'base vazia'})`
      });
      continue;
    }
    sql.push(preencher(p.produzir.sql, linha));
    desfazer.push(preencher(p.produzir.desfazer, linha));
    itens.push({
      papel: p.papel,
      cenarios: f.cenarios,
      busca: p.busca,
      conferir: filtroChave(p, linha),
      desfazer: preencher(p.produzir.desfazer, linha)
    });
  }
  if (!itens.length) return { proposta: null, semJeito };
  return {
    proposta: {
      papel: itens.map((i) => i.papel).join(' · '),
      cenarios: [...new Set(itens.flatMap((i) => i.cenarios))],
      sql: sql.join(';\n'),
      desfazer: desfazer.join(';\n'),
      porque: `A busca da receita não achou registro para ${itens.map((i) => `${i.papel} (${i.cenarios.join(', ')})`).join('; ')}: ajuste por UPDATE em registro existente, um por cenário`,
      receita: itens
    },
    semJeito
  };
}

/** Depois de executado: confirma cada registro pela busca filtrada na chave e devolve as massas a registrar. */
async function confirmarProduzidos(itens, consultar) {
  const res = await consultar(itens.map((i) => i.conferir));
  if (res.erro) return { registros: [], erros: [res.erro] };
  const registros = [],
    erros = [];
  itens.forEach((i, k) => {
    const l = res.resultados?.[k]?.itens?.[0];
    if (!l)
      return erros.push(
        `${i.papel}: o UPDATE rodou mas a busca ainda não acha o registro (a receita precisa de ajuste)`
      );
    const dados = maiusculas(l);
    registros.push({
      papel: i.papel,
      cenarios: i.cenarios,
      dados,
      consulta: conferencia(i.busca, dados),
      desfazer: i.desfazer
    });
  });
  return { registros, erros };
}

module.exports = { montarProducao, confirmarProduzidos, preencher };
