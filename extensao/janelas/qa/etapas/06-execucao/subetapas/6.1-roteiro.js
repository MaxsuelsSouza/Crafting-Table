// @ts-check
// 6.1 · Roteiro: reaproveita o do disco (o cenário e a instrução do humano não mudaram) ou pede ao Claude que escreva e registre.
// Devolve { roteiro } ou { fim: 'parou' | 'sem-massa' | 'concluido' } (o Claude pode concluir sozinho o cenário que não cabe num roteiro).
const aoVivo = require('../../../../../componentes/ao-vivo');
const { claude } = require('../../../orquestrador/claude');
const { bloquearFluxo } = require('../../../orquestrador/zero-skip');
const { cenarios } = require('../../02-cenarios/mapa');
const { exigenciasDe } = require('../regras/evidencia');
const { roteiroDe } = require('../roteiros');
const { promptCenario } = require('../prompt');
const { depoisDoClaude } = require('../depois-do-claude');

// extra: o que deu errado no roteiro anterior (6.2 recusou ou o 6.3 pediu outro); com ele nunca reaproveita.
async function obterRoteiro(dir, d, amb, c, itens, extra = '') {
  const atual = () => cenarios(dir).cenarios.find((x) => x.id === c.id) || c;
  const salvo = !extra && roteiroDe(dir, atual());
  if (salvo) {
    aoVivo.anotar(dir, { tipo: 'acao', texto: `${c.id}: roteiro reaproveitado (o cenário não mudou)` });
    return { roteiro: salvo };
  }
  const cc = extra ? { ...atual(), instrucao: [atual().instrucao, extra].filter(Boolean).join('\n') } : atual();
  const r = await claude(
    dir,
    {
      prompt: promptCenario(d.chave, cc, amb, itens, dir, exigenciasDe(dir, c)),
      titulo: `QA · ${c.id} · ${extra ? 'novo roteiro' : c.titulo}`,
      cwd: amb.backend || d.backend
    },
    d
  );
  const fim = depoisDoClaude(dir, d, c, r, itens);
  if (fim !== 'segue') return { fim };
  const roteiro = roteiroDe(dir, atual());
  if (roteiro) return { roteiro };
  bloquearFluxo(dir, d, c, 'o Claude terminou sem registrar o roteiro nem o resultado');
  return { fim: 'parou' };
}

module.exports = { obterRoteiro };
