// @ts-check
// Validação dos flows de início no emulador: roda o inicio (login até a tela de início) e logo depois o voltar-inicio.
// Os dois passando, viram conhecimento (tipo flow) e todo teste começa por eles.
const fs = require('fs');
const path = require('path');

/**
 * @param {{ inicio: string, voltar: string }} arqs
 * @param {{ maestro: Function, envBase: Record<string,string> }} deps jornada(d) de ../dependencias.js
 * @param {string} saida pasta das saídas do Maestro
 * @returns {Promise<{ ok: boolean, erro?: string }>}
 */
async function validarInicio(arqs, deps, saida) {
  fs.mkdirSync(saida, { recursive: true });
  for (const [nome, arq] of [
    ['inicio', arqs.inicio],
    ['voltar-inicio', arqs.voltar]
  ]) {
    if (!arq || !fs.existsSync(arq)) return { ok: false, erro: `${nome}: arquivo não encontrado (${arq || 'vazio'})` };
    const x = await deps.maestro(arq, deps.envBase, {
      junit: path.join(saida, `${nome}-junit.xml`),
      cwd: path.dirname(arq),
      saidaTeste: path.join(saida, nome)
    });
    fs.writeFileSync(path.join(saida, `${nome}-saida.txt`), x.saida || '');
    if (x.rc !== 0)
      return {
        ok: false,
        erro: `${nome} falhou (rc ${x.rc}):\n${String(x.saida || '')
          .trim()
          .slice(-1200)}`
      };
  }
  return { ok: true };
}

module.exports = { validarInicio };
