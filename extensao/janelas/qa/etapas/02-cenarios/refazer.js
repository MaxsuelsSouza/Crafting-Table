// @ts-check
const fs = require('fs');
const path = require('path');
const { gravarJson, estado, mudar } = require('../../estado');
const { cenarios, CENARIOS } = require('./mapa');

// ↻ Refazer: volta para pendente (o histórico fica); a execução (fase 5) pega os pendentes na ordem do plano.
function refazer(dir, id) {
  const r = cenarios(dir),
    c = r.cenarios.find((x) => x.id === id && !x.arquivado);
  if (!c || c.status === 'executando') return false;
  c.status = 'pendente';
  delete c.dispensa;
  c.refazerEm = new Date().toISOString(); // vai para o fim da fila (depois dos que ainda não rodaram)
  fs.rmSync(path.join(dir, 'evidencias', c.id), { recursive: true, force: true }); // só as evidências novas ficam; o histórico (status, notas) permanece
  gravarJson(path.join(dir, CENARIOS), r);
  return true;
}

// ↻ Refazer (lote): os cenários que falharam ou ficaram bloqueados viram uma fila de perguntas (3 opções + outra resposta). Cada resposta
// devolve o cenário para a fila com a instrução do humano (c.instrucao), que o prompt de execução cita. Estado: .qa.json → refazerLote { ids, idx }.
const PARA_REFAZER = ['falhou', 'bloqueado'];
const opcoesRefazer = (c) => [
  'Refazer do jeito que está',
  'Refazer com massa nova (levantar de novo)',
  c.status === 'bloqueado'
    ? 'Refazer seguindo outro caminho na tela (descreva o bloqueio ao responder)'
    : 'Refazer conferindo com mais cuidado o resultado esperado'
];
const loteRefazer = (dir) => {
  const l = estado(dir).refazerLote;
  if (!l?.ids?.length) return null;
  const r = cenarios(dir),
    c = r.cenarios.find((x) => x.id === l.ids[l.idx || 0]);
  return c ? { ...l, idx: l.idx || 0, cenario: c, opcoes: opcoesRefazer(c) } : null;
};
function iniciarRefazerLote(dir) {
  const ids = cenarios(dir)
    .cenarios.filter((c) => !c.arquivado && PARA_REFAZER.includes(c.status))
    .map((c) => c.id);
  if (!ids.length || estado(dir).execucao === 'rodando') return 0;
  mudar(dir, { refazerLote: { ids, idx: 0 } });
  return ids.length;
}
// Responde o cenário atual: instrução = texto da opção ou texto livre. Devolve { fim } quando era o último.
function responderRefazer(dir, instrucao) {
  const l = loteRefazer(dir),
    t = String(instrucao || '').trim();
  if (!l || !t) return null;
  const r = cenarios(dir),
    c = r.cenarios.find((x) => x.id === l.cenario.id);
  c.instrucao = t;
  gravarJson(path.join(dir, CENARIOS), r);
  refazer(dir, c.id);
  const fim = l.idx + 1 >= l.ids.length;
  mudar(dir, { refazerLote: fim ? null : { ids: l.ids, idx: l.idx + 1 } });
  return { fim, id: c.id };
}
const cancelarRefazerLote = (dir) => mudar(dir, { refazerLote: null });

module.exports = {
  refazer,
  PARA_REFAZER,
  opcoesRefazer,
  loteRefazer,
  iniciarRefazerLote,
  responderRefazer,
  cancelarRefazerLote
};
