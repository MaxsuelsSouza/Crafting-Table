// @ts-check
// Dependência externa da etapa "http": a API local com o mesmo login da skill (recursos/api.resource): POST /api/LoginUsuario (V1, header
// filial) devolve authorization (Bearer) e matricula; as chamadas levam Authorization, X-Api-Version, matriculaUsuario e filial.
// O token fica guardado por 20 min (um login por jornada). Credenciais do ~/.wms-testes.env, nunca no roteiro nem no log.
const { lerEnvWms } = require('./dependencias');

const VALIDADE_MS = 20 * 60000;
let sessao = null; // { base, token, matricula, filial, ate }

async function logar(env) {
  const base = String(env.WMS_API_URL || 'http://localhost:5111').replace(/\/+$/, ''),
    filial = env.WMS_FILIAL || 'Cab';
  if (sessao && sessao.base === base && sessao.ate > Date.now()) return sessao;
  if (!env.WMS_API_LOGIN || !env.WMS_API_SENHA)
    throw new Error('WMS_API_LOGIN/WMS_API_SENHA vazios em ~/.wms-testes.env');
  const r = await fetch(`${base}/api/LoginUsuario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Version': '1.0', filial },
    body: JSON.stringify({ login: env.WMS_API_LOGIN, senha: env.WMS_API_SENHA, production: false }),
    signal: AbortSignal.timeout(20000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.authorization) throw new Error(`login na API recusado (HTTP ${r.status})`);
  sessao = {
    base,
    token: j.authorization,
    matricula: String(j.matricula ?? ''),
    filial,
    ate: Date.now() + VALIDADE_MS
  };
  return sessao;
}

/** @param {{ metodo: string, rota: string, corpo?: any, headers?: Record<string,string> }} e @returns {Promise<{ ok: boolean, status?: number, corpo?: any, texto?: string, erro?: string }>} */
async function chamarApi(e, env = lerEnvWms()) {
  try {
    const s = await logar(env);
    const r = await fetch(`${s.base}${e.rota}`, {
      method: String(e.metodo).toUpperCase(),
      headers: {
        Authorization: `Bearer ${s.token}`,
        'X-Api-Version': env.WMS_API_VERSAO || '2.0',
        matriculaUsuario: s.matricula,
        filial: s.filial,
        'Content-Type': 'application/json',
        ...(e.headers || {})
      },
      ...(e.corpo !== undefined ? { body: typeof e.corpo === 'string' ? e.corpo : JSON.stringify(e.corpo) } : {}),
      signal: AbortSignal.timeout(60000)
    });
    const texto = await r.text();
    let corpo = texto;
    try {
      corpo = JSON.parse(texto);
    } catch {
      /* corpo sem JSON: fica o texto */
    }
    return { ok: true, status: r.status, corpo, texto };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

module.exports = { chamarApi };
