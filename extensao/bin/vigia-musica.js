// Fecha o Chromium do YouTube Music quando o VS Code fecha de verdade (o reload não fecha: a música continua).
// Fecha pelo Browser.close do DevTools: só assim o Chromium grava os cookies de login (SIGTERM/SIGKILL perdem).
// Sem Chromium, desliga a tela virtual (Xvfb) que ele usava.
// Uso: vigia-musica.js <pid do processo principal do VS Code> <porta do DevTools> <tela, ex.: :87>
const fs = require('fs');
const [pai, porta] = process.argv.slice(2, 4).map(Number);
const tela = process.argv[4];
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

function desligarTela() {
  try { process.kill(Number(fs.readFileSync(`/tmp/.X${tela.slice(1)}-lock`, 'utf8').trim())); } catch {}
  process.exit(0);
}

setInterval(async () => {
  let versao;
  try { versao = await (await fetch(`http://127.0.0.1:${porta}/json/version`)).json(); } catch { desligarTela(); } // Chromium já fechou
  if (vivo(pai)) return;
  const ws = new WebSocket(versao.webSocketDebuggerUrl);
  ws.addEventListener('open', () => ws.send(JSON.stringify({ id: 1, method: 'Browser.close' })));
  setTimeout(desligarTela, 3000);
}, 3000);
