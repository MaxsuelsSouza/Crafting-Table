// @ts-check
// Porta respondendo, espera com parada e a porta de uma URL. Sem VS Code (os testes usam direto).
// Usado por: infra/ambientes/** e QA (03-ambiente, 04-precondicao), que reexporta pelos caminhos antigos.

const portaAberta = (n, host = '127.0.0.1') =>
  new Promise((ok) => {
    const sk = require('net').connect(n, host);
    const fim = (v) => {
      sk.destroy();
      ok(v);
    };
    sk.setTimeout(1500);
    sk.on('connect', () => fim(true));
    sk.on('error', () => fim(false));
    sk.on('timeout', () => fim(false));
  });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/** Repete `teste` a cada 3 s até dar true, passar `segundos` ou `parar()` dar true. */
async function esperar(teste, segundos, parar = () => false) {
  for (const fim = Date.now() + segundos * 1000; Date.now() < fim; await dormir(3000)) {
    if (await teste()) return true;
    if (parar()) return false;
  }
  return teste();
}
/** http://localhost:9009/x → 9009 (sem porta: 80/443). */
const portaDaUrl = (url) => {
  const u = new URL(url);
  return Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
};

module.exports = { portaAberta, dormir, esperar, portaDaUrl };
