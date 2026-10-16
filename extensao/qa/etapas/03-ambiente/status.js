// @ts-check
const { rodando } = require('../../orquestrador/rodando');
const { ambiente } = require('./estado');

// Rodapé do painel: preparando (clique abre o log ao vivo) · erro (luz vermelha piscando + bolinha até você abrir a análise) · pronto.
function statusAmbiente(dir) {
  const a = ambiente(dir);
  if (!a) return null;
  if (a.preparando && rodando(dir)) return { tipo: 'preparando' };
  if (a.parou_em)
    return {
      tipo: 'erro',
      analisando: !!a.analise?.analisando && rodando(dir),
      nova: !!a.analise?.texto && !a.analise.vista,
      etapa: a.parou_em
    };
  return a.preparando ? null : { tipo: 'pronto' };
}
// Conteúdo do modal do rodapé: etapa, erro, pendências e a análise do Claude (se houver).
function resumoErroAmbiente(dir) {
  const a = ambiente(dir);
  if (!a?.parou_em) return null;
  const pend = (a.itens || []).filter((i) => i.verdito === 'PENDENTE').map((i) => `⛔ ${i.item}: ${i.detalhe || ''}`);
  return {
    titulo: `Ambiente parou na etapa ${a.parou_em}`,
    analise: a.analise?.texto || null,
    analisando: !!a.analise?.analisando && rodando(dir),
    detalhe: [a.erro, ...pend].filter(Boolean).join('\n')
  };
}

module.exports = { statusAmbiente, resumoErroAmbiente };
