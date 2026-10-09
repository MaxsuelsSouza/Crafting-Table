const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { descendentes, matar } = require('./comandos').processos;
const { icone, ESTILO_NOTAS } = require('./comandos').ui;
const { esc } = require('./ticket')._teste;

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
    Controller = grpc.loadPackageDefinition(def).android.emulation.control.EmulatorController;
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

async function desligar(emu) {
  execFile(ADB, ['-s', emu.serial, 'emu', 'kill'], () => {});
  for (let i = 0; i < 40 && vivo(emu.pid); i++) await new Promise((r) => setTimeout(r, 500));
  if (vivo(emu.pid)) matar(emu.pid);
}

// No Wayland só o GNOME traz janela de outro programa pra frente: quem faz é a extensão
// do GNOME claude-abas-janelas@local (~/.local/share/gnome-shell/extensions), via D-Bus.
// Resolve com true se achou e ativou a janela (pelo pid; sem pid, pelo trecho do título).
const trazerParaFrente = (pid, titulo) => new Promise((resolve) => execFile('gdbus', ['call', '--session',
  '--dest', 'org.claudeAbas.Janelas', '--object-path', '/org/claudeAbas/Janelas',
  '--method', 'org.claudeAbas.Janelas.Ativar', String(pid || 0), titulo], (err, out) => {
  if (err) vscode.window.showWarningMessage('Não consegui trazer a janela para frente. A extensão do GNOME "claude-abas-janelas" só funciona depois de sair e entrar de novo na sessão do Linux.');
  resolve(!err && /true/.test(out));
}));
exports.trazerParaFrente = trazerParaFrente;

async function focar(emu) {
  if (!await trazerParaFrente(emu.pid, `${emu.avd}:${emu.serial.split('-')[1]}`)) vscode.window.showWarningMessage(`Não achei a janela de ${emu.avd}.`);
}

// Botão 📱 do cabeçalho: traz para frente todo emulador ligado com janela.
exports.focarAbertos = () => rodando().filter((e) => !e.semJanela).forEach(focar);

exports.SDK = SDK;
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

const estiloEmu = ESTILO_NOTAS + `<style>
  .cartoes > li.ligado { border-left: 3px solid var(--ok); }
  .cartoes > li.ocupado { border-left: 3px solid var(--warn); }
  .cartoes > li.ligado:hover { border-left-color: var(--ok); }
  .cartoes > li.ocupado:hover { border-left-color: var(--warn); }
  .card { display: flex; align-items: center; gap: 10px; }
  /* Só o símbolo: ▶ verde para rodar, ■ vermelho para parar, sem círculo nem borda. */
  .run { flex: none; width: 28px; height: 28px; border: 0; border-radius: var(--r-md); padding: 0; display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 400; background: transparent; color: var(--ok, var(--ok)); }
  .run:hover { background: var(--surface-2); }
  .run.stop { color: var(--perigo, var(--danger)); }
  .run:disabled { opacity: .4; cursor: default; }
  .corpo { flex: 1; min-width: 0; }
  .corpo .nome { font-weight: 600; font-size: 12.5px; display: flex; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; }
  .tag { flex: none; font-size: 9.5px; font-weight: 500; padding: 0 6px; border-radius: var(--r-pill); border: 1px solid var(--border); color: var(--text-dim); }
  .estado { font-size: 10.5px; color: var(--text-dim); margin-top: 3px; display: flex; align-items: center; gap: 6px; }
  .ponto { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--text-dim); }
  .ligado .ponto { background: var(--ok); animation: pulso 1.6s infinite; }
  .ocupado .ponto { background: var(--warn); animation: pulso .9s infinite; }
  .ligado .estado .txt { color: var(--ok); }
  .ocupado .estado .txt { color: var(--warn); }
  @keyframes pulso { 50% { opacity: .3; } }
  .mono { font-family: var(--fc-mono); font-size: 10.5px; }
  .cartoes .procs { margin: 8px 0 0 38px; padding: 6px 8px; border-left: none; border-radius: var(--r-md); background: var(--surface-2); }
  .cartoes .proc .pid { min-width: 0; padding: 0 6px; border-radius: var(--r-pill); font-size: 10.5px; background: var(--surface); color: var(--accent); }
  .cartoes .procs .todos { font-size: 11px; margin-top: 6px; }
</style>`;

// Small_Phone -> Small Phone; os clones do wms-hub ganham uma etiqueta.
const nomeBonito = (avd) => (avd.startsWith('WmsHub_') ? `WmsHub ${avd.slice(7)}` : avd.replace(/_/g, ' '));

const tela = (avds, ligados, ocupados, procs) => `${estiloEmu}
  <div class="topo"><span class="rotulo">Emuladores</span><span class="titulo"></span>
    <span class="extra">${avds.length ? `${avds.length} emulador${avds.length === 1 ? '' : 'es'}` : ''}</span></div>
  ${avds.length ? `<div class="barras"><span class="dica">${ligados.length ? `${ligados.length} ligado${ligados.length === 1 ? '' : 's'}` : 'nenhum ligado'}</span></div>
  <ul class="cartoes">${avds.map((avd) => {
    const emu = ligados.find((e) => e.avd === avd);
    const ocupado = ocupados[avd];
    const estado = ocupado || (emu ? (emu.semJanela ? 'rodando sem janela' : 'rodando') : 'parado');
    const classe = ocupado ? 'ocupado' : emu ? 'ligado' : '';
    return `<li class="${classe} ${procs[avd] ? 'com-procs' : ''}"><div class="card">
      ${emu
        ? `<button class="run stop" data-acao="parar" data-id="${esc(avd)}" title="Desligar" ${ocupado ? 'disabled' : ''}>■</button>`
        : `<button class="run" data-acao="ligar" data-id="${esc(avd)}" title="Ligar" ${ocupado ? 'disabled' : ''}>▶</button>`}
      <div class="corpo" title="${esc(avd)}">
        <div class="nome">${esc(nomeBonito(avd))}${avd.startsWith('WmsHub_') ? '<span class="tag">wms-hub</span>' : ''}</div>
        <div class="estado"><span class="ponto"></span><span class="txt">${esc(estado)}</span>
          ${emu ? `<span class="mono">${esc(emu.serial)} · PID ${emu.pid}</span>` : ''}</div>
      </div>
      <span class="mini">
        <button data-acao="mencionar" data-id="${esc(avd)}" title="Mencionar no Claude">@</button>
        <button class="${procs[avd] ? 'aberto' : ''}" data-acao="processos" data-id="${esc(avd)}" title="Processos">⋯</button>
        <button class="ico perigo" data-acao="wipe" data-id="${esc(avd)}" title="Wipe data: apaga os dados e liga do zero">${icone('limpar')}</button>
      </span></div>
      ${procs[avd] ? `<div class="procs">${procs[avd].length ? `
        ${procs[avd].map((p) => `<div class="proc">
          <span class="pid">${p.pid}</span><span class="args" title="${esc(p.args)}">${esc(p.args)}</span>
          <button data-acao="matar" data-id="${esc(avd)}" data-pid="${p.pid}" title="Matar ${p.pid}">✕</button>
        </div>`).join('')}
        <button class="todos" data-acao="matarTodos" data-id="${esc(avd)}">Matar todos (${procs[avd].length})</button>`
        : '<p class="vazio">Nenhum processo rodando.</p>'}</div>` : ''}
    </li>`;
  }).join('')}</ul>`
  : '<div class="folha"><div class="centro"><div class="icone">📱</div>Nenhum emulador encontrado.<br>Crie um AVD no Android Studio (Device Manager).</div></div>'}`;

// Processo principal do emulador (qemu) + o que ele iniciou.
async function processosDe(emu) {
  if (!emu) return [];
  const args = await new Promise((r) => execFile('ps', ['-o', 'args=', '-p', String(emu.pid)], (e, o) => r(String(o).trim())));
  return [{ pid: emu.pid, args }, ...await descendentes(emu.pid)];
}

const ouvintes = [];
exports.aoMudar = (f) => { ouvintes.push(f); }; // chamado quando a tela muda (emulador liga/desliga, processos)

exports.provider = () => {
  let ultimo, timer, avdsCache = [], assinatura = '';
  const abertos = new Set();
  const ocupados = {}; // avd -> texto enquanto liga/limpa

  const render = async (forcar) => {
    const [avds, ligados] = [forcar || !avdsCache.length ? await listarAvds() : avdsCache, rodando()];
    avdsCache = avds;
    const procs = {};
    for (const avd of abertos) procs[avd] = await processosDe(ligados.find((e) => e.avd === avd));
    for (const avd of Object.keys(ocupados)) if (ligados.some((e) => e.avd === avd)) delete ocupados[avd];
    const html = tela(avds, ligados, ocupados, procs);
    if (!forcar && html === ultimo) return; // não redesenha à toa (perderia hover/rolagem)
    ultimo = html;
    ouvintes.forEach((f) => f());
  };

  const achar = (avd) => rodando().find((e) => e.avd === avd);
  const acoes = {
    mencionar({ id }) {
      const emu = achar(id);
      require('./claude').mencionar(`[Emulador Android "${id}" da Crafting Table · AVD ${id} · ${emu ? `ligado · serial ${emu.serial} · PID ${emu.pid}${emu.semJanela ? ' · sem janela' : ''}` : 'desligado'} · emulator: ${EMULATOR} · adb: ${ADB}]`);
    },
    ligar({ id }) {
      ligar(id);
      ocupados[id] = 'ligando... (até 1 minuto)';
      render(true);
    },
    async parar({ id }) {
      const emu = achar(id);
      if (!emu) return;
      ocupados[id] = 'desligando...';
      render(true);
      await desligar(emu);
      delete ocupados[id];
      render(true);
    },
    async wipe({ id }) {
      const ok = await vscode.window.showWarningMessage(`Apagar todos os dados de ${id}?`,
        { modal: true, detail: 'Apps instalados, login e arquivos do emulador somem. Ele liga de novo do zero.' }, 'Apagar dados');
      if (!ok) return;
      const emu = achar(id);
      ocupados[id] = 'limpando dados...';
      render(true);
      if (emu) await desligar(emu);
      ligar(id, ['-wipe-data']);
    },
    processos({ id }) { abertos.has(id) ? abertos.delete(id) : abertos.add(id); render(true); },
    matar({ pid }) { matar(pid); setTimeout(() => render(true), 700); },
    async matarTodos({ id }) {
      (await processosDe(achar(id))).reverse().forEach((p) => matar(p.pid));
      setTimeout(() => render(true), 700);
    }
  };

  // A tela mora em Configurações → Comandos e o atalho no rodapé do ticket (painel.js): ela pede o html e repassa os cliques.
  exports.api = {
    html: () => ultimo || '',
    lista: () => avdsCache.map((avd) => ({ id: avd, nome: nomeBonito(avd), rodando: Boolean(achar(avd)), ocupado: ocupados[avd] || null })),
    alternar: ({ id }) => (achar(id) ? acoes.parar({ id }) : acoes.ligar({ id })),
    acao: (m) => acoes[m.acao]?.(m),
    atualizar: () => render(true)
  };
  // Emulador liga/desliga por fora (janela fechada, wms-hub): confere a cada 3 s e só avisa a tela se mudou.
  timer = setInterval(() => {
    const atual = rodando().map((e) => e.avd).join();
    if (atual !== assinatura) { assinatura = atual; render(true); }
  }, 3000);
  render(true);

  return vscode.Disposable.from({ dispose: () => { clearInterval(timer); exports.api = null; } });
};

exports._teste = { tela, rodando, listarAvds, processosDe };
