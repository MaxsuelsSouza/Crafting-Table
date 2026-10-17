// @ts-check
const { markdown } = require('../../../componentes/markdown');
const { esc } = require('../../../infra/texto');
const dossie = require('../../../infra/dossie');
const { ambiente } = require('../orquestrador/ambiente');
const { CSS } = require('./css');

// Aba Dossiê: o que a esteira sabe do ticket, recalculado ao abrir (não depende de a esteira ter rodado). d: dados da aba (d.jira).
// Ticket com subtarefas: antes, a seção Subtarefas (tabela, plano e o seletor Pai/G1/G2); o dossiê de um grupo é o gravado na pasta dele.
const corpoDossie = (t, d0, dir) => {
  const sub = require('./dossie-subtarefas'),
    secao = sub.secao(dir, t),
    dirD = sub.pastaDoDossie(dir);
  if (dirD !== dir) {
    const g = dossie.lerGravado(dirD);
    return `${CSS}${secao}${g ? `<div class="caixa-t">Dossiê do grupo</div><div class="folha es-doc">${markdown(dossie.paraMarkdown(g))}</div>` : '<div class="folha"><div class="vazio-aba">O grupo ainda não montou o dossiê.</div></div>'}`;
  }
  let d = dossie.lerGravado(dir);
  try {
    const env = ambiente({ reposDe: require('../../../infra/ticket/repos').reposDe }, t);
    d = dossie.montar(t, { j: d0?.jira && !d0.jira.erro ? d0.jira : undefined, banco: env.banco, repos: env.repos });
  } catch {
    /* sem configuração (teste): fica o gravado */
  }
  if (!d) return `${CSS}${secao}<div class="folha"><div class="vazio-aba">Sem dossiê ainda.</div></div>`;
  return `${CSS}${secao}<div class="caixa-t">Dossiê<span>${esc(d.gerado ? new Date(d.gerado).toLocaleString('pt-BR') : '')}</span></div><div class="folha es-doc">${markdown(dossie.paraMarkdown(d))}</div>`;
};

module.exports = { corpoDossie };
