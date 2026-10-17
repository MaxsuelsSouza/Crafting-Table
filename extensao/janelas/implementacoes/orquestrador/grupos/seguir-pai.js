// @ts-check
// ▶ do ticket com subtarefas (seguir.js manda para cá quando estado.subtarefas === 'sim'):
//   antes do portão: a etapa 0 de onde parou (interrompida depois de gravar o plano → valida; senão roda de novo)
//   depois do portão: o disparo (idempotente: branch, worktree) e a fila; grupo interrompido, com erro ou pausado por você retoma.
const maestro = require('../../../../infra/agentes/maestro');
const controle = require('../../../../infra/controle');
const { estado, mudar, situacao, existe } = require('../../estado');
const { lerPlano } = require('../../etapas/00-subtarefas/arquivos');
const { contexto } = require('./contexto');

async function seguirPai(s, t) {
  const sub = require('../../etapas/00-subtarefas'); // ciclo: etapa 0 → orquestrador
  const dir = s.pastaAba(t.id),
    e = estado(dir);
  if (maestro.rodando(dir) || e.fase === 'aguardando' || e.fase === 'concluido') return;
  const rodada = controle.nova(dir);
  if (!e.planoAprovado) {
    if (e.etapa === 0 && e.fase === 'rodando' && !situacao(dir).rodando && existe(dir, 0))
      return sub.aposPlano(s, t, rodada);
    return sub.passoSubtarefas(s, t, rodada);
  }
  await sub.disparar(s, t, rodada);
  retomarGrupos(s, t);
}

// Grupos já começados que pararam sem terminar (janela fechada, erro ou ⏸): seguem de onde pararam.
function retomarGrupos(s, t) {
  const dir = s.pastaAba(t.id),
    plano = lerPlano(dir);
  if (!plano || estado(dir).fase !== 'grupos') return;
  const { seguir } = require('../seguir'); // ciclo: seguir → grupos
  for (const g of plano.grupos) {
    const c = contexto(s, t, g.id),
      sit = c && situacao(c.dir);
    if (!c || !sit.e.iniciado || sit.rodando) continue;
    const manual = sit.fase === 'pausado' && sit.e.pausa?.motivo === 'manual';
    if (manual || ['parado', 'erro'].includes(sit.fase)) {
      if (manual) mudar(c.dir, { pausa: null });
      seguir(c.s, c.t).catch(() => {});
    }
  }
}

// ⏸ do pai: para cada grupo em andamento (o Claude, a verificação) com a pausa "manual"; o ▶ do pai retoma todos.
function pausarGrupos(s, t) {
  const { pausarManual } = require('../pausar'); // ciclo: pausar → grupos
  const plano = lerPlano(s.pastaAba(t.id));
  for (const g of plano?.grupos || []) {
    const c = contexto(s, t, g.id),
      sit = c && situacao(c.dir);
    if (c && sit.e.iniciado && (sit.rodando || sit.e.fase === 'rodando')) pausarManual(c.s, c.t);
  }
}

module.exports = { seguirPai, retomarGrupos, pausarGrupos };
