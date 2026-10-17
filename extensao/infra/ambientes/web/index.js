// @ts-check
// Ambiente web: API (5111) + front (craftingTable.webUrl, padrão http://localhost:9009) pelos Comandos; a jornada roda specs do
// Playwright (vídeo e print de todo teste) e a IA dirige o navegador pelo Playwright MCP, também com vídeo e prints (mcp.js).
//   subir.js       API e front pelos Comandos
//   playwright.js  etapa flow: npx playwright test com config gerada
//   validar.js     validarFlow do .spec.ts
//   mcp.js         --mcp-config do Playwright MCP com gravação na pasta de evidências
// Contrato: infra/ambientes/index.js. Sem bipe (não há coletor no navegador).
const { subir, URL_PADRAO } = require('./subir');
const { flow } = require('./playwright');
const { errosDoSpec } = require('./validar');
const { mcp, FERRAMENTAS } = require('./mcp');
const { arquivos } = require('../aplicacao/arquivos');
const { noPath } = require('../aplicacao/rodar');
const { PAPEIS } = require('../aplicacao/papeis');
const { saude } = require('../aplicacao/saude');
const { portaDaUrl } = require('../aplicacao/portas');

module.exports = {
  nome: 'web',
  rotulo: 'navegador',
  plataforma: 'web',
  papeis: ['api', 'web'],
  requisitos: (ctx = {}) => {
    const r = noPath('npx') ? [] : ['npx (Node.js) não encontrado no PATH'];
    try {
      portaDaUrl(ctx.webUrl || URL_PADRAO);
    } catch {
      r.push(`craftingTable.webUrl inválida: ${ctx.webUrl}`);
    }
    return r;
  },
  subir,
  saude: (amb = {}) => saude(['api', 'web'], { web: portaDaUrl(amb.url || URL_PADRAO) }),
  etapas: { flow },
  validarFlow: (arquivo) => errosDoSpec(arquivo),
  // o vídeo e os prints saem do próprio Playwright (config da jornada e do MCP): gravar/parar não têm o que fazer
  evidencia: { gravar() {}, parar() {}, arquivos: (pasta) => arquivos(pasta, /\.(png|webm)$/i) },
  ferramentas: FERRAMENTAS,
  mcp,
  texto: (amb = {}) => `API http://localhost:${PAPEIS.api.porta} · front ${amb.url || URL_PADRAO}`,
  guia: () =>
    'Pode abrir o front pelo Playwright MCP (browser_navigate, browser_snapshot) para achar seletores; a sessão é gravada em vídeo e cada estado ' +
    'que importa vira print (browser_take_screenshot sem filename, que vai para a pasta de evidências, ou com caminho absoluto); ' +
    'ao terminar, browser_close (fecha o navegador e salva o vídeo)',
  comoPrint: (arquivo) => `browser_take_screenshot com filename "${arquivo}"`
};
