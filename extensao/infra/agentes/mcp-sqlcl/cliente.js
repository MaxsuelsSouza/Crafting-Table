// @ts-check
// Processo `sql -mcp` (o servidor MCP do SQLcl) falando JSON-RPC por stdio. Fica aberto: a JVM e a conexão sobem uma vez
// e cada consulta custa ~0,1 s (o mapa-db abre um SQLcl por chamada: ~10 s). Sem dependência de vscode.
const { spawn } = require('child_process');
const lib = require('../../plugins/mapa/lib/banco');

// A JVM segue o locale do sistema: em pt-BR o número sai 1,5 e quebra o CSV/JSON do MCP.
const LOCALE = { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };

/**
 * @param {{ sqlcl?: string }} [o]
 * @returns {{ chamar: (nome: string, args: object, timeoutMs?: number) => Promise<string>, vivo: () => boolean, fechar: () => void }}
 */
function abrir({ sqlcl } = {}) {
  const bin = lib.acharSqlcl(sqlcl);
  if (!bin) throw new Error('SQLcl não encontrado (Configurações → Banco de dados)');
  const jh = process.env.MAPA_DB_JAVA_HOME || process.env.JAVA_HOME || '/usr/lib/jvm/java-17-openjdk-amd64';
  const p = spawn(bin, ['-mcp'], { env: { ...process.env, ...LOCALE, JAVA_HOME: jh }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pendentes = new Map();
  let id = 0, resto = '', morto = false;
  const falharTodos = (motivo) => { for (const f of pendentes.values()) f.falha(new Error(motivo)); pendentes.clear(); };
  p.stdout.on('data', (b) => {
    const partes = (resto + b).split('\n');
    resto = partes.pop() || '';
    for (const l of partes) {
      let m;
      try { m = JSON.parse(l); } catch { continue; }
      const f = pendentes.get(m.id);
      if (!f) continue;
      pendentes.delete(m.id);
      if (m.error) f.falha(new Error(m.error.message || 'erro do MCP'));
      else f.ok(m.result);
    }
  });
  p.stderr.on('data', () => {}); // log de inicialização do servidor (o MCP fala pelo stdout)
  p.on('error', (e) => { morto = true; falharTodos(`não consegui rodar o SQLcl: ${e.message}`); });
  p.on('close', () => { morto = true; falharTodos('o MCP do SQLcl encerrou'); });
  const enviar = (o) => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...o }) + '\n');
  const pedir = (method, params, timeoutMs = 60000) =>
    new Promise((ok, falha) => {
      if (morto) return falha(new Error('o MCP do SQLcl não está rodando'));
      const n = ++id;
      const t = setTimeout(() => { pendentes.delete(n); falha(new Error(`sem resposta do MCP em ${Math.round(timeoutMs / 1000)} s`)); }, timeoutMs);
      pendentes.set(n, { ok: (r) => { clearTimeout(t); ok(r); }, falha: (e) => { clearTimeout(t); falha(e); } });
      enviar({ id: n, method, params });
    });
  let pronto = null;
  const iniciar = () =>
    (pronto ||= pedir('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'crafting-table', version: '1' } }, 90000).then(() =>
      enviar({ method: 'notifications/initialized' })
    ));
  return {
    // Texto da resposta da ferramenta (o MCP do SQLcl devolve tudo em content[].text). Erro de SQL vem no texto (ORA-), não em isError.
    async chamar(nome, args, timeoutMs) {
      await iniciar();
      const r = await pedir('tools/call', { name: nome, arguments: { model: 'crafting-table', ...args } }, timeoutMs);
      const texto = (r?.content || []).map((c) => c.text || '').join('');
      if (r?.isError) throw new Error(texto.slice(0, 300) || `${nome} falhou`);
      return texto;
    },
    vivo: () => !morto,
    fechar: () => { morto = true; try { p.kill(); } catch {} }
  };
}

module.exports = { abrir, LOCALE };
