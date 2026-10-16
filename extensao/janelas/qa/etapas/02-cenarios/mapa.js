// @ts-check
const path = require('path');
const { lerJson, gravarJson } = require('../../estado');
const { cenariosDo } = require('./regras/parser');

// ── Mapa de cenários (.cenarios.json): um item por CT do plano, com status e histórico de execuções.
// Plano novo: texto mudou → desatualizado (se já rodou) ; CT novo → pendente ; CT que saiu → arquivado (mantém o histórico).
const CENARIOS = '.cenarios.json';
const cenarios = (dir) => lerJson(path.join(dir, CENARIOS), { planoVersao: 0, cenarios: [] });
function sincronizar(dir, md, versao) {
  const atual = cenarios(dir),
    novos = cenariosDo(md),
    velhos = new Map(atual.cenarios.map((c) => [c.id, c]));
  const lista = novos.map((n) => {
    const c = velhos.get(n.id);
    if (!c) return { ...n, status: 'pendente', execucoes: [] };
    const mudou = c.hash !== n.hash,
      rodou = (c.execucoes || []).length > 0;
    return {
      ...c,
      ...n,
      arquivado: false,
      status: mudou && rodou ? 'desatualizado' : c.arquivado ? 'pendente' : c.status
    };
  });
  for (const c of atual.cenarios) if (!novos.some((n) => n.id === c.id)) lista.push({ ...c, arquivado: true });
  const r = { planoVersao: versao, cenarios: lista };
  gravarJson(path.join(dir, CENARIOS), r);
  return {
    total: novos.length,
    novos: novos.filter((n) => !velhos.has(n.id)).length,
    mudaram: lista.filter((c) => !c.arquivado && velhos.has(c.id) && velhos.get(c.id).hash !== c.hash).length,
    sairam: lista.filter((c) => c.arquivado && !velhos.get(c.id)?.arquivado).length
  };
}

module.exports = { CENARIOS, cenarios, sincronizar };
