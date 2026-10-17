// @ts-check
// Etapa flow no web: `npx playwright test` de um .spec.ts com config gerada na pasta da execução (vídeo e print de todo teste,
// trace quando falha, junit). Roda no repositório do front (ctx.web), que tem o @playwright/test; sem ele, na pasta do spec.
const fs = require('fs');
const path = require('path');
const { rodar } = require('../aplicacao/rodar');

/** Config do Playwright (CommonJS, sem require: não depende de onde o @playwright/test está). */
const configPlaywright = ({ spec, saida, junit, url }) =>
  `// gerado pela Crafting Table (infra/ambientes/web/playwright.js)\nmodule.exports = ${JSON.stringify(
    {
      testDir: path.dirname(spec),
      outputDir: path.join(saida, 'resultados'),
      workers: 1,
      retries: 0,
      timeout: 120000,
      reporter: [['list'], ['junit', { outputFile: junit }]],
      use: { baseURL: url, headless: true, video: 'on', screenshot: 'on', trace: 'retain-on-failure' }
    },
    null,
    2
  )};\n`;

/** @returns {Promise<{ rc: number, saida: string }>} ctx: { url?, web? (repo do front) } */
async function flow(arquivo, env, { junit, saidaTeste }, ctx = {}) {
  const saida = saidaTeste || path.join(path.dirname(junit), 'playwright');
  fs.mkdirSync(saida, { recursive: true });
  const cfg = path.join(saida, 'playwright.config.js');
  fs.writeFileSync(cfg, configPlaywright({ spec: arquivo, saida, junit, url: ctx.url || 'http://localhost:9009' }));
  const nm = ctx.web ? path.join(ctx.web, 'node_modules') : '';
  return rodar('npx', ['playwright', 'test', '--config', cfg, path.basename(arquivo)], {
    cwd: ctx.web || path.dirname(arquivo),
    env: { ...env, ...(ctx.url ? { BASE_URL: ctx.url } : {}), ...(nm ? { NODE_PATH: nm } : {}) }
  });
}

module.exports = { flow, configPlaywright };
