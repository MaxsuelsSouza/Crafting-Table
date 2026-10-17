// @ts-check
// Validação de um flow do Maestro antes de rodar (validarFlow do contrato). Movido de janelas/qa/etapas/06-execucao/regras/roteiro.js.
// Flow e seus subflows (BFS): existe, name: sem " < > : | ? * e env: do cabeçalho sem chave que o runner passa por -e.
const fs = require('fs');
const path = require('path');

// Cabeçalho do flow (antes do 1º ---): chaves de env: e o name:.
function cabecalho(texto) {
  const topo = texto.split(/^---\s*$/m)[0];
  const env = topo.match(/^env:\s*\n((?:[ \t]+.*\n?)+)/m)?.[1] || '';
  return {
    env: [...env.matchAll(/^[ \t]+(\w+)\s*:/gm)].map((m) => m[1]),
    nome:
      topo
        .match(/^name:\s*(.+)$/m)?.[1]
        .trim()
        .replace(/^["']|["']$/g, '') || ''
  };
}
const SUBFLOW = /^\s*(?:-\s*)?(?:runFlow:\s*|file:\s*)([\w./-]+\.ya?ml)\s*$/gm;

/** @returns {string[]} erros (vazio = pode rodar) */
function errosDoFlow(arquivo, envPassado) {
  const erros = [],
    vistos = new Set(),
    fila = [arquivo];
  while (fila.length) {
    const f = fila.shift();
    if (vistos.has(f)) continue;
    vistos.add(f);
    let tx;
    try {
      tx = fs.readFileSync(f, 'utf8');
    } catch {
      erros.push(`flow não encontrado: ${f}`);
      continue;
    }
    const cab = cabecalho(tx);
    if (/["<>:|?*]/.test(cab.nome))
      erros.push(`${path.basename(f)}: name "${cab.nome}" tem " < > : | ? * (quebra no Windows)`);
    if (f === arquivo) {
      const choque = cab.env.filter((k) => k in envPassado);
      if (choque.length)
        erros.push(
          `${path.basename(f)}: env: do cabeçalho repete ${choque.join(', ')} (vence o -e no Maestro): tire do cabeçalho`
        );
    }
    for (const m of tx.matchAll(SUBFLOW)) fila.push(path.resolve(path.dirname(f), m[1]));
  }
  return erros;
}

module.exports = { cabecalho, errosDoFlow };
