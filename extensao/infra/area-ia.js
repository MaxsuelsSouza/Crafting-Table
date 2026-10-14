// @ts-check
const os = require('os');
const path = require('path');

// Área de escrita da IA em segundo plano. O Claude Code trata tudo dentro de ~/.claude como sensível e nega Write/Edit lá
// no claude -p (nem regra de allow libera). Por isso a IA grava aqui, em ~/.cache/crafting-table/ia/<pasta>, e a extensão
// copia o resultado para a pasta do ticket. Ler de ~/.claude continua liberado.
const RAIZ = path.join(os.homedir(), '.cache', 'crafting-table');

/** Pasta espelho de `dir` (pasta do ticket/aba) onde a IA pode escrever. */
const areaIA = (dir) => path.join(RAIZ, 'ia', path.relative(path.join(os.homedir(), '.claude'), path.resolve(dir)).replace(/^(\.\.[/\\])+/, '').replace(/[^\w.-]+/g, '_'));

module.exports = { RAIZ, areaIA };
