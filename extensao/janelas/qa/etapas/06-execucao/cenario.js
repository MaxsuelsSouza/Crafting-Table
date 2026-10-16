// @ts-check
const fs = require('fs');
const path = require('path');
const { gravarJson } = require('../../estado');
const { cenarios, CENARIOS } = require('../02-cenarios/mapa');
const { faltaEvidencia } = require('./regras/evidencia');

// ── Execuções de um cenário. A extensão abre (iniciarCenario); o Claude fecha com `qa-state cenario CTnn concluir`.
// Evidências de cada execução em evidencias/CTnn/<id da execução>/.
const RESULTADOS = ['passou', 'falhou', 'bloqueado'];
const carimbo = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19)
    .replace(/[-:]/g, '')
    .replace('T', '-');
// Ordem do plano; os pedidos em ↻ Refazer vão para o fim, na ordem em que foram pedidos (não interrompem nem furam a fila).
const fila = (r) =>
  r.cenarios
    .filter((c) => !c.arquivado && ['pendente', 'desatualizado'].includes(c.status))
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        (a.c.refazerEm ? 1 : 0) - (b.c.refazerEm ? 1 : 0) ||
        (a.c.refazerEm || '').localeCompare(b.c.refazerEm || '') ||
        a.i - b.i
    )
    .map((x) => x.c);
function iniciarCenario(dir, id, sha) {
  const r = cenarios(dir),
    c = r.cenarios.find((x) => x.id === id);
  const ex = {
    id: carimbo(),
    inicio: new Date().toISOString(),
    status: 'executando',
    sha: sha || null,
    evidencias: path.join('evidencias', id)
  };
  ex.evidencias = path.join(ex.evidencias, ex.id);
  fs.mkdirSync(path.join(dir, ex.evidencias), { recursive: true });
  c.statusAntes = c.status;
  c.status = 'executando';
  delete c.refazerEm;
  (c.execucoes ||= []).push(ex);
  gravarJson(path.join(dir, CENARIOS), r);
  return ex;
}
// status: passou | falhou | bloqueado | descartado (pausa no meio: a execução fica no histórico e o cenário volta para a fila) |
// sem-massa (a massa da Etapa 4 não serve: o cenário volta para a fila e a extensão refaz a Etapa 4 antes de tentar de novo; não é falha).
const VOLTAM = ['descartado', 'sem-massa'];
function concluirCenario(dir, id, status, nota = '') {
  const r = cenarios(dir),
    c = r.cenarios.find((x) => x.id === id),
    ex = c?.execucoes?.at(-1);
  if (!c || c.status !== 'executando' || !ex) throw new Error(`${id} não está em execução`);
  if (![...RESULTADOS, ...VOLTAM].includes(status))
    throw new Error(`status inválido: ${status} (use ${[...RESULTADOS, 'sem-massa'].join(', ')})`);
  if (status === 'passou') {
    const falta = faltaEvidencia(dir, c, ex);
    if (falta) throw new Error(falta);
  }
  Object.assign(ex, { status, nota, fim: new Date().toISOString() });
  c.status = VOLTAM.includes(status) ? c.statusAntes || 'pendente' : status;
  delete c.statusAntes;
  gravarJson(path.join(dir, CENARIOS), r);
}
// Cenário que ficou sem massa válida mesmo depois de refazer a Etapa 4: bloqueado, com a nota dizendo por quê (a execução já está fechada como sem-massa).
function bloquearSemMassa(dir, id, nota) {
  const r = cenarios(dir),
    c = r.cenarios.find((x) => x.id === id),
    ex = c?.execucoes?.at(-1);
  if (!c || !ex) return;
  c.status = 'bloqueado';
  Object.assign(ex, { status: 'bloqueado', nota });
  gravarJson(path.join(dir, CENARIOS), r);
}

module.exports = { RESULTADOS, VOLTAM, carimbo, fila, iniciarCenario, concluirCenario, bloquearSemMassa };
