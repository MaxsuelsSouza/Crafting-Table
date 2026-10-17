// @ts-check
// adb do Android SDK (emulador e aparelho físico): binário, execução, o aparelho da vez (serial) e o app do WMS instalado.
// Movido de janelas/qa/etapas/06-execucao/dependencias.js (rodar, aparelho, shell) e 03-ambiente (adbSaida, app instalado).
// ctx: { adb?: caminho do adb, serial?: aparelho escolhido }. Sem serial: o primeiro emulador ligado (como antes).
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { rodar } = require('../aplicacao/rodar');

const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'Android', 'Sdk');
const ADB = path.join(SDK, 'platform-tools', 'adb');
const APP = /package:(br\.com\.ferreiracosta\.wms\S*)/;

/** Saída do adb (síncrona), '' se falhar. */
const adbSaida = (adb, args) => {
  try {
    return execFileSync(adb || ADB, args, { timeout: 15000 }).toString();
  } catch {
    return '';
  }
};
/** -s <serial> quando há um. */
const comSerial = (serial, args) => (serial ? ['-s', serial, ...args] : args);
/** Aparelhos que o adb enxerga: [{ serial, estado }]. */
const aparelhos = async (adb) =>
  (await rodar(adb || ADB, ['devices'], { timeout: 15000 })).saida
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length === 2)
    .map(([serial, estado]) => ({ serial, estado }));
/** O aparelho da vez: ctx.serial, senão o primeiro emulador pronto. Guarda em ctx.serial. */
async function serialDe(ctx = {}) {
  if (!ctx.serial)
    ctx.serial = (await rodar(ctx.adb || ADB, ['devices'])).saida.match(/^(emulator-\d+)\s+device$/m)?.[1] || '';
  return ctx.serial;
}
const shell = async (ctx, ...a) =>
  rodar(ctx.adb || ADB, ['-s', await serialDe(ctx), 'shell', ...a], { timeout: 30000 });
/** Pacote do app do WMS instalado no aparelho, ou null. */
const appDe = (adb, serial) => adbSaida(adb, comSerial(serial, ['shell', 'pm', 'list', 'packages'])).match(APP)?.[1] || null;
/** O aparelho terminou de ligar (sys.boot_completed). */
const ligado = (adb, serial) => adbSaida(adb, comSerial(serial, ['shell', 'getprop', 'sys.boot_completed'])).trim() === '1';
/** adb reverse das portas (o app no aparelho chama localhost:<porta> da máquina). */
const reverse = (adb, serial, portas) =>
  portas.forEach((p) => adbSaida(adb, comSerial(serial, ['reverse', `tcp:${p}`, `tcp:${p}`])));

module.exports = { SDK, ADB, rodar, adbSaida, comSerial, aparelhos, serialDe, shell, appDe, ligado, reverse };
