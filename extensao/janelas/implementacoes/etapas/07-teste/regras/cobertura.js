// @ts-check
// Critérios de aceite × CTs do plano (PURO): a tabela "## Critérios de aceite cobertos" que o METODO_ENTREGA (infra/testes) exige,
// com as colunas Critério | Cenários | Fonte | Confiança. Usado pela 7.1 (sem tabela → pausa) e pela 7.4 (cobertura no score).
const idCt = (n) => `CT${String(Number(n)).padStart(2, '0')}`;
const celulas = (l) =>
  l
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

/** Linhas da tabela CA × CT: [{ ca, cts: ['CT01'], confianca }]; null = o plano não tem a seção. */
function casDo(md) {
  const linhas = String(md || '').split('\n'),
    i = linhas.findIndex((l) => /^#{1,6}\s*crit[eé]rios de aceite/i.test(l));
  if (i < 0) return null;
  const tabela = [];
  for (const l of linhas.slice(i + 1)) {
    if (/^#{1,6}\s/.test(l)) break;
    if (l.trim().startsWith('|')) tabela.push(celulas(l));
  }
  if (!tabela.length) return null;
  const [cab, ...resto] = tabela,
    col = (re) => cab.findIndex((c) => re.test(c));
  const iCen = col(/cen[aá]rio|ct/i),
    iConf = col(/confian/i);
  return resto
    .filter((c) => !c.every((x) => /^:?-+:?$/.test(x)))
    .map((c) => ({
      ca: c[0] || '',
      cts: [...new Set([...(iCen >= 0 ? c[iCen] : c.join(' ')).matchAll(/\bCT-?\s*(\d+)/gi)].map((m) => idCt(m[1])))],
      confianca: (iConf >= 0 ? c[iConf] : '').toLowerCase()
    }));
}

/** cts: [{ id, nivel }] (nivel de infra/testes/nivel.js). Coberto = algum CT do critério rodou (passou, com aviso ou falhou). */
function cobertura(cas, cts) {
  const rodou = new Set(cts.filter((c) => ['passou', 'passou-com-aviso', 'falhou'].includes(c.nivel)).map((c) => c.id));
  const lista = cas || [];
  return {
    total: lista.length,
    cobertos: lista.filter((x) => x.cts.some((id) => rodou.has(id))).length,
    inferidoSemCt: lista.some((x) => /inferid/.test(x.confianca) && !x.cts.length)
  };
}

module.exports = { casDo, cobertura };
