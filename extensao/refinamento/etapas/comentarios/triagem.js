// @ts-check
const { pasta } = require('../../../infra/pasta-ticket');
const maestro = require('../../../painel/maestro');
const { IMPACTOS, duvidasDe, impactosDe, ticketDe, estadoSpec } = require('../../locais');
const { pausado } = require('../../estado');
const { s } = require('../../orquestrador/servicos');
const { etapa } = require('../../orquestrador/etapa');

// Etapa 0: comentário novo que pode responder uma dúvida enviada ao ticket ou uma pergunta aberta do Claude.
// O Claude classifica (sdd-state comentario classificar): resposta (só sugere; o humano confirma), mudança (segue para
// o impacto) ou ruído. Sem dúvida nem pergunta abertas não há o que responder: o comentário vai direto ao impacto.
const abertasDe = (t) => ({
  duvidas: duvidasDe(pasta(t.chave)).filter((x) => x.enviadaEm && !x.resposta),
  perguntas: (estadoSpec(ticketDe(t.chave) || t)?.perguntas || []).filter((q) => q.status === 'aberta')
});
const filaTriagem = (t) => {
  if (maestro.rodando(pasta(t.chave)) || pausado(t.chave)) return;
  const l = impactosDe(pasta(t.chave)),
    c = l.find((x) => x.status === 'triagem');
  if (!c) return;
  const { duvidas, perguntas } = abertasDe(t);
  c.status = 'triando';
  s.gravar(t.chave, IMPACTOS, l);
  etapa(
    ticketDe(t.chave),
    `[triagem] Comentário novo no ticket ${t.chave}: resposta, mudança ou ruído? Siga a seção "Triagem de comentário novo do ticket" da skill sdd.\n` +
      `Dúvidas enviadas sem resposta:\n${
        duvidas
          .filter((x) => !(x.descartados || []).includes(c.id))
          .map((x) => `- ${x.id}: ${x.texto}${x.contexto ? ` (contexto: ${x.contexto})` : ''}`)
          .join('\n') || '(nenhuma)'
      }\n` +
      `Perguntas abertas do Claude:\n${perguntas.map((q) => `- ${q.id}: ${q.pergunta}${q.opcoes?.length ? ` (opções: ${q.opcoes.join(' / ')})` : ''}`).join('\n') || '(nenhuma)'}\n` +
      `Comentário id: ${c.id} · autor: ${c.autor} · data: ${c.data} · link: ${c.link}\nTexto:\n${c.texto}`,
    false,
    undefined,
    `Triando comentário de ${c.autor}`,
    undefined,
    true
  );
};

module.exports = { abertasDe, filaTriagem };
