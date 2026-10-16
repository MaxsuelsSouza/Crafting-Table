// @ts-check
// Receita de massa (qa/massa-receita.json): a IA escreve UMA vez no 6.0 Gerar; a extensão roda quantas vezes precisar, sem IA
// (no ▶, depois do refresh do banco, quando uma massa é consumida ou fica inválida).
// {
//   "papeis": [{
//     "papel": "pedido faturado sem proprietário",          o que o registro representa
//     "cenarios": ["CT01", "CT02"],
//     "por_cenario": true,                                   true: um registro para cada cenário (consome); false: um só para todos
//     "busca": "SELECT NUMPEDIDO, SITUACAO FROM … WHERE …",   candidatos; as colunas viram ${NUMPEDIDO}, ${SITUACAO} no roteiro
//     "produzir": {                                          opcional: a busca não achou → UPDATE num registro-base (o humano aprova)
//       "base": "SELECT NUMPEDIDO FROM … WHERE …",           registros que podem virar a massa
//       "chave": ["NUMPEDIDO"],                              colunas que identificam o registro (base e busca)
//       "sql": "UPDATE … SET … WHERE NUMPEDIDO = ${NUMPEDIDO}",
//       "desfazer": "UPDATE … SET <valores originais> WHERE NUMPEDIDO = ${NUMPEDIDO}" } }],
//   "dispensa": ["CT07"]                                     cenários que não precisam de massa
// }
const { validar: validarSelect } = require('../../../../../infra/plugins/mapa/lib/banco');
const { validarAlteracao } = require('../regras/sql');

const ARQUIVO = 'massa-receita.json';

/** @param {any} r @param {string[]} ids cenários do plano @param {string[]} exigir os que esta volta precisa cobrir @returns {string[]} */
function validarReceita(r, ids = [], exigir = ids) {
  if (!r || typeof r !== 'object') return ['receita não é um objeto JSON'];
  const erros = [],
    papeis = Array.isArray(r.papeis) ? r.papeis : null,
    dispensa = Array.isArray(r.dispensa) ? r.dispensa : [];
  if (!papeis) return ['falta "papeis" (lista; vazia se nenhum cenário precisa de massa)'];
  papeis.forEach((p, i) => {
    const onde = `papel ${i + 1}${p?.papel ? ` (${p.papel})` : ''}`;
    if (!String(p?.papel || '').trim()) erros.push(`${onde}: sem "papel"`);
    if (!Array.isArray(p?.cenarios) || !p.cenarios.length) erros.push(`${onde}: sem "cenarios"`);
    const fora = (p?.cenarios || []).filter((c) => ids.length && !ids.includes(c));
    if (fora.length) erros.push(`${onde}: cenário fora do plano: ${fora.join(', ')}`);
    const v = validarSelect(p?.busca);
    if (!v.ok) erros.push(`${onde}: busca: ${v.erro}`);
    if (p?.produzir) {
      const pr = p.produzir,
        b = validarSelect(pr.base);
      if (!b.ok) erros.push(`${onde}: produzir.base: ${b.erro}`);
      if (!Array.isArray(pr.chave) || !pr.chave.length)
        erros.push(`${onde}: produzir.chave (colunas que identificam o registro)`);
      for (const k of ['sql', 'desfazer']) {
        const a = validarAlteracao(pr[k]);
        if (!a.ok) erros.push(`${onde}: produzir.${k}: ${a.erro}`);
        else if (a.stmts.some((x) => !/^\s*update\b/i.test(x))) erros.push(`${onde}: produzir.${k}: só UPDATE`);
        if (!/\$\{\w+\}/.test(String(pr[k] || '')))
          erros.push(`${onde}: produzir.${k} precisa usar \${COLUNA} do registro-base`);
      }
    }
  });
  const cobertos = new Set([...papeis.flatMap((p) => p?.cenarios || []), ...dispensa]);
  const faltam = exigir.filter((c) => !cobertos.has(c));
  if (faltam.length) erros.push(`cenários sem papel nem dispensa: ${faltam.join(', ')} (diga se precisam de massa)`);
  return erros;
}

module.exports = { ARQUIVO, validarReceita };
