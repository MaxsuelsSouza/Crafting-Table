// @ts-check
const vscode = require('vscode');
const { execFile } = require('child_process');
const { descendentes, matar } = require('./comandos').processos;
const { ESTILO_NOTAS } = require('./comandos').ui;
const { botao, mini, icone } = require('../componentes/botao');
const cardComando = require('../componentes/card-comando');
const { esc } = require('../infra/texto');

// Lógica sem tela (AVDs, ligados, ligar, adb, print): infra/ambientes/emulador/avd.js. Aqui fica a tela da seção.
const avdLib = require('../infra/ambientes/emulador/avd');
const { SDK, EMULATOR, ADB, rodando, emuladorRodando, listarAvds, ligar } = avdLib;
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

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
exports.dispositivos = avdLib.dispositivos;
exports.emuladorRodando = emuladorRodando;
exports.print = avdLib.print;

const estiloEmu = ESTILO_NOTAS + `<style>${cardComando.CSS}
  .tag { flex: none; font-size: 9.5px; font-weight: 500; padding: 0 6px; border-radius: var(--r-pill); border: 1px solid var(--border); color: var(--text-dim); }
  .estado { font-size: 10.5px; color: var(--text-dim); margin-top: 3px; display: flex; align-items: center; gap: 6px; }
  .ponto { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--text-dim); }
  .ligado .ponto { background: var(--ok); animation: pulso 1.6s infinite; }
  .ocupado .ponto { background: var(--warn); animation: pulso .9s infinite; }
  .ligado .estado .txt { color: var(--ok); }
  .ocupado .estado .txt { color: var(--warn); }
  .mono { font-family: var(--fc-mono); font-size: 10.5px; }
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
    return cardComando.card({
      estado: classe, abertos: Boolean(procs[avd]),
      run: emu ? botao('■', { variante: 'parar', acao: 'parar', id: avd, titulo: 'Desligar', desligado: Boolean(ocupado) })
        : botao('▶', { variante: 'executar', acao: 'ligar', id: avd, titulo: 'Ligar', desligado: Boolean(ocupado) }),
      corpoAttr: ` title="${esc(avd)}"`,
      corpo: `<div class="nome">${esc(nomeBonito(avd))}${avd.startsWith('WmsHub_') ? '<span class="tag">wms-hub</span>' : ''}</div>
        <div class="estado"><span class="ponto"></span><span class="txt">${esc(estado)}</span>
          ${emu ? `<span class="mono">${esc(emu.serial)} · PID ${emu.pid}</span>` : ''}</div>`,
      mini: mini([
        botao('@', { acao: 'mencionar', id: avd, titulo: 'Mencionar no Claude' }),
        botao('⋯', { acao: 'processos', id: avd, titulo: 'Processos', classe: procs[avd] ? 'aberto' : '' }),
        botao(icone('limpar'), { perigo: true, acao: 'wipe', id: avd, titulo: 'Wipe data: apaga os dados e liga do zero' })].join('')),
      procs: procs[avd] ? cardComando.procs(procs[avd], avd) : ''
    });
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
      require('../infra/agentes/conversa').mencionar(`[Emulador Android "${id}" da Crafting Table · AVD ${id} · ${emu ? `ligado · serial ${emu.serial} · PID ${emu.pid}${emu.semJanela ? ' · sem janela' : ''}` : 'desligado'} · emulator: ${EMULATOR} · adb: ${ADB}]`);
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

  // A tela mora em Configurações → Comandos e o atalho no rodapé do ticket (moldura.js): ela pede o html e repassa os cliques.
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
