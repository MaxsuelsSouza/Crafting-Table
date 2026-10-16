// @ts-check
const { markdown } = require('../../componentes/markdown');
const { esc } = require('../../infra/texto');
const dossie = require('../../infra/dossie');
const { ambiente } = require('../orquestrador/ambiente');
const { CSS } = require('./css');

// Aba Dossiê: o que a esteira sabe do ticket, recalculado ao abrir (não depende de a esteira ter rodado). d: dados da aba (d.jira).
const corpoDossie = (t, d0, dir) => {
  let d = dossie.lerGravado(dir);
  try {
    const env = ambiente({ reposDe: require('../../infra/ticket/repos').reposDe }, t);
    d = dossie.montar(t, { j: d0?.jira && !d0.jira.erro ? d0.jira : undefined, banco: env.banco, repos: env.repos });
  } catch {
    /* sem configuração (teste): fica o gravado */
  }
  if (!d) return '<div class="folha"><div class="vazio-aba">Sem dossiê ainda.</div></div>';
  return `${CSS}<div class="caixa-t">Dossiê<span>${esc(d.gerado ? new Date(d.gerado).toLocaleString('pt-BR') : '')}</span></div><div class="folha es-doc">${markdown(dossie.paraMarkdown(d))}</div>`;
};

module.exports = { corpoDossie };
