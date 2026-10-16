// @ts-check
// Etapa pronta: portão de aprovação (4 sempre; 2 só com prontidão abaixo de "alta") ou segue sozinha para a próxima (proxima).
const aoVivo = require('../../../componentes/ao-vivo');
const controle = require('../../../infra/controle');
const dossie = require('../../../infra/dossie');
const { ETAPAS } = require('../etapas');
const { mudar } = require('../estado');
const { verificar } = require('../etapas/06-verificacao');
const { rodarEtapa } = require('./rodar-etapa');

const avancar = async (s, t, n, rodada) => {
  const dir = s.pastaAba(t.id),
    d = dossie.lerGravado(dir);
  const portao = n === 4 || (n === 2 && d?.exigeAprovacaoEntendimento);
  if (portao) {
    mudar(dir, { etapa: n, fase: 'aguardando', pausa: null, aprovacao: { etapa: n, lido: false } });
    aoVivo.anotar(dir, {
      tipo: 'fim',
      texto: `Etapa ${n} concluída: ${ETAPAS[n - 1].arq} criado. Aguardando sua aprovação`
    });
    return;
  }
  aoVivo.anotar(dir, { tipo: 'fim', texto: `Etapa ${n} concluída: ${ETAPAS[n - 1].arq}` });
  return proxima(s, t, n, rodada);
};
const proxima = async (s, t, n, rodada) => {
  const dir = s.pastaAba(t.id);
  if (n >= 7) {
    mudar(dir, { etapa: 7, fase: 'concluido', pausa: null });
    aoVivo.anotar(dir, { tipo: 'fim', texto: 'Esteira concluída: implementacao.md é a entrada do QA' });
    return;
  }
  mudar(dir, { etapa: n + 1, fase: 'parado', pausa: null });
  if (n + 1 === 6) return verificar(s, t, controle.valida(dir, rodada) ? rodada : controle.nova(dir));
  return rodarEtapa(s, t, n + 1, rodada);
};

module.exports = { avancar, proxima };
