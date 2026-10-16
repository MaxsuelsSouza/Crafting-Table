// @ts-check
// Chamada autenticada à API do Jira (REST v3 e Agile 1.0); o erro traz a mensagem do próprio Jira.
const { credenciais } = require('./conta');

// Chamada autenticada à API do Jira; erro traz a mensagem do próprio Jira.
async function api(secrets, site, rota, opcoes = {}) {
  const auth = await credenciais(secrets);
  if (!auth) throw new Error('Credenciais do Jira não informadas');
  const r = await fetch(rota.startsWith('/') ? `${site}${rota}` : `${site}/rest/api/3/${rota}`, { ...opcoes, headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' } });
  const txt = await r.text();
  if (!r.ok) {
    let msg = txt.slice(0, 200);
    try { const j = JSON.parse(txt); msg = [...(j.errorMessages || []), ...Object.entries(j.errors || {}).map(([k, v]) => `${k}: ${v}`)].join('; ') || msg; } catch {}
    throw new Error(`Jira respondeu ${r.status}: ${msg}`);
  }
  return txt ? JSON.parse(txt) : {};
}

module.exports = { api };
