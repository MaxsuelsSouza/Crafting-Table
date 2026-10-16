// @ts-check
// 6.1 · Roteiro: reaproveita o do disco (o cenário e a instrução do humano não mudaram) ou pede ao Claude que escreva e registre.
// Em lote (d.loteRoteiro > 1, craftingTable.qaLoteRoteiro): a mesma sessão registra também os roteiros dos próximos pendentes sem roteiro.
// Devolve { roteiro } ou { fim: 'parou' | 'sem-massa' | 'concluido' } (o Claude pode concluir sozinho o cenário que não cabe num roteiro).
const aoVivo = require('../../../../../componentes/ao-vivo');
const { claude } = require('../../../orquestrador/claude');
const { bloquearFluxo } = require('../../../orquestrador/zero-skip');
const { cenarios } = require('../../02-cenarios/mapa');
const { massa } = require('../../05-massa/estado');
const { massaValida } = require('../../05-massa/regras/validade');
const { fila } = require('../cenario');
const { promptLote } = require('../prompt-lote');
const { exigenciasDe } = require('../regras/evidencia');
const { roteiroDe } = require('../roteiros');
const { estado, mudar } = require('../../../estado');
const { promptCenario, promptContinuar } = require('../prompt');
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
  // O Claude perguntou neste cenário e o humano respondeu: continua a mesma sessão em vez de abrir outra do zero.
  const volta = estado(dir).retomarSessao;
  const continuar = !extra && volta?.cenario === c.id && volta.resposta ? volta : null;
  if (volta) mudar(dir, { retomarSessao: null });
  // Lote: só no roteiro normal (sem correção nem retomada), com os próximos da fila que ainda não têm roteiro nem instrução do humano.
  const outros =
    continuar || extra || !(d.loteRoteiro > 1)
      ? []
      : fila(cenarios(dir))
          .filter((x) => x.id !== c.id && !x.instrucao && !roteiroDe(dir, x))
          .slice(0, d.loteRoteiro - 1)
          .map((x) => ({
            c: x,
            itens: massa(dir).itens.filter(
              (i) => (i.cenarios || []).includes(x.id) && massaValida(i, new Date(), d.horaRefresh)
            ),
            exige: exigenciasDe(dir, x)
          }));
  if (outros.length) mudar(dir, { loteRoteiro: outros.map((o) => o.c.id) });
  let r;
  try {
    r = await claude(
      dir,
      {
        prompt: continuar
          ? promptContinuar(c, continuar.resposta)
          : outros.length
            ? promptLote(d.chave, cc, amb, itens, dir, exigenciasDe(dir, c), outros)
            : promptCenario(d.chave, cc, amb, itens, dir, exigenciasDe(dir, c)),
        titulo: `QA · ${c.id} · ${continuar ? 'continuando após a resposta' : extra ? 'novo roteiro' : outros.length ? `roteiros de ${[c, ...outros.map((o) => o.c)].map((x) => x.id).join(', ')}` : c.titulo}`,
        cwd: amb.backend || d.backend,
        ...(continuar ? { sessao: continuar.sid } : {})
      },
      outros.length && d.timeoutMin > 0 ? { ...d, timeoutMin: d.timeoutMin + 10 * outros.length } : d // +10 min por roteiro adiantado
    );
  } finally {
    if (outros.length) mudar(dir, { loteRoteiro: null });
  }
  if (outros.length) {
    const feitos = outros.filter((o) => roteiroDe(dir, o.c)).map((o) => o.c.id);
    aoVivo.anotar(dir, {
      tipo: 'acao',
      texto: `Lote de roteiros: ${feitos.length} de ${outros.length} adiantado(s)${feitos.length ? ` (${feitos.join(', ')})` : ''}`
    });
  }
  const fim = depoisDoClaude(dir, d, c, r, itens, { retomavel: true });
  if (fim !== 'segue') return { fim };
  const roteiro = roteiroDe(dir, atual());
  if (roteiro) return { roteiro };
  bloquearFluxo(dir, d, c, 'o Claude terminou sem registrar o roteiro nem o resultado');
  return { fim: 'parou' };
}

module.exports = { obterRoteiro };
