// @ts-check
// Botão "Validar massa" (aba Massa) e a conferência antes de cada cenário (Etapa 6): roda de novo a consulta de cada item, numa sessão só.
// true → o item fica válido (medida agora) · false → inválido · null → não dá para conferir (sem consulta, banco não liberado ou erro): o estado não muda.
const { liberado } = require('../../../../infra/agentes/banco');
const { massa, massaEstado } = require('./estado');
const { confere } = require('./regras/conferir');

/** @returns {Promise<Record<string, boolean|null>>} */
async function validarMassa(dir, d, ids) {
  const itens = massa(dir).itens.filter((i) => ids.includes(i.id)),
    r = Object.fromEntries(itens.map((i) => [i.id, null]));
  const comConsulta = itens.filter((i) => i.consulta);
  if (!comConsulta.length || !d.banco || !liberado(d.banco)) return r;
  const res = await (d.consultarBanco || require('./dependencias').consultar)(
    d.banco,
    comConsulta.map((i) => i.consulta)
  );
  if (res.erro) return r;
  comConsulta.forEach((i, k) => {
    const x = res.resultados[k];
    if (!x?.ok) return;
    r[i.id] = confere(i, x);
    massaEstado(dir, i.id, r[i.id] ? 'valida' : 'invalida');
  });
  return r;
}

module.exports = { validarMassa };
