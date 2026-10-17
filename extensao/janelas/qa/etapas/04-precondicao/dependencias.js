// @ts-check
// Health check sem Claude (a saúde do ambiente do ticket: portas dos papéis e uma requisição HTTP real à API) e o login na API.
const ambientes = require('../../../../infra/ambientes');
const { PAPEIS } = require('../../../../infra/ambientes/aplicacao/papeis');

// Aplicação no ar e rede respondendo, sem Claude: infra/ambientes/<amb.nome>.saude (emulador e aparelho: API e Metro; web: API e front). { ok, motivo }.
const healthCheck = (amb) => ambientes.obter(amb?.nome).saude(amb || {});

// Login na API sem Claude, com a MESMA requisição da skill (recursos/api.resource): V1 por header (sem X-Api-Version: 1.0 a rota dá 404)
// e `filial` (sem ela a API consulta outro banco e responde "Usuário não existe"). Credenciais do ~/.wms-testes.env, nunca mostradas.
// { ok, motivo } | null quando não há credencial configurada (aí o Claude faz o login, como antes).
async function loginApi(env = require('../06-execucao/dependencias').lerEnvWms()) {
  const login = env.WMS_API_LOGIN,
    senha = env.WMS_API_SENHA;
  if (!login || !senha) return null;
  const base = String(env.WMS_API_URL || `http://localhost:${PAPEIS.api.porta}`).replace(/\/+$/, '');
  try {
    const r = await fetch(`${base}/api/LoginUsuario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Version': '1.0', filial: env.WMS_FILIAL || 'Cab' },
      body: JSON.stringify({ login, senha, production: false }),
      signal: AbortSignal.timeout(20000)
    });
    const bruto = await r.text();
    let j = {};
    try {
      j = JSON.parse(bruto);
    } catch {
      /* corpo sem JSON */
    }
    if (r.ok) return { ok: true, motivo: `login na API ok (matrícula ${j.matricula ?? '?'}, usuário ${login})` };
    // O corpo é o diagnóstico: senha bloqueada, expirada e usuário inexistente têm remédios diferentes.
    const msg = String(j.message || j.Message || j.mensagem || bruto || '')
      .replace(/\s+/g, ' ')
      .slice(0, 180);
    return {
      ok: false,
      motivo: `login na API recusado (HTTP ${r.status}${msg ? `: ${msg}` : ''}) para o usuário ${login}`
    };
  } catch (e) {
    return { ok: false, motivo: `login na API sem resposta em ${base} (${e.message})` };
  }
}

module.exports = { healthCheck, loginApi };
