// @ts-check
// Etapa pronta: segue sozinho para a próxima ou para e pede aprovação.
const aoVivo = require('../../../componentes/ao-vivo');
const { ETAPAS, logica } = require('../etapas');
const { mudar } = require('../estado');
const { lerEntrada } = require('../entrada');

// Pede aprovação quando a entrada tem lacuna (prontidão abaixo de alta) ou a etapa exige (sempreAprovar: a 4, base da reprodução);
// com entrada boa as etapas 1 a 3 seguem sozinhas. Sem entrada gravada (ticket antigo) vale o comportamento de sempre: aprovar.
const avancarEtapa = async (s, t, n) => {
  const dir = s.pastaAba(t.id),
    entrada = lerEntrada(dir);
  if (logica(n).sempreAprovar || !entrada || entrada.exigeAprovacaoInicial) return aguardarAprovacao(s, t, n);
  aoVivo.anotar(dir, {
    tipo: 'fim',
    texto: `Etapa ${n} concluída: ${ETAPAS[n - 1].arq} criado (entrada completa: segue sozinho)`
  });
  mudar(dir, { etapa: n + 1, fase: 'parado', pausa: null, aprovacao: null });
  return require('./seguir').seguir(s, t);
};

// Documento da etapa criado: como no refinamento, o Mergulho para e espera você abrir, aprovar (segue sozinho para a próxima) ou pedir ajuste.
const aguardarAprovacao = (s, t, n) => {
  const dir = s.pastaAba(t.id);
  mudar(dir, { etapa: n, fase: 'aguardando', pausa: null, aprovacao: { etapa: n, lido: false } });
  aoVivo.anotar(dir, {
    tipo: 'fim',
    texto: `Etapa ${n} concluída: ${ETAPAS[n - 1].arq} criado. Aguardando sua aprovação`
  });
  s.render();
};

module.exports = { avancarEtapa, aguardarAprovacao };
