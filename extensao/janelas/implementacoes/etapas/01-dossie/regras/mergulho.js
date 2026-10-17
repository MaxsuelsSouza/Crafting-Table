// @ts-check
// O Mergulho (Incidentes) já reproduziu o problema? incidentes/reproducao.json com ok:true → a Implementação não reproduz de novo.
const fs = require('fs');
const path = require('path');
const tickets = require('../../../../../infra/ticket/tickets');

/** @returns {{ acao: string, quando: string | null } | null} */
const mergulhoReproduziu = (t) => {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(tickets.pasta(t.chave, 'incidentes'), 'reproducao.json'), 'utf8'));
    return j?.ok === true ? { acao: String(j.acao || ''), quando: j.quando || null } : null;
  } catch {
    return null;
  }
};

module.exports = { mergulhoReproduziu };
