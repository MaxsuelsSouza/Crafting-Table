// @ts-check
// qa-state receita: depois de validar o formato, roda as buscas uma vez e devolve à IA quantos registros cada uma acha e as colunas
// (que viram ${COLUNA} nos roteiros). Guarda uma amostra por cenário (estado.receitaAmostra) para validar os roteiros do Gerar.
const { estado, mudar } = require('../../../estado');
const { maiusculas } = require('./buscar');

/** @returns {Promise<{ texto: string, vazias: string[] }>} */
async function testarReceita(dir, r, consultar) {
  if (!r.papeis.length) return { texto: 'receita sem papéis: nenhum cenário precisa de massa', vazias: [] };
  const res = await consultar(r.papeis.map((p) => p.busca));
  if (res.erro) return { texto: `receita gravada, mas o banco não respondeu: ${res.erro}`, vazias: [] };
  const amostra = { ...(estado(dir).receitaAmostra || {}) },
    linhas = [],
    vazias = [];
  r.papeis.forEach((p, i) => {
    const x = res.resultados[i];
    if (!x?.ok) {
      vazias.push(p.papel);
      return linhas.push(`- ${p.papel}: ERRO ${x?.erro || 'sem resposta'}`);
    }
    const itens = x.itens.map(maiusculas),
      precisa = p.por_cenario === false ? 1 : p.cenarios.length;
    if (itens.length < precisa && !p.produzir) vazias.push(p.papel);
    p.cenarios.forEach((c, k) => {
      const l = itens[p.por_cenario === false ? 0 : k] || itens[0];
      if (l)
        amostra[c] = {
          ...(amostra[c] || {}),
          ...Object.fromEntries(Object.entries(l).map(([a, v]) => [a, String(v)]))
        };
    });
    linhas.push(
      `- ${p.papel}: ${itens.length}${x.cortado ? '+' : ''} registro(s) (precisa ${precisa}${itens.length < precisa ? (p.produzir ? '; o resto sai do produzir' : '; FALTA') : ''}) · colunas: ${Object.keys(itens[0] || {}).join(', ') || (x.colunas || []).map((c) => c.toUpperCase()).join(', ')}`
    );
  });
  mudar(dir, { receitaAmostra: amostra });
  return { texto: `receita gravada. Buscas:\n${linhas.join('\n')}`, vazias };
}

module.exports = { testarReceita };
