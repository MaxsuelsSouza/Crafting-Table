// @ts-check
// ── Controle: ⏸ de verdade, e a situação que o cabeçalho e a caixa Ao vivo mostram.
const { pasta } = require('../../infra/pasta-ticket');
const maestro = require('../../painel/maestro');
const controle = require('../../infra/controle');
const { anotar } = require('../../componentes/ao-vivo');
const { duvidasDe, impactosDe, ticketDe, estadoSpec } = require('../locais');
const { estadoDe } = require('../estado');
const mudancas = require('../etapas/comentarios/regras');
const { esperaHumano } = require('./seguir');

// Pausar: cancela a rodada e para o Claude agora (quem chama já gravou o estado "pausado"). A etapa recomeça ao retomar, com a memória do passo em disco.
const interromper = (t) => {
  const dir = pasta(t.chave || t.id);
  controle.cancelar(dir);
  const rodava = maestro.rodando(dir);
  maestro.parar(dir);
  anotar(dir, {
    tipo: 'aviso',
    texto: rodava
      ? 'Refinamento pausado por você: o Claude parou. A etapa recomeça ao retomar'
      : 'Refinamento pausado por você'
  });
};
// "rodando" no ticket só vale com o Claude vivo ou com alguém esperando você (pergunta, revisão, dúvida, decisão); senão está parado e o ▶ continua.
const aguardandoVoce = (t, est) =>
  !!(
    esperaHumano(est) ||
    duvidasDe(pasta(t.chave || t.id)).some((x) => !x.resposta) ||
    mudancas.pendentes(impactosDe(pasta(t.chave || t.id))).length
  );
const situacao = (t) => {
  const chave = t.chave || t.id,
    estado = estadoDe(chave),
    vivo = maestro.rodando(pasta(chave)),
    est = estadoSpec(ticketDe(chave) || t);
  return {
    estado,
    rodando: vivo,
    parado: estado === 'rodando' && !vivo && !!est && est.proximoPasso <= 6 && !aguardandoVoce(t, est)
  };
};

module.exports = { interromper, aguardandoVoce, situacao };
