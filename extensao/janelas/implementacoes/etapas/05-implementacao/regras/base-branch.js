// @ts-check
// De onde a branch do ticket (<tipo>/<CHAVE>) parte num repositório. Uma branch por ticket (CLAUDE.md, "Branch de trabalho"):
//   1. <tipo>/<CHAVE> já existe: local → 'local'; só no origin → 'remota' (cria a local rastreando a remota)
//   2. senão, trabalho já feito com a chave do ticket ou das subtarefas (dossiê, trabalho-existente.md): uma branch com commits à frente da
//      principal → 'trabalho' (<tipo>/<CHAVE> parte dela; a original fica intacta); mais de uma → 'escolher' (a esteira pausa e pergunta)
//   3. nada encontrado → 'principal' (origin/<principal>, como antes)
// A escolha do usuário (pausa 'base') fica em estado.bases[<caminho do repositório>]: nome da branch ou PRINCIPAL.
const { deps } = require('../../../dependencias');

const PRINCIPAL = 'Partir da branch principal';
const existe = (cwd, ref) => {
  try {
    deps.git(cwd, ['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
};
const refDe = (b) => (b.local ? b.nome : `origin/${b.nome}`);

/**
 * @param {{ caminho: string }} r repositório
 * @param {string} nome <tipo>/<CHAVE>
 * @param {any} d dossiê gravado (d.trabalho: branches com a chave, por repositório)
 * @param {Record<string, string>} [bases] escolhas do usuário (estado.bases)
 * @returns {{ tipo: 'local'|'remota'|'trabalho'|'principal'|'escolher', ref?: string, candidatas?: string[] }}
 */
function baseDaBranch(r, nome, d, bases = {}) {
  if (existe(r.caminho, `refs/heads/${nome}`)) return { tipo: 'local' };
  if (existe(r.caminho, `refs/remotes/origin/${nome}`)) return { tipo: 'remota', ref: `origin/${nome}` };
  const escolha = bases[r.caminho];
  if (escolha === PRINCIPAL) return { tipo: 'principal' };
  const branches = (d?.trabalho || []).find((x) => x.caminho === r.caminho)?.branches || [];
  const com = branches.filter((b) => b.nome !== nome && (b.adiante || b.commits?.length));
  const achada = escolha ? com.find((b) => b.nome === escolha) : com.length === 1 ? com[0] : null;
  if (achada) return { tipo: 'trabalho', ref: refDe(achada) };
  if (com.length > 1) return { tipo: 'escolher', candidatas: com.map((b) => b.nome) };
  return { tipo: 'principal' };
}

module.exports = { PRINCIPAL, baseDaBranch };
