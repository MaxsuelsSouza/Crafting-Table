// @ts-check
// Achados do teste na aplicação (teste.json da etapa 7) para a correção da etapa 5 (correcao: 'teste'): cada CT que falhou, ficou
// bloqueado ou mostrou erro novo de console/rede, com a nota, os sinais e o caminho da evidência. Usado por orquestrador/rodar-etapa.js.
const path = require('path');
const { lerJson } = require('../../../estado');

const PROBLEMA = ['falhou', 'bloqueado'];
const comSinal = (c) => (c.sinais?.console || 0) + (c.sinais?.rede || 0) > 0;

/** @returns {string} um achado por linha (vazio = nada a corrigir) */
function falhasTeste(dir) {
  const r = lerJson(path.join(dir, 'teste.json'), {}),
    cts = (r.cts || []).filter((c) => PROBLEMA.includes(c.nivel) || comSinal(c));
  return [
    `Score ${r.score ?? '?'}/5, mínimo ${r.minimo ?? '?'}${r.motivos?.length ? ` (${r.motivos.join('; ')})` : ''}.`,
    ...cts.map(
      (c) =>
        `- ${c.id} [${c.nivel}, ${c.criticidade}, ${c.tipo}] ${c.titulo}: ${c.nota || '(sem nota)'}` +
        (comSinal(c)
          ? ` · sinais: console ${c.sinais.console}, rede ${c.sinais.rede}${c.sinais.resumo ? ` (${c.sinais.resumo})` : ''}`
          : '') +
        ` · ação: ${c.nivel === 'falhou' ? 'corrigir o comportamento' : comSinal(c) ? 'eliminar o erro novo' : 'conferir se o bloqueio vem do código'}` +
        (c.evidencias?.length ? ` · evidência: ${c.evidencias.map((e) => path.join(dir, e)).join(', ')}` : '')
    )
  ].join('\n');
}

module.exports = { falhasTeste };
