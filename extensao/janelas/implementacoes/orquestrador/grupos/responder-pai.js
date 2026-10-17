// @ts-check
// Respostas às pausas que só o pai tem (depois dos grupos): integração do worktree e verificação final.
const fs = require('fs');
const path = require('path');
const { ARQ } = require('../../etapas');
const { TENTAR, CORRIGIR, RESUMIR, estado, mudar } = require('../../estado');
const { lerPlano } = require('../../etapas/00-subtarefas/arquivos');
const { INTEGREI } = require('./integrar');
const { contexto } = require('./contexto');

const MOTIVOS = ['integrar', 'verificacao-final'];

async function responderPai(s, t, r) {
  const { seguir } = require('../seguir'); // ciclo: seguir → grupos
  const dir = s.pastaAba(t.id),
    m = estado(dir).pausa?.motivo;
  if (m === 'integrar') {
    if (r === TENTAR) mudar(dir, { pausa: null, fase: 'grupos' });
    else if (r === INTEGREI) mudar(dir, { pausa: null, fase: 'grupos', integrarManual: true });
    else return;
    return seguir(s, t);
  }
  if (m === 'verificacao-final') {
    if (r === RESUMIR) {
      mudar(dir, { pausa: null, fase: 'grupos', verificadoFinal: 'aceito' });
      return seguir(s, t);
    }
    if (r !== CORRIGIR) return;
    // O G1 roda na checkout (com tudo junto): a correção dele lê as falhas da verificação final.
    const g1 = lerPlano(dir)?.grupos[0],
      c = g1 && contexto(s, t, g1.id);
    if (!c) return;
    fs.copyFileSync(path.join(dir, ARQ[6]), path.join(c.dir, ARQ[6]));
    mudar(c.dir, { etapa: 5, fase: 'parado', pausa: null, tentativas: 1, correcao: true });
    mudar(dir, { pausa: null, fase: 'grupos', verificadoFinal: undefined });
    return seguir(c.s, c.t);
  }
}

module.exports = { MOTIVOS, responderPai };
