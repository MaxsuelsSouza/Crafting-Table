// @ts-check
// Validação de um spec do Playwright antes de rodar (validarFlow do web): existe, é .spec.ts/js, usa o @playwright/test,
// tem test(...) e não tem test.only (que esconderia os outros testes). Devolve a lista de erros (vazia = pode rodar).
const fs = require('fs');
const path = require('path');

function errosDoSpec(arquivo) {
  let tx;
  try {
    tx = fs.readFileSync(arquivo, 'utf8');
  } catch {
    return [`spec não encontrado: ${arquivo}`];
  }
  const nome = path.basename(arquivo),
    erros = [];
  if (!/\.spec\.[cm]?[jt]s$/.test(nome)) erros.push(`${nome}: o arquivo precisa terminar em .spec.ts (ou .spec.js)`);
  if (!/@playwright\/test/.test(tx)) erros.push(`${nome}: importe test e expect de '@playwright/test'`);
  if (!/\btest(\.\w+)?\s*\(/.test(tx)) erros.push(`${nome}: nenhum test(...)`);
  if (/\btest\.only\s*\(/.test(tx)) erros.push(`${nome}: tire o test.only`);
  return erros;
}

module.exports = { errosDoSpec };
