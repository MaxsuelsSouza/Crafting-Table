// @ts-check
// "Validar massa": a consulta que achou o registro ainda devolve ele? true | false. Sem consulta guardada: null (não dá para conferir).
// Confere pelas colunas de "dados" que a consulta devolve (as mascaradas ficam de fora: o valor vem trocado).
// ponytail: olha só as 200 primeiras linhas da consulta original; filtrar pela chave no SQL se uma consulta ampla der falso negativo.
function confere(item, res) {
  if (!res.itens.length) return false;
  const fora = new Set((res.mascaradas || []).map((c) => c.toLowerCase())),
    chaves = Object.keys(item.dados || {}).filter(
      (k) => res.colunas.includes(k.toLowerCase()) && !fora.has(k.toLowerCase())
    );
  if (!chaves.length) return true;
  return res.itens.some((l) => chaves.every((k) => String(l[k.toLowerCase()] ?? '') === String(item.dados[k] ?? '')));
}

module.exports = { confere };
