// @ts-check
// ORQUESTRADOR do refinamento: o Maestro dirigido pela extensão. Monta cada execução do Claude em segundo plano (etapa),
// decide a próxima (seguir, filas de triagem/impacto/tarefas) e vigia comentários novos na ferramenta de tickets. O painel só chama a interface
// exportada; o estado mutável (alterando, respondidas, vigiando) mora aqui. `s` = servicos do painel (iniciar() recebe).
//
// Um arquivo por regra:
//   servicos.js         estado mutável comum: s (serviços do painel), alterando, respondidas
//   ferramentas.js      allowlist do claude -p (sdd-state, plugin mapa, refinamento-gravar em ../bin)
//   ambiente.js         env do mapa-db
//   blocos-prompt.js    escrita, ticket por documento, explicação do dev, tipo do ticket
//   memoria.js          memória do passo, prompts de ajuste e de respostas
//   etapa.js            uma execução do Claude (maestro.rodar)
//   depois-da-etapa.js  fim da execução: card não confirmado, spec que não nasceu, impactos, refinamento.md e as filas
//   fila-tarefas.js     pedidos de alteração de cards
//   seguir.js           próxima etapa (passo genérico; 3 e 6 em ../etapas)
//   controle.js         ⏸ de verdade e a situação (parado/rodando)
//   verificacao.js      o que cada passo precisa ter para valer
//   conferir.js         correção limitada e pausa ao esgotar
//   ajustar.js          ajuste e respostas do humano (execução nova)
//   sdd.js              chama o sdd-state
//   iniciar.js          recebe os serviços e liga o vigia de comentários
// Comentários do ticket (vigia, triagem, impacto, avisos): ../etapas/comentarios/. Passo 3: ../etapas/03-plano-tecnico/.
const { reposDe } = require('../../infra/repos'); // comum a todos os módulos (exportado aqui também, como sempre)
const { papelDoTicket, mudarEstado, estadoDe } = require('../estado');
const { respondidas } = require('./servicos');
const { FERRAMENTAS } = require('./ferramentas');
const { blocoTipo } = require('./blocos-prompt');
const { memoriaPasso, promptAjuste, promptRespostas } = require('./memoria');
const { etapa } = require('./etapa');
const { depoisDaEtapa } = require('./depois-da-etapa');
const { filaTarefas } = require('./fila-tarefas');
const { seguir } = require('./seguir');
const { interromper, situacao } = require('./controle');
const { MAX_CORRECOES, problemaDoPasso } = require('./verificacao');
const { conferir } = require('./conferir');
const { ajustar, aplicarRespostas } = require('./ajustar');
const { sdd } = require('./sdd');
const { iniciar } = require('./iniciar');
const { subetapas3, mapasDe } = require('../etapas/03-plano-tecnico');
const { vigiarComentarios } = require('../etapas/comentarios/vigia');
const { avisarImpactos } = require('../etapas/comentarios/avisar');

module.exports = {
  iniciar,
  etapa,
  papelDoTicket,
  blocoTipo,
  seguir,
  retomarFilas: (t) => depoisDaEtapa(t),
  interromper,
  situacao,
  mudarEstado,
  conferir,
  problemaDoPasso,
  FERRAMENTAS,
  MAX_CORRECOES,
  subetapas3,
  mapasDe,
  memoriaPasso,
  promptAjuste,
  promptRespostas,
  ajustar,
  aplicarRespostas,
  filaTarefas,
  vigiarComentarios,
  respondidas,
  sdd,
  estadoDe,
  reposDe,
  avisarImpactos
};
