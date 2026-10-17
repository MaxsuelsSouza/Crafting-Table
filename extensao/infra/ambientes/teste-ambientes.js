// @ts-check
// node infra/ambientes/teste-ambientes.js — o registro de ambientes sem aparelho: contrato, escolha, papéis, validação de flow/spec,
// config do Playwright (jornada e MCP), coleta de provas e o subir de cada ambiente com Comandos, portas e adb falsos.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ambientes = require('.');
const { papeisDe } = require('./aplicacao/papeis');
const { portaDaUrl } = require('./aplicacao/portas');
const { saude } = require('./aplicacao/saude');
const { errosDoFlow } = require('./android/flow');
const { configPlaywright } = require('./web/playwright');
const { juntarMcp } = require('../agentes/maestro/mcp');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ambientes-'));

// ── Contrato: todo ambiente registrado tem as chaves e os tipos
const FUNCOES = ['requisitos', 'subir', 'saude', 'validarFlow', 'texto', 'guia', 'comoPrint'];
for (const a of ambientes.lista()) {
  assert.strictEqual(typeof a.nome, 'string', a.nome);
  assert.ok(ambientes.NOMES.includes(a.nome) && a.rotulo && ['android', 'web'].includes(a.plataforma), a.nome);
  assert.ok(Array.isArray(a.papeis) && a.papeis.includes('api'), `${a.nome}: papeis`);
  for (const f of FUNCOES) assert.strictEqual(typeof a[f], 'function', `${a.nome}.${f}`);
  assert.strictEqual(typeof a.etapas?.flow, 'function', `${a.nome}.etapas.flow`);
  for (const f of ['gravar', 'parar', 'arquivos']) assert.strictEqual(typeof a.evidencia?.[f], 'function', `${a.nome}.evidencia.${f}`);
  assert.ok(Array.isArray(a.ferramentas) && a.ferramentas.length, `${a.nome}.ferramentas`);
  for (const f of ['mcp', 'derrubar', 'ligado']) assert.ok(a[f] === undefined || typeof a[f] === 'function', `${a.nome}.${f}`);
  assert.ok(Array.isArray(a.requisitos({})), `${a.nome}.requisitos`);
  assert.ok(a.texto({}).includes('5111') && a.guia().length > 20, `${a.nome}: texto/guia`);
}
assert.strictEqual(typeof ambientes.obter('emulador').etapas.bipe, 'function');
assert.strictEqual(ambientes.obter('web').etapas.bipe, undefined); // navegador não bipa
assert.strictEqual(ambientes.obter().nome, 'emulador');
assert.throws(() => ambientes.obter('ios'), /desconhecido/);
assert.strictEqual(
  ambientes.obter('emulador').texto({}),
  'API http://localhost:5111 · Metro 8081 · emulador ligado' // o trecho que era fixo nos prompts
);
assert.ok(ambientes.obter('aparelho').texto({ serial: 'ZB1' }).includes('aparelho ZB1'));
assert.ok(ambientes.obter('web').texto({ url: 'http://localhost:3000' }).includes('front http://localhost:3000'));
assert.ok(ambientes.obter('aparelho').requisitos({}).some((r) => /aparelhoSerial/.test(r)));

// ── Escolha: estado → camada dos repositórios (só uma decide) → padrão → emulador
const esc = ambientes.escolher;
assert.strictEqual(esc({ ambiente: 'aparelho', repos: [{ camada: 'web' }] }), 'aparelho');
assert.strictEqual(esc({ repos: [{ camada: 'backend' }, { camada: 'web' }] }), 'web');
assert.strictEqual(esc({ repos: [{ camada: 'mobile' }] }), 'emulador');
assert.strictEqual(esc({ repos: [{ camada: 'mobile' }, { camada: 'web' }], padrao: 'web' }), 'web');
assert.strictEqual(esc({ ambiente: 'xx', padrao: 'yy' }), 'emulador');

// ── Papéis: Start não é Metro; web pelo nome ou pelo rspack
const cmds = [
  { nome: 'API - Staging', comando: 'dotnet run --project FCxLabs.WMS.Api' },
  { nome: 'Start', comando: 'yarn start' },
  { nome: 'Metro', comando: 'yarn metro' },
  { nome: 'Portal', comando: 'npx rspack serve --port 9009' }
];
const p = papeisDe(cmds, ['api', 'metro', 'start', 'web']);
assert.deepStrictEqual(
  [p.api.nome, p.metro.nome, p.start.nome, p.web.nome],
  ['API - Staging', 'Metro', 'Start', 'Portal']
);
assert.deepStrictEqual(Object.keys(papeisDe(cmds)), ['api', 'metro']); // padrão do QA
assert.deepStrictEqual([portaDaUrl('http://localhost:9009/x'), portaDaUrl('https://h')], [9009, 443]);

// ── validarFlow: Maestro (cabeçalho e subflows) e spec do Playwright
fs.writeFileSync(path.join(tmp, 'a.yaml'), 'appId: x\nname: "a: b"\nenv:\n  MATRICULA: 1\n---\n- runFlow: sub.yaml\n');
const ef = errosDoFlow(path.join(tmp, 'a.yaml'), { MATRICULA: '1' });
assert.ok(ef.some((e) => /quebra no Windows/.test(e)) && ef.some((e) => /repete MATRICULA/.test(e)), ef.join());
assert.ok(ef.some((e) => /flow não encontrado: .*sub\.yaml/.test(e)));
const web = ambientes.obter('web');
fs.writeFileSync(path.join(tmp, 'ok.spec.ts'), "import { test, expect } from '@playwright/test';\ntest('x', async () => {});\n");
fs.writeFileSync(path.join(tmp, 'ruim.ts'), "test.only('x', async () => {});\n");
assert.deepStrictEqual(web.validarFlow(path.join(tmp, 'ok.spec.ts')), []);
const er = web.validarFlow(path.join(tmp, 'ruim.ts'));
assert.ok(er.length === 3 && er.some((e) => /test\.only/.test(e)), er.join());
assert.ok(/não encontrado/.test(web.validarFlow(path.join(tmp, 'nada.spec.ts'))[0]));

// ── Playwright: a jornada grava vídeo e print de todo teste; o MCP da IA também (vídeo e saída na pasta de evidências)
const cfg = configPlaywright({ spec: '/s/x.spec.ts', saida: '/o', junit: '/o/j.xml', url: 'http://localhost:9009' });
assert.ok(/"video": "on"/.test(cfg) && /"screenshot": "on"/.test(cfg) && /"trace": "retain-on-failure"/.test(cfg) && /"outputFile": "\/o\/j.xml"/.test(cfg));
const ev = path.join(tmp, 'evid');
const m = web.mcp(ev);
const srv = m.mcpServers.playwright,
  arqCfg = srv.args[srv.args.indexOf('--config') + 1];
assert.ok(srv.command === 'npx' && srv.args.includes('@playwright/mcp@latest'));
const conf = JSON.parse(fs.readFileSync(arqCfg, 'utf8'));
assert.deepStrictEqual(
  [conf.outputDir, conf.browser.contextOptions.recordVideo.dir, conf.capabilities],
  [ev, ev, ['devtools']]
);
assert.deepStrictEqual(web.ferramentas, ['mcp__playwright__*']);
// um --mcp-config só, junto com o do SQLcl
const ex = juntarMcp(['--mcp-config', JSON.stringify({ mcpServers: { sqlcl: { command: 'sql' } } }), '--x'], m);
assert.deepStrictEqual(Object.keys(JSON.parse(ex[1]).mcpServers), ['sqlcl', 'playwright']);
assert.deepStrictEqual(ex.filter((x) => x === '--mcp-config').length, 1);
assert.deepStrictEqual(juntarMcp(['--a'], null), ['--a']);

// ── Provas: Android coleta os PNGs do Maestro; web, PNG e vídeo .webm
fs.mkdirSync(path.join(tmp, 'p', 'sub'), { recursive: true });
for (const f of ['a.png', 'sub/b.png', 'sub/v.webm', 'x.txt']) fs.writeFileSync(path.join(tmp, 'p', f), '');
const nomes = (l) => l.map((f) => path.basename(f)).sort();
assert.deepStrictEqual(nomes(ambientes.obter('emulador').evidencia.arquivos(path.join(tmp, 'p'))), ['a.png', 'b.png']);
assert.deepStrictEqual(nomes(web.evidencia.arquivos(path.join(tmp, 'p'))), ['a.png', 'b.png', 'v.webm']);

(async () => {
  // ── subir com Comandos, portas e aparelho falsos
  const log = [],
    vivo = (tipo, texto) => log.push(`${tipo}:${texto}`);
  const base = (abertas, extra = {}) => ({
    comandos: { lista: () => cmds, rodar: (n) => (log.push(`cmd:${n}`), abertas.add(n)) },
    esperar: async (t) => t(),
    portaAberta: async (n) => abertas.has(n === 5111 ? 'API - Staging' : n === 8081 ? 'Metro' : 'Portal'),
    metroStatus: async () => true,
    adb: '/bin/false',
    ...extra
  });
  // emulador: liga o AVD, sobe API e Metro, roda o Start só porque o app falta; idempotente na 2ª vez
  let ligado = false;
  const emu = (abertas, app) =>
    base(abertas, {
      emulador: { aparelhos: async () => (ligado ? [{ serial: 'emulator-5554' }] : []), ligar: () => (log.push('ligar'), (ligado = true)), pronto: async () => true },
      appInstalado: async () => app.ok
    });
  const abertas = new Set(),
    app = { ok: false };
  const em = ambientes.obter('emulador');
  const orig = emu(abertas, app);
  orig.comandos.rodar = (n) => (log.push(`cmd:${n}`), abertas.add(n), n === 'Start' && (app.ok = true));
  let r = await em.subir(tmp, orig, vivo);
  assert.deepStrictEqual(log.filter((x) => /^(cmd|ligar)/.test(x)), ['ligar', 'cmd:API - Staging', 'cmd:Metro', 'cmd:Start']);
  assert.deepStrictEqual([r.nome, r.parou_em, r.serial, r.terminais], ['emulador', null, 'emulator-5554', ['API - Staging', 'Metro']]);
  assert.ok('sha' in r);
  log.length = 0;
  r = await em.subir(tmp, orig, vivo);
  assert.deepStrictEqual(log.filter((x) => /^(cmd|ligar)/.test(x)), []); // tudo de pé: nada roda de novo
  // sem Start (QA: rodarStart false) e sem app: falta 'app' (o QA completa pelo script da skill)
  app.ok = false;
  r = await em.subir(tmp, { ...emu(abertas, app), rodarStart: false }, vivo);
  assert.deepStrictEqual([r.parou_em, r.falta], ['app', 'app']);
  // sem Comando de Metro: falta 'comandos'
  r = await em.subir(tmp, { ...emu(abertas, app), comandos: { lista: () => [cmds[0]], rodar() {} } }, vivo);
  assert.deepStrictEqual([r.parou_em, r.falta], ['comandos', 'comandos']);
  // API não sobe: para na api com o terminal no erro
  r = await em.subir(tmp, { ...emu(new Set(), app), comandos: { lista: () => cmds, rodar() {} }, esperar: async () => false }, vivo);
  assert.ok(r.parou_em === 'api' && /API - Staging/.test(r.erro), JSON.stringify(r));

  // aparelho: serial obrigatório, conectado e autorizado, app instalado; sem boot de AVD
  const ap = ambientes.obter('aparelho');
  const env = process.env.WMS_ADB_SERIAL;
  delete process.env.WMS_ADB_SERIAL;
  r = await ap.subir(tmp, base(new Set()), vivo);
  assert.strictEqual(r.parou_em, 'config');
  r = await ap.subir(tmp, { ...base(new Set()), serial: 'ZB1', aparelhos: async () => [{ serial: 'ZB1', estado: 'unauthorized' }] }, vivo);
  assert.ok(r.parou_em === 'aparelho' && /autorize/.test(r.erro));
  r = await ap.subir(tmp, { ...base(new Set()), serial: 'ZB1', aparelhos: async () => [] }, vivo);
  assert.ok(r.parou_em === 'aparelho' && /não está conectado/.test(r.erro));
  const okAp = { ...base(new Set()), serial: 'ZB1', aparelhos: async () => [{ serial: 'ZB1', estado: 'device' }] };
  r = await ap.subir(tmp, { ...okAp, appInstalado: async () => null }, vivo);
  assert.ok(r.parou_em === 'app' && /instale o APK/.test(r.erro));
  log.length = 0;
  r = await ap.subir(tmp, { ...okAp, appInstalado: async () => 'br.com.ferreiracosta.wms' }, vivo);
  assert.deepStrictEqual([r.nome, r.serial, r.app, r.parou_em], ['aparelho', 'ZB1', 'br.com.ferreiracosta.wms', null]);
  assert.ok(!log.includes('ligar'));
  if (env !== undefined) process.env.WMS_ADB_SERIAL = env;

  // web: API e front ao mesmo tempo, URL da configuração
  log.length = 0;
  r = await web.subir(tmp, { ...base(new Set()), webUrl: 'http://localhost:9009' }, vivo);
  assert.deepStrictEqual(log.filter((x) => /^cmd/.test(x)), ['cmd:API - Staging', 'cmd:Portal']);
  assert.deepStrictEqual([r.nome, r.url, r.parou_em, r.terminais], ['web', 'http://localhost:9009', null, ['API - Staging', 'Portal']]);
  r = await web.subir(tmp, { ...base(new Set()), comandos: { lista: () => cmds.slice(0, 3), rodar() {} } }, vivo);
  assert.ok(r.parou_em === 'comandos' && /Web/.test(r.erro));

  // saúde: porta fechada responde com o papel e a porta
  const s = await saude(['web'], { web: 1 });
  assert.deepStrictEqual(s, { ok: false, motivo: 'Web não responde na porta 1' });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('ok ambientes');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
