// @ts-check
// Um cenário da fila: 6.1 roteiro → 6.2 jornada (sem Claude) → 6.3 diagnóstico (só se falhou).
// Roteiro recusado na validação, sem a evidência obrigatória ou apontado pelo diagnóstico volta ao 6.1 UMA vez; na 2ª, pausa no cenário (zero skip).
// Devolve 'parou' | 'sem-massa' | 'fim'.
const path = require('path');
const aoVivo = require('../../../../componentes/ao-vivo');
const { pausado } = require('../../orquestrador/rodando');
const { bloquearFluxo } = require('../../orquestrador/zero-skip');
const { concluirCenario } = require('./cenario');
const { anexarPasta } = require('./evidencias');
const { descartarRoteiro } = require('./roteiros');
const { varsDaMassa } = require('./regras/roteiro');
const { jornada } = require('./dependencias');
const { obterRoteiro } = require('./subetapas/6.1-roteiro');
const { rodarJornada } = require('./subetapas/6.2-jornada');
const { diagnosticar } = require('./subetapas/6.3-diagnostico');
const { prepararInicio } = require('./inicio');

const fimDe = (f) => (f === 'concluido' ? 'fim' : f);

async function executarCenario(dir, d, amb, c, ex, itens) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const pasta = path.join(dir, ex.evidencias),
    deps = d.jornada || jornada(d, amb);
  let extra = '',
    refez = false;
  for (;;) {
    const o = await obterRoteiro(dir, d, amb, c, itens, extra);
    if (o.fim) return fimDe(o.fim);
    vivo('acao', `${c.id}: rodando o roteiro (${o.roteiro.etapas?.length || 0} etapa(s))`);
    d.gravarTela?.(pasta, amb);
    let r;
    try {
      r = await rodarJornada({
        roteiro: o.roteiro,
        base: o.roteiro.base,
        saida: pasta,
        vars: varsDaMassa(itens),
        envBase: deps.envBase,
        deps,
        inicio: prepararInicio(amb?.nome || d.ambiente)
      });
    } finally {
      d.pararTela?.();
    }
    anexarPasta(dir, c.id);
    let motivo = '';
    if (r.status === 'passou') {
      try {
        concluirCenario(
          dir,
          c.id,
          'passou',
          `jornada ok: ${r.detalhes.filter((x) => !/: ok$/.test(x)).join('; ') || 'todos os passos passaram'}`
        );
        return 'fim';
      } catch (e) {
        motivo = e.message; // faltou a evidência obrigatória (ex.: consulta da tabela que a implementação grava)
      }
    }
    if (pausado(dir)) {
      concluirCenario(dir, c.id, 'descartado', 'QA pausado no meio do cenário');
      return 'parou';
    }
    if (r.status === 'invalido') motivo = `roteiro recusado: ${r.detalhes.join('; ')}`;
    else if (r.status === 'falhou') {
      vivo('aviso', `${c.id}: a jornada falhou (${r.detalhes.at(-1)}): diagnosticando`);
      const dg = await diagnosticar(dir, d, amb, c, itens, pasta, r.detalhes);
      if (dg.fim) return fimDe(dg.fim);
      motivo = dg.refazer;
    }
    if (refez) {
      bloquearFluxo(dir, d, c, `o roteiro não serviu de novo: ${motivo}`);
      return 'parou';
    }
    refez = true;
    descartarRoteiro(dir, c.id);
    extra = `O roteiro anterior não serviu: ${motivo}. Escreva outro corrigindo isso.`;
    vivo('aviso', `${c.id}: pedindo outro roteiro (${motivo.slice(0, 160)})`);
  }
}

module.exports = { executarCenario };
