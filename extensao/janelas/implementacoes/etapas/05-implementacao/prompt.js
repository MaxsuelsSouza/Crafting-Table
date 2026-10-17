// @ts-check
// Prompt da etapa 5 · Implementação: segue o plano na branch de trabalho; na correção, lê as falhas da verificação (6) ou os achados do teste (7).
const { ARQ } = require('..');

const tarefa = (c) =>
  `ETAPA 5 · IMPLEMENTAÇÃO. Leia ${c.dir}/${ARQ[4]} (siga a ordem), ${c.dir}/${ARQ[3]} (o que não pode quebrar) e ${c.dir}/${ARQ[2]} (critério de pronto). ` +
  `Branch de trabalho já criada em cada repositório: ${
    Object.entries(c.branches || {})
      .map(([r, b]) => `${r} → ${b}`)
      .join(' · ') || '(nenhuma)'
  }. ` +
  `Implemente SÓ o que está no plano, seguindo o estilo do código existente; não refatore fora do escopo, não adicione o que não foi pedido. ` +
  (c.correcao === 'teste'
    ? `ESTA É UMA CORREÇÃO: o teste na aplicação (etapa 7) ficou abaixo do mínimo. Achados (CT, nota, sinais, evidência):\n${c.falhas}\nLeia ${c.dir}/teste.json e ${c.dir}/teste/plano-cts.md, corrija a causa no código e não mexa no plano de CTs. `
    : c.correcao
      ? `ESTA É UMA CORREÇÃO: a verificação automática falhou. Leia ${c.dir}/${ARQ[6]}${c.falhas ? ` e as falhas:\n${c.falhas}\n` : ''} Corrija a causa, sem enfraquecer nem apagar testes. `
      : '') +
  `Ao terminar grave em ${c.dir}/${ARQ[5]}: por arquivo o que mudou e por quê, desvios do plano (com o motivo) e pendências. ` +
  `Se descobrir ambiguidade que muda o comportamento, PAUSE sem gravar o log.`;

module.exports = { tarefa };
