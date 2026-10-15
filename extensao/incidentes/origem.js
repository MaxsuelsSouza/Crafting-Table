// @ts-check
// Origem permitida para arquivos que o Claude manda copiar para a pasta do incidente (mergulho-gravar --de, mergulho-fluxo evidencia).
// Sem dependências: roda dentro dos bins. Só vale arquivo real em /tmp (onde o adb e o ffmpeg gravam) ou dentro da própria pasta da aba.
const fs = require('fs');
const os = require('os');
const path = require('path');

const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
/** @param {string} dir pasta da aba  @param {string} origem caminho pedido pelo Claude */
function origemPermitida(dir, origem) {
  const f = real(path.resolve(String(origem || '')));
  if (!f) return false;
  return [os.tmpdir(), '/tmp', dir].map(real).filter(Boolean).some((b) => f.startsWith(b + path.sep));
}

module.exports = { origemPermitida };
