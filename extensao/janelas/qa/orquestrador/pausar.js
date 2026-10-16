// @ts-check
const maestro = require('../../../infra/agentes/maestro');
const { estado, mudar } = require('../estado');
const { preparos } = require('../etapas/03-ambiente/estado');
const { vivoPid } = require('./rodando');

// ⏸: o cenário em andamento é descartado; API, Metro e emulador continuam de pé (retomar no mesmo dia custa segundos).
// Vale também para um QA iniciado em outra janela: ela vê execucao = pausado no arquivo e para entre os passos.
function pausar(dir) {
  const e = estado(dir);
  mudar(dir, { execucao: 'pausado', pausadoEm: new Date().toISOString() }); // a retomada decide pela hora da pausa (orquestrador/retomada.js)
  maestro.parar(dir);
  if (preparos.has(dir)) preparos.get(dir).kill('SIGTERM');
  else if (e.pidPreparo && vivoPid(e.pidPreparo)) process.kill(e.pidPreparo, 'SIGTERM');
}

module.exports = { pausar };
