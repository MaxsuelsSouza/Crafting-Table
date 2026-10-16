// @ts-check
// Health check sem Claude: portas da API e do Metro e uma requisição HTTP real à API.
const { PAPEIS } = require('../03-ambiente/regras/papeis');
const { portaAberta } = require('../03-ambiente/dependencias');

// Aplicação no ar e rede respondendo, sem Claude: portas da API e do Metro abertas e a API devolvendo qualquer resposta HTTP. { ok, motivo }.
async function healthCheck() {
  for (const p of Object.values(PAPEIS))
    if (!(await portaAberta(p.porta))) return { ok: false, motivo: `${p.nome} não responde na porta ${p.porta}` };
  const http = require('http');
  const resp = await new Promise((ok) => {
    const rq = http.get({ host: '127.0.0.1', port: PAPEIS.api.porta, path: '/', timeout: 5000 }, (r) => {
      r.resume();
      ok(true);
    });
    rq.on('timeout', () => {
      rq.destroy();
      ok(false);
    });
    rq.on('error', () => ok(false));
  });
  return resp
    ? { ok: true }
    : { ok: false, motivo: `A API (porta ${PAPEIS.api.porta}) aceita conexão mas não responde requisição` };
}

module.exports = { healthCheck };
