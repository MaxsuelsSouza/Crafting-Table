// @ts-check
// O Playwright MCP na sessão da IA (claude -p) com prova: vídeo de toda a sessão (recordVideo do contexto, salvo quando o navegador
// fecha) e os prints/vídeos que a IA pede (browser_take_screenshot, browser_start_video/stop_video com --caps devtools) na pasta
// de evidências (na raiz dela: a reprodução de Incidentes lê só o primeiro nível). Conferido rodando o servidor: o .webm sai no
// browser_close e também quando o processo é encerrado; print com filename relativo vai para o cwd (por isso: sem filename ou
// absoluto). A config vai num arquivo (o recordVideo não tem flag de linha de comando; conferido no @playwright/mcp 0.0.83).
// Devolve o objeto do --mcp-config (infra/agentes/maestro: opção mcp).
const fs = require('fs');
const path = require('path');

const SERVIDOR = 'playwright';
const FERRAMENTAS = [`mcp__${SERVIDOR}__*`];

/** @param {string} dirEvidencias */
function mcp(dirEvidencias) {
  fs.mkdirSync(dirEvidencias, { recursive: true });
  const config = {
    browser: {
      isolated: true,
      launchOptions: { headless: true },
      contextOptions: { viewport: { width: 1366, height: 768 }, recordVideo: { dir: dirEvidencias, size: { width: 1366, height: 768 } } }
    },
    capabilities: ['devtools'],
    outputDir: dirEvidencias
  };
  const arq = path.join(dirEvidencias, '.playwright-mcp.json');
  fs.writeFileSync(arq, JSON.stringify(config, null, 2));
  return { mcpServers: { [SERVIDOR]: { command: 'npx', args: ['-y', '@playwright/mcp@latest', '--config', arq] } } };
}

module.exports = { mcp, SERVIDOR, FERRAMENTAS };
