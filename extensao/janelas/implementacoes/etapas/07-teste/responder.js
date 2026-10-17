// @ts-check
// Resposta à pausa 'teste' (etapa 7), chamada pelo orquestrador/responder.js:
//   Tentar corrigir mais uma vez  volta para a 5 (correção pelo teste)  ·  Rodar os testes de novo  reabre o fluxo e roda a 7
//   Seguir para o resumo abaixo do mínimo  teste.json com entregavel:false (o Resumo cita)  ·  Gerar o plano de novo / texto livre  refaz a 7.1
// No pai com subtarefas, "seguir" é o ▶ do pai (fila → concluir, que roda a 7 de novo enquanto não estiver testado).
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../componentes/ao-vivo');
const fluxo = require('../../../../componentes/fluxo-passos');
const controle = require('../../../../infra/controle');
const { mudar } = require('../../estado');
const { dirTeste, lerResultado, gravarResultado, arquivarPlano, PLANO } = require('./arquivos');
const { CORRIGIR, RETESTAR, ABAIXO, REFAZER_PLANO } = require('./opcoes');
const { corrigir, ehPai } = require('./subetapas/7.5-decidir');

async function responder(s, t, r) {
  const { seguir } = require('../../orquestrador/seguir'), // ciclo: seguir → avancar → 07-teste
    { proxima } = require('../../orquestrador/avancar');
  const dir = s.pastaAba(t.id),
    pai = ehPai(t, dir),
    voltar = (patch) => {
      mudar(dir, { pausa: null, ...patch, ...(pai ? { fase: 'grupos' } : { etapa: 7, fase: 'parado' }) });
      return seguir(s, t);
    };
  if (r === CORRIGIR) return corrigir(s, t, dir);
  if (r === RETESTAR) {
    fluxo.reabrir(dirTeste(dir));
    return voltar({});
  }
  if (r === ABAIXO) {
    gravarResultado(dir, {
      score: 0,
      minimo: 0,
      tetos: [],
      motivos: [],
      cts: [],
      ...lerResultado(dir),
      entregavel: false,
      decisao: 'usuario'
    });
    aoVivo.anotar(dir, {
      tipo: 'aviso',
      texto: 'Seguiu para o resumo abaixo do mínimo por decisão sua (entregavel: false)'
    });
    if (pai) return voltar({ testado: true });
    mudar(dir, { pausa: null, testado: true });
    return proxima(s, t, 7, controle.nova(dir));
  }
  // Gerar de novo ou texto livre: refaz o plano de CTs (o anterior fica no histórico)
  const ajuste = r === REFAZER_PLANO ? '' : r;
  arquivarPlano(dir);
  fs.rmSync(path.join(dir, PLANO), { force: true });
  if (ajuste) aoVivo.anotar(dir, { tipo: 'aviso', texto: `Ajuste no plano de CTs: ${ajuste.slice(0, 120)}` });
  return voltar({ testeAjuste: ajuste || undefined });
}

module.exports = { responder };
