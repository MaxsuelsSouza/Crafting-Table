// @ts-check
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Decisão do usuário no QA -> aba Decisões (mesmo .decisoes.json do Ao vivo). extra: { ticket, motivo, ... } vai em detalhes. Falha não derruba o fluxo.
function registrarDecisao(dir, texto, extra = {}) {
  try {
    const arq = path.join(dir, '.decisoes.json');
    let lista = [];
    try {
      lista = JSON.parse(fs.readFileSync(arq, 'utf8'));
    } catch {}
    if (!Array.isArray(lista)) lista = [];
    const { ticket, ...resto } = extra || {};
    lista.push({
      id: crypto.randomBytes(6).toString('hex'),
      data: new Date().toISOString(),
      origem: 'usuario',
      titulo: String(texto).slice(0, 90),
      resumo: `${ticket ? `${ticket} · ` : ''}${texto}`,
      detalhes: { ticket: ticket || '', ...resto }
    });
    fs.writeFileSync(`${arq}.tmp`, JSON.stringify(lista, null, 1));
    fs.renameSync(`${arq}.tmp`, arq);
  } catch {}
}

module.exports = { registrarDecisao };
