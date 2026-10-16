// @ts-check
const { pasta } = require('../../../infra/pasta-ticket');
const maestro = require('../../../painel/maestro');
const { IMPACTOS, dirSpec, impactosDe, ticketDe, estadoSpec } = require('../../locais');
const { pausado } = require('../../estado');
const mudancas = require('./snapshot');
const { s } = require('../../orquestrador/servicos');
const { etapa } = require('../../orquestrador/etapa');

// Um comentário por vez, numa execução nova (o Claude lê o refinamento inteiro do disco).
const filaImpactos = (t) => {
  if (maestro.rodando(pasta(t.chave)) || pausado(t.chave) || !estadoSpec(ticketDe(t.chave) || t)) return;
  const l = impactosDe(pasta(t.chave)),
    i = l.find((x) => x.status === 'na_fila');
  if (!i) return;
  i.status = 'analisando';
  try {
    mudancas.snapshot(pasta(t.chave), dirSpec(ticketDe(t.chave) || t), `a${i.id}`);
    i.snapAnalise = true;
  } catch {}
  s.gravar(t.chave, IMPACTOS, l);
  etapa(
    ticketDe(t.chave),
    `[impacto] Comentário novo no ticket ${t.chave}. Siga a seção "Mudança vinda de comentário do ticket" da skill sdd: SÓ ANÁLISE, não edite a spec nem os cards.\n` +
      `id: ${i.id} · autor: ${i.autor} · data: ${i.data} · link: ${i.link}\nTexto:\n${i.texto}`,
    false,
    undefined,
    `Analisando comentário de ${i.autor}`,
    undefined,
    true
  );
};

module.exports = { filaImpactos };
