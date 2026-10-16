// @ts-check
const cardCenario = require('../../../../componentes/card-cenario');
const { arquivosDe } = require('../../etapas/06-execucao/evidencias');
const { PARA_REFAZER } = require('../../etapas/02-cenarios/refazer');

function mapaHtml(dir, r, amb, uri) {
  const ativos = r.cenarios.filter((c) => !c.arquivado),
    arq = r.cenarios.filter((c) => c.arquivado);
  if (!r.cenarios.length) return '';
  const feitos = ativos.filter((c) => c.status === 'passou').length,
    dispensados = ativos.filter((c) => c.status === 'dispensado').length,
    semMassa = ativos.filter((c) => c.status === 'nao-executavel').length;
  const ctx = { dir, amb, uri, arquivos: (x) => arquivosDe(dir, x) };
  const nRef = ativos.filter((c) => PARA_REFAZER.includes(c.status)).length;
  return `<div class="caixa-t">Cenários · plano v${r.planoVersao}${nRef ? ` <button class="sec" data-painel="qaRefazerLote" title="Pergunta, cenário a cenário, como refazer os que falharam ou ficaram bloqueados">↻ Refazer (${nRef})</button>` : ''}<span>${feitos}/${ativos.length - dispensados - semMassa} passaram${dispensados ? ` · ${dispensados} não executado(s) por decisão` : ''}${semMassa ? ` · ${semMassa} não executável(is) sem massa` : ''}</span></div>
    <div class="cens">${[...ativos, ...arq].map((c) => cardCenario.card(c, ctx)).join('')}</div>`;
}

module.exports = { mapaHtml };
