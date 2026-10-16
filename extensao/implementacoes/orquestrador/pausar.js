// @ts-check
// ⏸ manual: cancela a rodada, para o Claude e a verificação em andamento e grava a pausa "manual" (a etapa recomeça ao retomar).
const maestro = require('../../infra/agentes/maestro');
const controle = require('../../infra/controle');
const { filhos } = require('../dependencias');
const { estado, pausar } = require('../estado');

const pausarManual = (s, t) => {
  const dir = s.pastaAba(t.id);
  controle.cancelar(dir);
  maestro.parar(dir);
  try {
    filhos.get(dir)?.kill('SIGTERM');
  } catch {
    /* já terminou */
  }
  pausar(
    dir,
    estado(dir).etapa,
    { motivo: 'manual', pergunta: 'Esteira pausada por você. A etapa em andamento recomeça ao retomar.' },
    'Esteira pausada por você'
  );
  s.render();
};

module.exports = { pausarManual };
