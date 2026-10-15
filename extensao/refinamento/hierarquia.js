// @ts-check
const variaveis = require('../provedores/variaveis');

// Hierarquia dos tipos de ticket (Épico > Feature > História > Subtarefa…). O que cada tipo gera ao ser refinado mora nas variáveis
// tiposQuebrar (do mais alto ao mais baixo), tiposDesenvolver e tiposExecutar; o código nunca assume nome de tipo. Tipo que não está em
// nenhuma das três é desconhecido: o refinamento pergunta o que ele é e grava aqui (registrar).
//   papelDe(tipo) → { papel: 'quebrar' | 'desenvolver' | 'executar', filho?: string } | null
const CHAVES = { quebrar: 'tiposQuebrar', desenvolver: 'tiposDesenvolver', executar: 'tiposExecutar' };
const norm = (x) => String(x ?? '').trim().toLowerCase();
const nomes = (item) => String(item).split('|').map((p) => p.trim()).filter(Boolean);
const casa = (item, tipo) => nomes(item).some((p) => norm(p) === norm(tipo));
const lerLista = (papel) => [].concat(variaveis.ler(CHAVES[papel]) || []).map((x) => String(x).trim()).filter(Boolean);
/** @returns {{ quebrar: string[], desenvolver: string[], executar: string[] }} */
const atuais = () => ({ quebrar: lerLista('quebrar'), desenvolver: lerLista('desenvolver'), executar: lerLista('executar') });

/** Papel do tipo e, para "quebrar", o tipo que o refinamento gera (o próximo da lista, ou o primeiro de desenvolvimento). */
function papelDe(tipo, listas = atuais()) {
  if (!norm(tipo)) return null;
  const i = listas.quebrar.findIndex((x) => casa(x, tipo));
  if (i >= 0) {
    const proximo = listas.quebrar[i + 1] || listas.desenvolver[0];
    return { papel: 'quebrar', ...(proximo ? { filho: nomes(proximo)[0] } : {}) };
  }
  if (listas.desenvolver.some((x) => casa(x, tipo))) return { papel: 'desenvolver' };
  if (listas.executar.some((x) => casa(x, tipo))) return { papel: 'executar' };
  return null;
}

/** Tipos já conhecidos (para sugerir o que um tipo novo gera). */
const conhecidos = (listas = atuais()) => [...new Set([...listas.quebrar, ...listas.desenvolver].map((x) => nomes(x)[0]))];

/**
 * Listas depois de classificar `tipo` como `papel`. Tipo que gera `filho`: entra logo acima dele em tiposQuebrar (ou no fim, se o
 * filho não está lá). Um tipo só mora numa lista: sai das outras antes.
 */
function classificar(tipo, papel, filho, listas = atuais()) {
  const sem = (l) => l.filter((x) => !casa(x, tipo));
  const r = { quebrar: sem(listas.quebrar), desenvolver: sem(listas.desenvolver), executar: sem(listas.executar) };
  if (papel === 'quebrar') {
    const i = filho ? r.quebrar.findIndex((x) => casa(x, filho)) : -1;
    r.quebrar.splice(i >= 0 ? i : r.quebrar.length, 0, tipo);
  } else r[papel].push(tipo);
  return r;
}

/** Grava a classificação nas variáveis (origem manual: foi a pessoa que respondeu). */
async function registrar(tipo, papel, filho) {
  if (!CHAVES[papel]) throw new Error(`Papel desconhecido: ${papel}`);
  const antes = atuais(), depois = classificar(tipo, papel, filho, antes);
  for (const p of Object.keys(CHAVES)) if (JSON.stringify(antes[p]) !== JSON.stringify(depois[p])) await variaveis.gravar(CHAVES[p], depois[p], 'manual');
}

module.exports = { papelDe, classificar, registrar, conhecidos, atuais, CHAVES };
