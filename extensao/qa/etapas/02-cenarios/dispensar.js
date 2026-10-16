// @ts-check
const path = require('path');
const { gravarJson } = require('../../estado');
const { cenarios, CENARIOS } = require('./mapa');

// Não executado por decisão do usuário (Pedir ajuste / Excluir): sai da fila e não conta como pendente; guarda motivo, data e o tipo. ↻ Refazer devolve.
function dispensar(dir, id, motivo, tipo = 'excluir') {
  const r = cenarios(dir),
    c = r.cenarios.find((x) => x.id === id && !x.arquivado);
  if (!c || c.status === 'executando' || !String(motivo || '').trim()) return false;
  if (c.status !== 'dispensado') c.statusAntes = c.status;
  Object.assign(c, {
    status: 'dispensado',
    dispensa: { tipo, motivo: String(motivo).trim(), em: new Date().toISOString() }
  });
  gravarJson(path.join(dir, CENARIOS), r);
  return true;
}

module.exports = { dispensar };
