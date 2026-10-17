// @ts-check
// Score 0-5 do Teste na aplicação (PURO, 100% código): cada regra põe um teto e vale o menor. Usado pela 7.4 e pelos testes.
//   0  a aplicação não subiu ou nenhum CT rodou
//   1  um CT crítico falhou
//   2  um CT crítico ficou bloqueado, um CT de regressão falhou, ou a cobertura dos critérios de aceite ficou abaixo de 70%
//   3  um CT não crítico falhou, ou apareceram erros novos de console/rede
//   4  cobertura entre 70% e 99%, mais de 20% dos CTs bloqueados (ou sem rodar), CT com aviso, CA inferido sem CT,
//      ou CT que passou sem print E vídeo (sem os dois não conta como passou com evidência)
//   5  tudo passou com evidência, 100% dos critérios, sem erro novo
// cts: [{ id, criticidade (critica|alta|normal), tipo (aceite|regressao|borda), nivel (infra/testes/nivel.js), print, video, sinais?: { console, rede } }]
// cobertura: { total, cobertos, inferidoSemCt } (regras/cobertura.js)
const RODOU = ['passou', 'passou-com-aviso', 'falhou'],
  PASSOU = ['passou', 'passou-com-aviso'];

/** @returns {{ score: number, tetos: { nota: number, motivo: string }[] }} tetos do menor para o maior */
function score({ subiu, cts = [], cobertura = { total: 0, cobertos: 0, inferidoSemCt: false } }) {
  const tetos = [],
    teto = (nota, motivo) => tetos.push({ nota, motivo });
  const quais = (f) => {
    const l = cts.filter(f);
    return l.length ? l.map((c) => c.id).join(', ') : '';
  };
  const se = (nota, f, motivo) => {
    const ids = quais(f);
    if (ids) teto(nota, `${motivo}: ${ids}`);
  };
  const critico = (c) => c.criticidade === 'critica';
  if (!subiu) teto(0, 'a aplicação não subiu');
  else if (!cts.some((c) => RODOU.includes(c.nivel))) teto(0, 'nenhum CT rodou');
  se(1, (c) => critico(c) && c.nivel === 'falhou', 'CT crítico falhou');
  se(2, (c) => critico(c) && c.nivel === 'bloqueado', 'CT crítico bloqueado');
  se(2, (c) => c.tipo === 'regressao' && c.nivel === 'falhou', 'CT de regressão falhou');
  const pct = cobertura.total ? cobertura.cobertos / cobertura.total : 0,
    txt = `cobertura dos critérios de aceite ${Math.round(pct * 100)}% (${cobertura.cobertos}/${cobertura.total})`;
  if (pct < 0.7) teto(2, `${txt}, abaixo de 70%`);
  else if (pct < 1) teto(4, txt);
  se(3, (c) => !critico(c) && c.nivel === 'falhou', 'CT falhou');
  se(3, (c) => (c.sinais?.console || 0) + (c.sinais?.rede || 0) > 0, 'erros novos de console/rede');
  const parados = cts.filter((c) => !RODOU.includes(c.nivel)).length;
  if (cts.length && parados / cts.length > 0.2)
    teto(4, `${parados} de ${cts.length} CTs bloqueados ou sem rodar (mais de 20%)`);
  se(4, (c) => c.nivel === 'passou-com-aviso', 'CT passou com aviso');
  if (cobertura.inferidoSemCt) teto(4, 'critério de aceite inferido sem CT');
  se(4, (c) => PASSOU.includes(c.nivel) && !(c.print && c.video), 'CT passou sem print e vídeo');
  tetos.sort((a, b) => a.nota - b.nota);
  return { score: Math.min(5, ...tetos.map((x) => x.nota)), tetos };
}

module.exports = { score, RODOU, PASSOU };
