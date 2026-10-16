// @ts-check
// Conferência depois de cada execução de passo: problema volta ao Claude (correção limitada); esgotou, pausa com o motivo.
const { pasta } = require('../../../infra/ticket/pasta-ticket');
const { anotar } = require('../../../componentes/ao-vivo');
const { duvidasDe, impactosDe, ticketDe, estadoSpec, refinoDe, gravarRefino } = require('../locais');
const { estadoDe, mudarEstado } = require('../estado');
const mudancas = require('../etapas/comentarios/regras');
const { s } = require('./servicos');
const { etapa } = require('./etapa');
const { retomada, pedirMemoria } = require('./memoria');
const { MAX_CORRECOES, problemaDoPasso } = require('./verificacao');
const { sdd } = require('./sdd');

const promptCorrecao = (t, n, problema, k, titulo = estadoSpec(t)?.passos[n]?.titulo || '') =>
  `A conferência da extensão encontrou um problema no passo ${n}: ${problema}. Correção ${k} de ${MAX_CORRECOES}.${retomada(t, n, titulo)} e conserte só isso; depois rode concluir ${n}.${pedirMemoria(t, n, true)}`;
const conferir = (t0, n) => {
  const t = ticketDe(t0.chave) || t0,
    dir = pasta(t.chave);
  const est = estadoSpec(t);
  if (!est || estadoDe(t.chave) !== 'rodando') return false; // pausado: quem retoma decide
  const concluiu = ['aguardando_revisao', 'aprovado'].includes(est.passos[n]?.status);
  // Terminou para perguntar ou esperar resposta: não é falha.
  if (
    !concluiu &&
    (est.perguntas.some((q) => q.status === 'aberta') ||
      duvidasDe(dir).some((x) => !x.resposta) ||
      mudancas.pendentes(impactosDe(dir)).length)
  )
    return false;
  const prob = problemaDoPasso(t, n);
  if (!prob) {
    if (refinoDe(dir).correcao) gravarRefino(dir, { correcao: null });
    return false;
  }
  const feitas = refinoDe(dir).correcao?.passo === n ? refinoDe(dir).correcao.tentativas : 0;
  if (feitas >= MAX_CORRECOES) {
    gravarRefino(dir, {
      correcao: null,
      pausa: {
        motivo: 'verificacao',
        passo: n,
        pergunta: `O passo ${n} não ficou pronto depois de ${MAX_CORRECOES} correções.`,
        detalhe: prob.texto
      }
    });
    mudarEstado(t.chave, 'pausado');
    anotar(dir, {
      tipo: 'erro',
      texto: `Passo ${n}: ${prob.texto}. Refinamento pausado depois de ${MAX_CORRECOES} correções`,
      detalhe: 'Abra a aba Spec, veja o que faltou e continue com ▶ ou peça ajuste.'
    });
    s.render();
    return false;
  }
  gravarRefino(dir, { correcao: { passo: n, tentativas: feitas + 1, problema: prob.texto } });
  anotar(dir, {
    tipo: 'aviso',
    texto: `Conferência do passo ${n}: ${prob.texto}. Pedindo correção ${feitas + 1} de ${MAX_CORRECOES}`
  });
  const roda = () =>
    etapa(
      t,
      promptCorrecao(t, n, prob.texto, feitas + 1),
      false,
      undefined,
      `Corrigindo o passo ${n} (${feitas + 1}/${MAX_CORRECOES})`,
      () => conferir(t, n)
    );
  if (prob.tipo === 'artefato')
    sdd(['ajuste', String(n), '--ref', dir, '--motivo', `Conferência da extensão: ${prob.texto}`]).then(roda); // reabre o passo para o concluir de novo
  else roda();
  return true;
};

module.exports = { promptCorrecao, conferir };
