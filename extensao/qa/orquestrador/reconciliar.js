// @ts-check
const aoVivo = require('../../componentes/ao-vivo');
const { estado, mudar } = require('../estado');
const { rodando } = require('./rodando');
const { cenarios } = require('../etapas/02-cenarios/mapa');
const { concluirCenario } = require('../etapas/06-execucao/cenario');

// Rodada que morreu sem o finally (janela fechada, crash): estado diz rodando mas ninguém roda. Vira parado e o cenário preso volta à fila.
function reconciliar(dir) {
  if (rodando(dir)) return false;
  const e = estado(dir),
    r = cenarios(dir),
    presos = r.cenarios.filter((c) => c.status === 'executando');
  if (e.execucao !== 'rodando' && !presos.length) return false;
  for (const c of presos) {
    try {
      concluirCenario(dir, c.id, 'descartado', 'Execução interrompida (janela fechada ou queda): volta à fila');
    } catch {
      /* sem execução aberta */
    }
  }
  if (e.execucao === 'rodando') mudar(dir, { execucao: 'parado' });
  aoVivo.anotar(dir, {
    tipo: 'aviso',
    texto: `Execução anterior interrompida${presos.length ? `: ${presos.map((c) => c.id).join(', ')} volta(m) à fila` : ''}`
  });
  return true;
}

module.exports = { reconciliar };
