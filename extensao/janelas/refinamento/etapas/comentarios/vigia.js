// @ts-check
const fs = require('fs');
const path = require('path');
const jira = require('../../../../infra/provedores/fachada').jira;
const tickets = require('../../../../infra/ticket/tickets');
const { pasta } = require('../../../../infra/ticket/pasta-ticket');
const { notificar } = require('../../../../painel/notificacoes');
const { IMPACTOS, impactosDe } = require('../../locais');
const { s } = require('../../orquestrador/servicos');
const { CONTEXTO } = require('../../orquestrador/blocos-prompt');
const { abertasDe, filaTriagem } = require('./triagem');
const { filaImpactos } = require('./impacto');

// Vigia: comentários de outras pessoas nos tickets com spec. Na primeira vez só marca o que já existe como visto.
let vigiando = false;
const vigiarComentarios = async () => {
  if (vigiando) return;
  const conectado = await jira.conectado(s.secrets).catch(() => false); // ticket-documento é local: vigia sem conta
  vigiando = true;
  try {
    for (const t0 of tickets.listar().filter((x) => x.spec?.dir && (conectado || jira.ehDocumento(x)))) {
      let cs, eu;
      try {
        [cs, eu] = await Promise.all([jira.comentarios(s.secrets, jira.alvo(t0)), jira.eu(s.secrets, t0.site)]);
      } catch {
        continue;
      }
      const t = tickets.ler(t0.chave);
      let v = t.vigiaComentarios;
      if (!v) {
        // Ticket-documento: o que já estava no contexto entregue à IA (.contexto-ticket.md) é visto; o colado depois é novo.
        const doc = jira.ehDocumento(t);
        let base = Date.now();
        if (doc) {
          try {
            base = fs.statSync(path.join(pasta(t.chave), CONTEXTO)).mtimeMs;
          } catch {
            /* sem contexto */
          }
        }
        v = {
          desde: new Date(base).toISOString(),
          vistos: cs.filter((c) => Date.parse(c.data) <= base).map((c) => c.id)
        };
        tickets.gravar({ ...t, vigiaComentarios: v });
        if (!doc) continue;
      }
      const novos = cs.filter(
        (c) => !v.vistos.includes(c.id) && c.autorId !== eu.id && Date.parse(c.data) >= Date.parse(v.desde) - 60000
      );
      if (!novos.length) continue;
      const l = impactosDe(pasta(t.chave)),
        ab = abertasDe(t),
        temAberta = ab.duvidas.length || ab.perguntas.length;
      for (const c of novos) {
        if (!l.some((i) => i.id === c.id)) l.push({ ...c, status: temAberta ? 'triagem' : 'na_fila' });
        notificar(t.chave, 'impacto', `Comentário novo de ${c.autor}: analisando o impacto no refinamento`);
      }
      s.gravar(t.chave, IMPACTOS, l);
      tickets.gravar({
        ...tickets.ler(t.chave),
        vigiaComentarios: { ...v, vistos: [...new Set([...v.vistos, ...novos.map((c) => c.id)])] }
      });
      filaTriagem(t);
      filaImpactos(t);
    }
  } finally {
    vigiando = false;
  }
};

module.exports = { vigiarComentarios };
