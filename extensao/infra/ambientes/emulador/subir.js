// @ts-check
// Sobe o ambiente emulador pelos Comandos das Configurações, idempotente (o que já está de pé segue):
// liga o AVD (sem esperar) → API → Metro → espera o boot → adb reverse → app (Comando Start, se houver e ctx.rodarStart !== false).
// Uniu janelas/qa/etapas/03-ambiente/subetapas/comandos.js e janelas/incidentes/etapas/05-reproducao/subetapas/5.3-ambiente.js.
// Devolve o ambiente pronto ou { parou_em, erro, falta? } (falta 'comandos' | 'app': o QA completa pelo script da skill).
// ctx: { comandos, parar?, backend?, avd?, adb?, emulador?: { aparelhos(), ligar(), pronto?() }, portaAberta?, esperar?, metroStatus?,
//        appInstalado?() → bool, rodarStart? } (os testes injetam emulador, portaAberta, esperar, metroStatus e appInstalado).
const avd = require('./avd');
const { appDe, ligado, reverse } = require('../android/adb');
const { PAPEIS } = require('../aplicacao/papeis');
const { acharComandos } = require('../aplicacao/comandos');
const { subirPapel, esperaDe } = require('../aplicacao/subir-papel');
const { shaDe } = require('../aplicacao/sha');
const { subirApiMetro } = require('../android/subir-app');

const BOOT = 300;

function depsEmulador(ctx) {
  const e = ctx.emulador || {},
    aparelhos = e.aparelhos || avd.dispositivos;
  // o primeiro emulador (aparelhos injetados nos testes: o primeiro da lista)
  const serial = async () => {
    const l = await aparelhos();
    return (l.find((a) => /^emulator-/.test(a.serial)) || (e.aparelhos ? l[0] : null))?.serial || '';
  };
  return {
    aparelhos,
    serial,
    ligar: e.ligar || (() => avd.ligar(ctx.avd)),
    pronto: e.pronto || (async () => ligado(ctx.adb, await serial()))
  };
}

async function subir(dir, ctx, vivo) {
  const c = acharComandos(ctx, vivo, ['api', 'metro'], ['start']);
  if (!('achou' in c)) return c;
  const { achou } = c,
    terminais = [achou.api.nome, achou.metro.nome],
    parou = (f) => ({ ...f, fonte: 'comandos', terminais });
  const emu = depsEmulador(ctx);
  if (!(await emu.aparelhos()).length) {
    vivo('acao', `Ligando o emulador ${ctx.avd || ''}`.trim());
    emu.ligar();
  } else vivo('acao', 'Emulador já ligado');
  const f = await subirApiMetro(achou, ctx, vivo);
  if (f) return parou(f);
  if (!(await esperaDe(ctx)(async () => (await emu.aparelhos()).length > 0 && (await emu.pronto()), BOOT))) {
    const erro = 'O emulador não terminou de ligar em 5 min';
    if (!ctx.parar?.()) vivo('erro', erro);
    return parou({ parou_em: 'emulador', erro });
  }
  const serial = await emu.serial();
  if (ctx.adb) reverse(ctx.adb, serial, [PAPEIS.api.porta, PAPEIS.metro.porta]);
  const instalado = ctx.appInstalado || (() => appDe(ctx.adb, serial));
  let app = await instalado();
  if (!app && achou.start && ctx.rodarStart !== false) {
    const g = await subirPapel('start', achou.start, ctx, vivo, { pronto: async () => !!(await instalado()) });
    if (g) return parou(g);
    app = await instalado();
  }
  if (!app) {
    const erro = 'App do WMS não instalado no emulador';
    vivo('aviso', erro);
    return parou({ parou_em: 'app', falta: 'app', erro });
  }
  vivo('acao', `Emulador pronto${typeof app === 'string' ? ` com o app ${app}` : ''}`);
  const backend = achou.api.pasta || ctx.backend,
    mobile = achou.metro.pasta || null;
  return {
    nome: 'emulador',
    fonte: 'comandos',
    terminais,
    app: typeof app === 'string' ? app : null,
    serial,
    parou_em: null,
    itens: [],
    backend,
    mobile,
    sha: { backend: shaDe(backend), mobile: shaDe(mobile) }
  };
}

module.exports = { subir, depsEmulador };
