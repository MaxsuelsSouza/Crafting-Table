// @ts-check
// A spec do ticket: onde mora e como ler (saiu de refinamento/locais.js, que reexporta). O Refinamento produz a spec; os outros
// módulos a leem como entrada.
// Onde é usado: painel.js, conversas.js (a spec como entrada da conversa), aba-docs.js (docs da spec), infra/dossie/montar.js
// (spec, cards e análises) e o próprio Refinamento.
// Como usar: const { dirSpec, estadoSpec, comSpec, arqHandoff, docsDaSpec, tarefasDe, TAREFAS, HANDOFF } = require('../infra/spec');
//   dirSpec(r) pasta da spec (ou null) · estadoSpec(r) sdd-state.json · comSpec(t) ticket com specPronta
//   arqHandoff(r, 'backend'|'mobile') análise da camada · docsDaSpec(r) .md da spec para a aba Docs · tarefasDe(dir) cards do passo 4
const fs = require('fs');
const path = require('path');
const { pasta, ler } = require('./pasta-ticket');

const HANDOFF = { backend: 'mapa-backend.md', mobile: 'mapa-mobile.md' };
const HANDOFF_LEGADO = { backend: '.handoff-backend.md', mobile: '.handoff-mobile.md' }; // antes: pasta do ticket

const dirSpec = (r) => (r.spec?.repo && r.spec?.dir ? path.join(r.spec.repo, r.spec.dir) : null);
// Análise de uma camada: a da spec; se ainda não existe e há uma antiga na pasta do ticket, usa a antiga.
function arqHandoff(r, lado) {
  const novo = dirSpec(r) && path.join(dirSpec(r), HANDOFF[lado]);
  const legado = path.join(pasta(r.id || r.chave), HANDOFF_LEGADO[lado]);
  return novo && (fs.existsSync(novo) || !fs.existsSync(legado)) ? novo : legado;
}

const EXCLUIDOS_DOCS = new Set(Object.values(HANDOFF));
// Arquivos de spec que a aba Docs mostra: constitution.md + todo .md da pasta da spec, menos os da aba Análise.
function docsDaSpec(r) {
  if (!r.spec?.repo) return [];
  const arqs = [path.join(r.spec.repo, 'constitution.md')];
  try { for (const n of fs.readdirSync(dirSpec(r))) if (/\.md$/i.test(n) && !n.startsWith('.') && !EXCLUIDOS_DOCS.has(n)) arqs.push(path.join(dirSpec(r), n)); } catch { /* spec ainda não criada */ }
  return arqs.flatMap((full) => { try { return [{ nome: path.basename(full), full, atalho: false, origem: full, mtime: fs.statSync(full).mtimeMs }]; } catch { return []; } });
}

const TAREFAS = '.tarefas.json'; // cards das tarefas do passo 4 (sdd-state card); aprovar/reprovar é daqui
// Card antigo guardava a chave da subtarefa em `jira`; hoje é `ticket` (lê os dois, a próxima gravação já vai como `ticket`).
const cardAtual = ({ jira, ...c }) => (jira === undefined ? c : { ...c, ticket: c.ticket ?? jira });
const tarefasDe = (dir) => { const l = dir ? ler(path.join(dir, TAREFAS), []) : []; return Array.isArray(l) ? l.map(cardAtual) : []; };

const estadoSpec = (r) => (dirSpec(r) ? ler(path.join(dirSpec(r), 'sdd-state.json'), null) : null);
const comSpec = (t) => t && { ...t, specPronta: !!(t.spec?.dir && estadoSpec(t)) };

module.exports = { HANDOFF, HANDOFF_LEGADO, dirSpec, arqHandoff, docsDaSpec, TAREFAS, tarefasDe, estadoSpec, comSpec };
