// @ts-check
// A implementação alterou algum repositório? Alteração no working tree ou commit à frente da branch principal (sem isso, apos-etapa.js pausa).
const { deps } = require('../../../dependencias');

const houveMudanca = (repos, branches) =>
  Object.keys(branches).some((c) => {
    const r = repos.find((x) => x.caminho === c);
    try {
      return (
        !!deps.git(c, ['status', '--porcelain']) ||
        !!deps.git(c, ['rev-list', '--count', `${r?.branchPrincipal || 'HEAD'}..HEAD`]).replace(/^0$/, '')
      );
    } catch {
      return false;
    }
  });

module.exports = { houveMudanca };
