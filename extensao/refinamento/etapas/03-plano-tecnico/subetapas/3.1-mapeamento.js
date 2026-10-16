// @ts-check
// 3.1 Mapeamento do código: grava mapa-backend.md/mapa-mobile.md na pasta da spec, sem plan.md e sem concluir.
const { pasta } = require('../../../../infra/ticket/pasta-ticket');
const { anotar } = require('../../../../componentes/ao-vivo');
const vagas = require('../../../../infra/agentes/etapas');
const { dirSpec, ticketDe } = require('../../../locais');
const { estadoDe } = require('../../../estado');
const { etapa } = require('../../../orquestrador/etapa');
const { mapasDe, gravarSub3 } = require('./estado');

// Devolve o que a etapa devolveu (true = começou).
const rodar = (t, titulo, extra, sub) => {
  gravarSub3(t.chave, { mapa: 'rodando', plano: 'pendente' });
  const ok = etapa(
    t,
    `Siga a skill sdd, protocolo de retomada, sem perguntar. Passo 3 (${titulo}), SUBETAPA 3.1 · MAPEAMENTO DO CÓDIGO. Rode status e, se o passo 3 ainda não estiver em andamento, rode sdd-state iniciar 3. ` +
      `Faça SÓ o mapeamento do código com a skill ${vagas.rotulo('refinamento.mapa')} (camadas, ref de leitura): grave mapa-backend.md e/ou mapa-mobile.md na pasta da spec e rode mapa-conferir em cada um até passar. ` +
      'NÃO escreva o plan.md e NÃO rode concluir: outra execução, depois desta, escreve o plano a partir dos mapas. Termine quando os mapas existirem.' +
      extra,
    false,
    undefined,
    `Passo 3.1 · Mapeamento do código`,
    () => fimMapeamento(t)
  );
  if (!ok) gravarSub3(t.chave, { mapa: sub.mapa || 'pendente' });
  return ok;
};
// Terminou a execução do 3.1: mapas em disco → conclui e segue sozinho para o 3.2; senão erro (ou "pausada" se foi a pessoa que parou).
const fimMapeamento = (t) => {
  const pausado = estadoDe(t.chave) !== 'rodando';
  if (mapasDe(t).length) {
    gravarSub3(t.chave, { mapa: 'concluida' });
    require('../../../orquestrador/seguir').seguir(ticketDe(t.chave) || t);
    return;
  } // seguir chama o passo 3 de novo (require na hora)
  gravarSub3(t.chave, { mapa: pausado ? 'pausada' : 'erro' });
  if (!pausado)
    anotar(pasta(t.chave), {
      tipo: 'erro',
      texto: 'O mapeamento do código (3.1) terminou sem gravar mapa-backend.md nem mapa-mobile.md na pasta da spec',
      detalhe: `Pasta da spec: ${dirSpec(t)}. O plano técnico (3.2) só começa com os mapas em disco: continue o refinamento para tentar de novo.`
    });
};

module.exports = { rodar, fimMapeamento };
