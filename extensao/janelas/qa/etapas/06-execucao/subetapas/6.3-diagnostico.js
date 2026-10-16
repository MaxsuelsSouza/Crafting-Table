// @ts-check
// 6.3 · Diagnóstico: só quando a jornada falhou. Primeiro por regra (regras/diagnostico.js, sem IA); senão a IA, na conversa do Gerar, diz o lado da falha (RV-7):
// código → concluído como falhou · massa → sem-massa (volta à Etapa 5) · roteiro → { refazer: motivo } (6.1 de novo).
const { claude } = require('../../../orquestrador/claude');
const { bloquearFluxo } = require('../../../orquestrador/zero-skip');
const { pedidoDeRoteiro } = require('../roteiros');
const { promptDiagnostico } = require('../prompt');
const { depoisDoClaude } = require('../depois-do-claude');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { estado, mudar } = require('../../../estado');
const { lerSid } = require('../../../orquestrador/sid');
const { concluirCenario } = require('../cenario');
const { classificar } = require('../regras/diagnostico');

async function diagnosticar(dir, d, amb, c, itens, pasta, detalhes) {
  pedidoDeRoteiro(dir, c.id); // descarta pedido velho: só vale o deste diagnóstico
  const regra = classificar(detalhes);
  if (regra) aoVivo.anotar(dir, { tipo: 'acao', texto: `${c.id}: diagnóstico por regra (sem IA): ${regra.lado}` });
  if (regra?.lado === 'codigo') {
    concluirCenario(dir, c.id, 'falhou', `${regra.nota} (diagnóstico por regra)`);
    return { fim: 'concluido' };
  }
  if (regra?.lado === 'roteiro') return { refazer: regra.nota };
  if (regra?.lado === 'ambiente') {
    bloquearFluxo(dir, d, c, regra.nota);
    return { fim: 'parou' };
  }
  const sid = estado(dir).gerarSid; // a conversa do 6.0 Gerar já conhece o card, o código e o roteiro
  const r = await claude(
    dir,
    {
      prompt: promptDiagnostico(d.chave, c, amb, itens, dir, pasta, detalhes),
      titulo: `QA · ${c.id} · diagnóstico`,
      cwd: amb.backend || d.backend,
      banco: true,
      ...(sid ? { sessao: sid } : {})
    },
    d
  );
  if (sid) mudar(dir, { gerarSid: lerSid(dir) || sid });
  const fim = depoisDoClaude(dir, d, c, r, itens);
  if (fim !== 'segue') return { fim };
  const refazer = pedidoDeRoteiro(dir, c.id);
  if (refazer) return { refazer };
  bloquearFluxo(dir, d, c, `a jornada falhou e o diagnóstico terminou sem decidir: ${detalhes.at(-1) || ''}`);
  return { fim: 'parou' };
}

module.exports = { diagnosticar };
