// @ts-check
// AVDs da máquina, emuladores ligados, ligar, aparelhos do adb e o print por gRPC: a lógica do emulador sem tela (sem VS Code).
// Movido como está de modulos/emulador.js (que reexporta e mantém a tela). Usado por infra/ambientes/emulador/ e modulos/evidencias.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

// Lista os AVDs da máquina e liga com janela. O gRPC fica só para o print da aba Evidências,
// autenticado pelo token do arquivo de descoberta, como no Projeto-dani (wms-hub/services/mobile).
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'Android', 'Sdk');
const EMULATOR = path.join(SDK, 'emulator', 'emulator');
const ADB = path.join(SDK, 'platform-tools', 'adb');
const RUNNING = path.join(process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`, 'avd', 'running');

let Controller;
function controller() {
  if (!Controller) {
    const grpc = require('@grpc/grpc-js');
    const loader = require('@grpc/proto-loader');
    const def = loader.loadSync(path.join(SDK, 'emulator', 'lib', 'emulator_controller.proto'), { keepCase: true, longs: Number, enums: String, defaults: true });
    Controller = /** @type {any} */ (grpc.loadPackageDefinition(def)).android.emulation.control.EmulatorController;
  }
  return Controller;
}

const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// Emuladores ligados, pelo arquivo de descoberta que cada um publica.
function rodando() {
  let arquivos;
  try { arquivos = fs.readdirSync(RUNNING).filter((f) => /^pid_\d+\.ini$/.test(f)); } catch { return []; }
  return arquivos.map((f) => {
    const pid = Number(f.match(/\d+/)[0]);
    if (!vivo(pid)) return null;
    const ini = fs.readFileSync(path.join(RUNNING, f), 'utf8');
    const campo = (k) => ini.match(new RegExp(`^${k.replace('.', '\\.')}=(.+)$`, 'm'))?.[1].trim();
    return {
      pid, avd: campo('avd.id'), nome: campo('avd.name') || 'Emulador', porta: campo('grpc.port'), token: campo('grpc.token'),
      serial: `emulator-${campo('port.serial')}`, semJanela: /-no-window/.test(campo('cmdline') || '')
    };
  }).filter(Boolean);
}

const emuladorRodando = () => rodando().find((e) => e.porta && e.token) || null;

const listarAvds = () => new Promise((resolve) => execFile(EMULATOR, ['-list-avds'], (err, out) =>
  resolve(err ? [] : String(out).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('INFO')))));

function ligar(avd, extra = []) {
  // -grpc-use-token: sem isso o gRPC fica aberto sem proteção na rede.
  spawn(EMULATOR, ['@' + avd, '-grpc-use-token', '-netdelay', 'none', '-netspeed', 'full', ...extra],
    { detached: true, stdio: 'ignore' }).unref();
}
exports.SDK = SDK;
exports.EMULATOR = EMULATOR;
exports.ADB = ADB;
exports.listarAvds = listarAvds;
exports.rodando = rodando;
exports.ligar = ligar;
// Aparelhos que o adb enxerga (emulador ou coletor físico), prontos ou não.
exports.dispositivos = () => new Promise((resolve) => execFile(ADB, ['devices'], (err, out) =>
  resolve(err ? [] : String(out).split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter((p) => p.length === 2).map(([serial, estado]) => ({ serial, estado })))));
exports.emuladorRodando = emuladorRodando;

// PNG da tela atual (Buffer), ou erro se não houver emulador.
exports.print = (emu) => new Promise((resolve, reject) => {
  const grpc = require('@grpc/grpc-js');
  const c = new (controller())(`127.0.0.1:${emu.porta}`, grpc.credentials.createInsecure());
  const meta = new grpc.Metadata();
  meta.add('authorization', `Bearer ${emu.token}`);
  c.getScreenshot({ format: 'PNG' }, meta, (err, img) => { c.close(); err ? reject(err) : resolve(img.image); });
});
