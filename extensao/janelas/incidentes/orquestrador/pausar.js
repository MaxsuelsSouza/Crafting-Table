// @ts-check
// Pausas do Mergulho: a pausa de uma etapa (pedida pela própria etapa ou por um portão) e o ⏸ manual.
const aoVivo = require('../../../componentes/ao-vivo');
const maestro = require('../../../infra/agentes/maestro');
const controle = require('../../../infra/controle');
const fluxo = require('../../../componentes/fluxo-passos');
const { mudar } = require('../estado');

// p = { motivo, pergunta, opcoes?, aviso }: grava a pausa na etapa n e avisa no Ao vivo.
const pausar = (s, dir, n, p) => {
  mudar(dir, { etapa: n, fase: 'pausado', pausa: { motivo: p.motivo, pergunta: p.pergunta, opcoes: p.opcoes || [] } });
  aoVivo.anotar(dir, { tipo: 'aviso', texto: p.aviso });
  return s.render();
};

// ⏸ em qualquer etapa: cancela a rodada, mata o Claude em andamento e guarda a pausa; ▶ retoma da etapa em que parou.
const pausarManual = (s, t) => {
  const dir = s.pastaAba(t.id);
  controle.cancelar(dir);
  maestro.parar(dir);
  fluxo.descartarEmAndamento(dir); // o passo em andamento volta para a fila; os feitos ficam para a retomada rápida
  mudar(dir, {
    fase: 'pausado',
    pausa: {
      motivo: 'manual',
      pergunta: 'Mergulho pausado por você. A etapa em andamento recomeça ao retomar.',
      opcoes: []
    }
  });
  aoVivo.anotar(dir, { tipo: 'aviso', texto: 'Mergulho pausado por você' });
  s.render();
};

module.exports = { pausar, pausarManual };
