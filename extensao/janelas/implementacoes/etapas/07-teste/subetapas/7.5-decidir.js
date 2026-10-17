// @ts-check
// 7.5 · Decidir (código): score ≥ mínimo → segue para o Resumo, sem portão. Abaixo do mínimo com causa de código (CT falhou ou erro novo
// de console/rede) na 1ª vez → volta para a 5 em modo correção ('teste', com os achados de 05-implementacao/regras/falhas.js), passa
// pela 6 e volta para a 7 com o fluxo reaberto. Senão pausa 'teste' (opcoes.js). Ticket com subtarefas: a correção roda no G1 (checkout).
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const fluxo = require('../../../../../componentes/fluxo-passos');
const controle = require('../../../../../infra/controle');
const { estado, mudar, pausar } = require('../../../estado');
const { JSON_, dirTeste } = require('../arquivos');
const { CORRIGIR, RETESTAR, ABAIXO } = require('../opcoes');

const ehPai = (t, dir) => !t.grupo && estado(dir).subtarefas === 'sim';
const causaCodigo = (r) =>
  r.cts.some((c) => c.nivel === 'falhou' || (c.sinais?.console || 0) + (c.sinais?.rede || 0) > 0);

// Volta para a 5 (correção pelo teste): o fluxo reabre inteiro, porque o código vai mudar.
async function corrigir(s, t, dir) {
  const n = (estado(dir).tentativasTeste || 0) + 1;
  fluxo.reabrir(dirTeste(dir));
  if (ehPai(t, dir)) {
    const { lerPlano } = require('../../00-subtarefas/arquivos'),
      { contexto } = require('../../../orquestrador/grupos/contexto'),
      { seguir } = require('../../../orquestrador/seguir'); // ciclo: seguir → avancar → 07-teste
    const g1 = lerPlano(dir)?.grupos[0],
      c = g1 && contexto(s, t, g1.id);
    if (!c) return;
    fs.copyFileSync(path.join(dir, JSON_), path.join(c.dir, JSON_));
    mudar(c.dir, { etapa: 5, fase: 'parado', pausa: null, tentativas: 0, correcao: 'teste' });
    mudar(dir, { pausa: null, fase: 'grupos', tentativasTeste: n });
    return seguir(c.s, c.t);
  }
  mudar(dir, { etapa: 5, fase: 'parado', pausa: null, tentativas: 0, correcao: 'teste', tentativasTeste: n });
  const { rodarEtapa } = require('../../../orquestrador/rodar-etapa'); // ciclo
  return rodarEtapa(s, t, 5, controle.nova(dir));
}

/** @returns {Promise<boolean>} true = segue para o Resumo */
async function decidir(s, t, dir, r) {
  if (r.score >= r.minimo) {
    mudar(dir, { testado: true, testeSub: null });
    aoVivo.anotar(dir, {
      tipo: 'fim',
      texto: `Teste na aplicação: score ${r.score}/5 (mínimo ${r.minimo}): segue para o resumo`
    });
    return true;
  }
  const codigo = causaCodigo(r);
  aoVivo.anotar(dir, { tipo: 'aviso', texto: `Teste na aplicação: score ${r.score}/5, abaixo do mínimo ${r.minimo}` });
  if (codigo && (estado(dir).tentativasTeste || 0) < 1) {
    aoVivo.anotar(dir, {
      tipo: 'acao',
      texto: 'Causa de código: volta para a Implementação em modo correção com os achados'
    });
    await corrigir(s, t, dir);
    return false;
  }
  pausar(dir, 7, {
    motivo: 'teste',
    pergunta:
      `Score ${r.score}/5, abaixo do mínimo ${r.minimo} (veja a aba Teste): ${r.motivos.join('; ')}.` +
      (codigo ? '' : ' A causa não parece ser de código (bloqueio, cobertura ou ambiente).') +
      ' Para ajustar o plano de CTs, escreva abaixo o que mudar.',
    opcoes: [...(codigo ? [CORRIGIR] : []), RETESTAR, ABAIXO]
  });
  return false;
}

module.exports = { decidir, corrigir, ehPai, causaCodigo };
