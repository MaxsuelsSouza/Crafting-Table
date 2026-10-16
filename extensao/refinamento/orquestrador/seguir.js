// @ts-check
// Próxima etapa: rodando e sem nada esperando o humano → o passo seguinte numa execução nova. Passo 3 e 6: arquivos da etapa.
const { pasta } = require('../../infra/ticket/pasta-ticket');
const maestro = require('../../infra/agentes/maestro');
const { duvidasDe, tarefasDe, impactosDe, estadoSpec } = require('../locais');
const { estadoDe, papelDoTicket } = require('../estado');
const mudancas = require('../etapas/comentarios/regras');
const { respondidas } = require('./servicos');
const { etapa } = require('./etapa');
const { pedirMemoria } = require('./memoria');
const { conferir } = require('./conferir');
const { seguirPlano, decompor } = require('../etapas/03-plano-tecnico');
const { qaCaminhos } = require('../etapas/06-plano-testes');

// Rodando e sem nada esperando o humano → próxima etapa numa execução nova (true se começou).
// O que o refinamento espera de você agora (null = nada: o Claude pode seguir).
const esperaHumano = (est) =>
  est.perguntas.some((q) => q.status === 'aberta')
    ? 'perguntas'
    : // Só espera você o passo que dá para aprovar (todos os anteriores aprovados); revisão atrás de passo desatualizado é o Claude que reconcilia.
      est.passos.some(
          (p) =>
            p.status === 'aguardando_revisao' &&
            est.passos.slice(0, p.n).every((x) => x.dispensado || x.status === 'aprovado')
        )
      ? 'revisao'
      : null;
const seguir = (t) => {
  const est = estadoSpec(t);
  if (
    !est ||
    estadoDe(t.chave) !== 'rodando' ||
    maestro.rodando(pasta(t.chave)) ||
    esperaHumano(est) ||
    duvidasDe(pasta(t.chave)).some((x) => !x.resposta) ||
    mudancas.pendentes(impactosDe(pasta(t.chave))).length ||
    est.proximoPasso > 6
  )
    return false;
  const novas = respondidas.splice(0).join('; ');
  const reprovadas = est.proximoPasso === 5 ? tarefasDe(pasta(t.chave)).filter((c) => c.status === 'reprovada') : [];
  const n = est.proximoPasso,
    titulo = est.passos[n].titulo;
  const extra =
    (novas ? ` Respostas do humano desde a última execução: ${novas}.` : '') +
    (reprovadas.length
      ? ` Tarefas reprovadas pelo humano (considere na análise de cobertura): ${reprovadas.map((c) => `${c.id}${c.motivo ? ` (${c.motivo})` : ''}`).join('; ')}.`
      : '');
  if (n === 3 && papelDoTicket(t).papel === 'quebrar') {
    return decompor(t, extra);
  }
  if (n === 3) return seguirPlano(t, titulo, extra);
  return etapa(
    t,
    `Siga a skill sdd, protocolo de retomada, sem perguntar: rode status e trabalhe só o passo ${n} (${titulo}).` +
      (n === 6 ? qaCaminhos() : '') +
      extra +
      pedirMemoria(t, n, false),
    false,
    undefined,
    `Passo ${n} · ${titulo}`,
    () => conferir(t, n)
  );
};

module.exports = { esperaHumano, seguir };
