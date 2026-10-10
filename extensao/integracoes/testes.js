// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { RAIZ } = require('../infra/sessao');
const emulador = require('../modulos/emulador');

// Ponte com a skill testes-funcionais, sem modificá-la. O hook ~/.claude/hooks/crafting-testes.py
// deixa pedidos em PEDIDOS; aqui cada um é confirmado (renomeado para .ok, o hook espera por isso)
// e executado. A espera pelo ambiente pronto (portas, boot) fica no hook.
const PEDIDOS = path.join(RAIZ, '.pedidos');
const VIVO = path.join(RAIZ, '.crafting-ativo'); // o hook só pede se a extensão estiver aberta

async function ambiente(p) {
  vscode.window.showInformationMessage(`Crafting Table: preparando o ambiente do ${p.chave}...`);
  if (p.emulador) {
    const aparelhos = await emulador.dispositivos();
    if (!aparelhos.length) {
      const avd = vscode.workspace.getConfiguration('craftingTable').get('avdPadrao');
      emulador.ligar(avd);
    } else if (aparelhos.length > 1) {
      vscode.window.showWarningMessage(`${aparelhos.length} aparelhos conectados (${aparelhos.map((a) => a.serial).join(', ')}). A skill chama o adb sem escolher o aparelho e pode falhar: deixe só um ligado.`);
    }
  }
  for (const b of p.botoes || []) await require('../modulos/comandos').garantir(b);
}

function gravar(p) {
  const ev = require('../modulos/evidencias');
  if (p.acao === 'iniciar') ev.gravar({ sid: p.sid, chave: p.chave, continuo: true });
  else ev.pararGravacao();
}

function processar() {
  let nomes;
  try { nomes = fs.readdirSync(PEDIDOS).filter((n) => n.endsWith('.json')); } catch { return; }
  for (const n of nomes) {
    const arq = path.join(PEDIDOS, n);
    let p;
    try {
      p = JSON.parse(fs.readFileSync(arq, 'utf8'));
      fs.renameSync(arq, arq.replace(/\.json$/, '.ok'));
    } catch { continue; } // outro processamento já pegou, ou arquivo ainda sendo escrito
    (p.tipo === 'gravar' ? Promise.resolve(gravar(p)) : ambiente(p))
      .catch((e) => vscode.window.showErrorMessage('Crafting Table: ' + e.message));
  }
}

exports.iniciar = () => {
  fs.mkdirSync(PEDIDOS, { recursive: true });
  const bater = () => { try { fs.writeFileSync(VIVO, String(Date.now())); } catch {} };
  bater();
  const pulso = setInterval(bater, 10000);
  const observador = fs.watch(PEDIDOS, () => processar());
  processar();
  return { dispose: () => { clearInterval(pulso); observador.close(); try { fs.unlinkSync(VIVO); } catch {} } };
};
