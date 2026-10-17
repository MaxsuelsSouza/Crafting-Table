// @ts-check
// Saúde da aplicação sem Claude: as portas dos papéis abertas e a API devolvendo qualquer resposta HTTP. { ok, motivo }.
// Usado por: infra/ambientes/*/index.js (saude) e QA 04-precondicao (healthCheck).
const { PAPEIS } = require('./papeis');
const { portaAberta } = require('./portas');

const respondeHttp = (porta, host = '127.0.0.1') =>
  new Promise((ok) => {
    const rq = require('http').get({ host, port: porta, path: '/', timeout: 5000 }, (r) => {
      r.resume();
      ok(true);
    });
    rq.on('timeout', () => {
      rq.destroy();
      ok(false);
    });
    rq.on('error', () => ok(false));
  });

/** portas: { papel: porta } (padrão: a do papel). O papel api também precisa responder HTTP. */
async function saude(papeis, portas = {}) {
  for (const k of papeis) {
    const p = PAPEIS[k],
      porta = portas[k] ?? p.porta;
    if (porta && !(await portaAberta(porta))) return { ok: false, motivo: `${p.nome} não responde na porta ${porta}` };
  }
  if (!papeis.includes('api') || (await respondeHttp(portas.api ?? PAPEIS.api.porta))) return { ok: true };
  return { ok: false, motivo: `A API (porta ${portas.api ?? PAPEIS.api.porta}) aceita conexão mas não responde requisição` };
}

module.exports = { saude, respondeHttp };
