// @ts-check
// Aba Dossiê do ticket com subtarefas: a tabela das subtarefas (situação, grupo e, nas concluídas, a branch onde está o código), o plano em
// etapas (plano-subtarefas.md) e o seletor "Pai · G1 · G2" que escolhe de quem é o dossiê mostrado abaixo (dossie.js).
const fs = require('fs');
const path = require('path');
const { markdown } = require('../../../componentes/markdown');
const { esc } = require('../../../infra/texto');
const { PLANO_MD, lerSubs, lerPlano, dirGrupo } = require('../etapas/00-subtarefas/arquivos');
const { situacao } = require('../etapas/00-subtarefas/regras/filtro');
const { btn } = require('./css');

const escolhido = new Map(); // pasta da aba -> grupo mostrado no dossiê ('' = pai)
const escolher = (dir, key) => escolhido.set(dir, key || '');
// Pasta cujo dossiê aparece (a do grupo escolhido, se ele ainda existe no plano).
const pastaDoDossie = (dir) => {
  const k = escolhido.get(dir);
  return k && lerPlano(dir)?.grupos.some((g) => g.id === k) ? dirGrupo(dir, k) : dir;
};

const ROTULO = { aberta: 'aberta', concluida: 'concluída', fora: 'fora (QA ou cancelada)' };
const tabela = (subs) =>
  `<table class="es-tab"><tr><th>Subtarefa</th><th>Resumo</th><th>Status</th><th>Situação</th><th>Grupo</th></tr>${subs
    .map(
      (x) =>
        `<tr><td class="chave">${esc(x.key)}</td><td>${esc(x.resumo || '')}</td><td>${esc(x.status || '')}</td><td>${esc(ROTULO[x.situacao] || '')}${x.situacao === 'concluida' ? `<br><small>${x.branch ? `código em ${esc(x.branch)}` : 'código não encontrado'}</small>` : ''}</td><td>${esc(x.grupo || '')}</td></tr>`
    )
    .join('')}</table>`;

/** HTML da seção (vazio se o ticket não tem subtarefa aberta nem passou pela etapa 0). Antes da etapa 0: as do .ticket.json (t.subtarefas). */
function secao(dir, t) {
  const salvas = lerSubs(dir),
    subs = salvas.length ? salvas : (t?.subtarefas || []).map((x) => ({ ...x, situacao: situacao(x) }));
  if (!subs.some((x) => x.situacao === 'aberta') && !salvas.length) return '';
  let plano = '';
  try {
    plano = fs.readFileSync(path.join(dir, PLANO_MD), 'utf8');
  } catch {
    /* ainda sem plano */
  }
  const grupos = lerPlano(dir)?.grupos || [],
    atual = escolhido.get(dir) || '';
  const seletor = grupos.length
    ? `<div class="es-barra">${[{ id: '', titulo: 'Pai' }, ...grupos]
        .map((g) =>
          btn(
            esc(g.id || 'Pai'),
            'esteiraDossieDe',
            ` data-key="${esc(g.id)}" title="${esc(g.titulo)}"`,
            g.id === atual ? 'bt bt-principal' : 'bt bt-contorno'
          )
        )
        .join('')}</div>`
    : '';
  return `<div class="caixa-t">Subtarefas<span>${subs.filter((x) => x.situacao === 'aberta').length} aberta(s)</span></div><div class="folha">${tabela(subs)}</div>
  <div class="caixa-t">Plano de implementação em etapas</div><div class="folha es-doc">${plano ? markdown(plano) : '<div class="vazio-aba">Plano ainda não gerado (Etapa 0 da Esteira).</div>'}</div>
  ${seletor ? `<div class="caixa-t">Dossiê de</div><div class="folha">${seletor}</div>` : ''}`;
}

module.exports = { secao, escolher, pastaDoDossie };
