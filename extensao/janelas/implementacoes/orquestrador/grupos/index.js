// @ts-check
// Grupos de subtarefas (depois do portão da etapa 0): cada grupo é a esteira de hoje (1 → 7) na pasta grupos/<id>/, na mesma branch
// <tipo>/<CHAVE>; o segundo grupo em paralelo roda num worktree destacado. Um arquivo por regra:
//   contexto.js           s/t do grupo (pasta, repositórios ou worktree, espelho do Ao vivo)
//   fila.js               quem começa (dependência cumprida, no máximo 2 ao mesmo tempo); todos concluídos → concluir
//   seguir-pai.js         ▶ e ⏸ do pai: etapa 0, disparo, fila e retomada dos grupos
//   integrar.js           aplica o worktree na checkout e remove
//   verificacao-final.js  build e teste com os grupos juntos (só depois do worktree)
//   concluir.js           integra, verifica e junta os resumos no implementacao.md do pai
//   responder-pai.js      respostas às pausas do pai (integração, verificação final)
const { contexto, reposDoGrupo } = require('./contexto');
const { avancarFila, situacoes } = require('./fila');
const { seguirPai, retomarGrupos, pausarGrupos } = require('./seguir-pai');
const { concluir } = require('./concluir');
const { MOTIVOS, responderPai } = require('./responder-pai');

// Fim da esteira de um grupo (avancar.js, etapa 7): a fila decide o próximo ou conclui o pai.
const grupoConcluido = (s, t) => avancarFila(s, t);

module.exports = {
  contexto,
  reposDoGrupo,
  avancarFila,
  situacoes,
  seguirPai,
  retomarGrupos,
  pausarGrupos,
  concluir,
  grupoConcluido,
  MOTIVOS_PAI: MOTIVOS,
  responderPai
};
