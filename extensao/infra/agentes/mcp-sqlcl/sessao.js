// @ts-check
// Uma sessão do MCP do SQLcl por conexão salva, aberta na primeira consulta e fechada depois de 15 min sem uso.
// Ao conectar fixa o formato de número e data (a JVM em pt-BR escreve 1,5 e quebra o JSON).
const { abrir } = require('./cliente');

const OCIOSO_MS = 15 * 60000;
const sessoes = new Map(); // conexão -> { cliente, pronta: Promise, timer }

const NLS = "alter session set nls_numeric_characters='.,' nls_date_format='YYYY-MM-DD HH24:MI:SS' nls_timestamp_format='YYYY-MM-DD HH24:MI:SS.FF'";

function fechar(conexao) {
  const lista = conexao ? [conexao] : [...sessoes.keys()];
  for (const c of lista) {
    const s = sessoes.get(c);
    if (!s) continue;
    clearTimeout(s.timer);
    s.cliente.fechar();
    sessoes.delete(c);
  }
}

/** @param {{ conexao: string, sqlcl?: string }} b */
async function sessao(b) {
  const conexao = String(b.conexao).replace(/[^\w .-]/g, '');
  let s = sessoes.get(conexao);
  if (s && !s.cliente.vivo()) { fechar(conexao); s = undefined; }
  if (!s) {
    const cliente = abrir({ sqlcl: b.sqlcl });
    const pronta = (async () => {
      const r = await cliente.chamar('connect', { connection_name: conexao }, 90000);
      if (!/CONNECTION ESTABLISHED|Successfully connected/i.test(r)) throw new Error(`conexão "${conexao}" falhou: ${r.replace(/\s+/g, ' ').slice(0, 200)}`);
      await cliente.chamar('sql_run', { sql: NLS });
    })();
    s = { cliente, pronta, timer: null };
    sessoes.set(conexao, s);
    pronta.catch(() => fechar(conexao));
  }
  await s.pronta;
  clearTimeout(s.timer);
  s.timer = setTimeout(() => fechar(conexao), OCIOSO_MS);
  s.timer.unref?.();
  return s.cliente;
}

module.exports = { sessao, fechar };
