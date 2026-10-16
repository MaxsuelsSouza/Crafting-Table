// @ts-check
// 6.3 · Diagnóstico: só quando a jornada falhou. Um claude -p curto diz o lado da falha (RV-7):
// código → concluído como falhou · massa → sem-massa (volta à Etapa 5) · roteiro → { refazer: motivo } (6.1 de novo).
const { claude } = require('../../../orquestrador/claude');
const { bloquearFluxo } = require('../../../orquestrador/zero-skip');
const { pedidoDeRoteiro } = require('../roteiros');
const { promptDiagnostico } = require('../prompt');
const { depoisDoClaude } = require('../depois-do-claude');

async function diagnosticar(dir, d, amb, c, itens, pasta, detalhes) {
  pedidoDeRoteiro(dir, c.id); // descarta pedido velho: só vale o deste diagnóstico
  const r = await claude(
    dir,
    {
      prompt: promptDiagnostico(d.chave, c, amb, itens, dir, pasta, detalhes),
      titulo: `QA · ${c.id} · diagnóstico`,
      cwd: amb.backend || d.backend
    },
    d
  );
  const fim = depoisDoClaude(dir, d, c, r, itens);
  if (fim !== 'segue') return { fim };
  const refazer = pedidoDeRoteiro(dir, c.id);
  if (refazer) return { refazer };
  bloquearFluxo(dir, d, c, `a jornada falhou e o diagnóstico terminou sem decidir: ${detalhes.at(-1) || ''}`);
  return { fim: 'parou' };
}

module.exports = { diagnosticar };
