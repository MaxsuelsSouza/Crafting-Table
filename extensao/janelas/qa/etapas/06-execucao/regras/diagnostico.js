// @ts-check
// 6.3 por regra, antes de chamar a IA: o que a jornada registrou já diz de que lado está a falha?
//   ambiente  o app não chegou à tela de início, ou a API não respondeu → pausa no cenário (zero skip), você decide
//   roteiro   consulta mal escrita (coluna/tabela que não existe, sintaxe) → a IA corrige o roteiro
//   codigo    o app/a API rodou até o fim e só o efeito esperado falhou (comparação ✗, http ✗) → falhou, sem IA
//   null      um flow parou no meio (seletor? defeito?) → só a IA lendo prints e código decide
const ROTEIRO_SQL = /erro no banco \((?:ORA-00904|ORA-00942|ORA-00933|ORA-00936|ORA-01722|ORA-00918|ORA-01747)/;

/** @param {string[]} detalhes @returns {{ lado: 'ambiente'|'roteiro'|'codigo', nota: string } | null} */
function classificar(detalhes) {
  const ult = detalhes.at(-1) || '';
  if (/^00 início do teste: o app não chegou/.test(ult) || /: a API não respondeu/.test(ult))
    return { lado: 'ambiente', nota: ult };
  if (ROTEIRO_SQL.test(ult)) return { lado: 'roteiro', nota: `a consulta do roteiro está errada: ${ult}` };
  const falhas = detalhes.filter((x) => / ✗$/.test(x));
  if (falhas.length && !detalhes.some((x) => /: falhou \(rc \d+\)|broadcast não entregue|erro no banco/.test(x)))
    return {
      lado: 'codigo',
      nota: `o roteiro rodou até o fim e o resultado esperado não aconteceu: ${falhas.map((f) => f.replace(/ ✗$/, '')).join('; ')}`
    };
  return null;
}

module.exports = { classificar };
