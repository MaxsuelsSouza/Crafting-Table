// @ts-check
// Execução terminou: card não confirmado, spec que não nasceu, impactos, refinamento.md e as filas (triagem, impacto, tarefas).
const { pasta } = require('../../../infra/ticket/pasta-ticket');
const maestro = require('../../../infra/agentes/maestro');
const { notificar } = require('../../../painel/notificacoes');
const { anotar } = require('../../../componentes/ao-vivo');
const pacote = require('../pacote');
const { TAREFAS, tarefasDe, ticketDe, estadoSpec } = require('../locais');
const { estadoDe, mudarEstado } = require('../estado');
const { s, alterando } = require('./servicos');
const { filaTarefas } = require('./fila-tarefas');
const { avisarImpactos } = require('../etapas/comentarios/avisar');
const { filaTriagem } = require('../etapas/comentarios/triagem');
const { filaImpactos } = require('../etapas/comentarios/impacto');

// Execução terminou: card que o Claude não confirmou (sdd-state card editar) volta a Pendente; depois, a fila.
const depoisDaEtapa = (t) => {
  if (maestro.rodando(pasta(t.chave))) return;
  if (alterando.size) {
    const l = tarefasDe(pasta(t.chave));
    let mudou = false;
    for (const c of l)
      if (alterando.has(c.id) && c.status === 'em_alteracao' && !c.fila) {
        c.status = 'pendente';
        (c.historico ||= []).push({
          em: new Date().toISOString(),
          evento: 'alteracao',
          texto: 'O Claude não confirmou a alteração: confira e peça de novo se precisar'
        });
        mudou = true;
      }
    alterando.clear();
    if (mudou) s.gravar(t.chave, TAREFAS, l);
  }
  semSpec(t);
  avisarImpactos(t);
  pacote.gravar(t.chave); // refinamento.md: tudo o que a execução deixou (passos, decisões, respostas, mudanças)
  filaTriagem(t);
  filaImpactos(t);
  filaTarefas(t);
};
// A execução que cria a spec terminou e a spec não existe (ex.: o sdd-state foi negado): o "Preparando…" nunca sairia sozinho. Volta ao
// ▶ (estado desligado) com o motivo na linha do Ao vivo; o próximo ▶ tenta de novo.
const semSpec = (t) => {
  const chave = t.chave || t.id;
  if (estadoDe(chave) !== 'aguardando_inicio' || estadoSpec(ticketDe(chave) || t)) return;
  mudarEstado(chave, 'desligado');
  anotar(pasta(chave), {
    tipo: 'erro',
    texto: 'A spec não foi criada: a execução terminou sem o sdd-state init. Clique em ▶ para tentar de novo'
  });
  notificar(chave, 'impacto', 'A spec não foi criada: confira o Ao vivo da aba Spec e tente de novo');
};

module.exports = { depoisDaEtapa, semSpec };
