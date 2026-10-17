// @ts-check
// De onde a branch do ticket parte quando ela ainda não existe (CLAUDE.md, "Branches"). A esteira nunca cria sem perguntar (pausa 'criar'):
// esta regra só monta a base sugerida e as outras opções, nesta ordem:
//   1. trabalho já feito com a chave do ticket ou das subtarefas (dossiê, trabalho-existente.md): branch com commits à frente da principal
//   2. a branch do pai (<prefixo>/<PAI>) e 3. a do avô (<prefixo>/<AVÔ>), local ou no origin
//   4. a principal (origin/<principal>)
// A sugerida é a primeira que existir; as outras viram opções da pausa.
const git = require('../../../../../infra/git');

/** Chaves do ticket para procurar branch: as dele e das subtarefas (dossiê), o pai e o avô (ticket da ferramenta, s.cacheJira). */
const chavesDo = (t, d, j) => ({
  proprias: [...new Set([t.chave, ...(d?.fontes?.trabalho?.chaves || [])].filter(Boolean))],
  pai: j?.pai || null,
  avo: j?.avo || null
});
const refDe = (b) => (b.local ? b.nome : `origin/${b.nome}`);

/**
 * @param {{ caminho: string, branchPrincipal?: string }} r repositório
 * @param {string} nome a branch que vai ser criada (fica fora das bases)
 * @param {any} d dossiê gravado (d.trabalho: branches com a chave, por repositório)
 * @param {{ pai?: string | null, avo?: string | null }} c chaves do pai e do avô
 * @returns {{ sugerida: string, principal: string, outras: string[] }}
 */
function basesDe(r, nome, d, c = {}) {
  const principal = git.refPrincipal(r.caminho, r.branchPrincipal) || String(r.branchPrincipal || '');
  const trabalho = ((d?.trabalho || []).find((x) => x.caminho === r.caminho)?.branches || [])
    .filter((b) => b.nome !== nome && (b.adiante || b.commits?.length))
    .map(refDe);
  const familia = [c.pai, c.avo]
    .filter(Boolean)
    .map((k) => git.propria(r, String(k)))
    .filter(Boolean)
    .map(refDe);
  const todas = [...new Set([...trabalho, ...familia])];
  return { sugerida: todas[0] || principal, principal, outras: todas.slice(1) };
}

module.exports = { chavesDo, basesDe };
