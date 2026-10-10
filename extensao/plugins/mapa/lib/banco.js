// @ts-check
// Acesso SÓ LEITURA ao banco para o mapeamento do passo 3, pelo SQLcl (conexões salvas dele: a senha fica cifrada lá).
// Usado pelo script bin/mapa-db (o Claude) e pela aba "Banco de dados" das Configurações (a extensão). Sem dependência de vscode.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const AMBIENTES = { 'copia-producao': 'cópia de produção', qas: 'QAS', producao: 'produção' };
const SENSIVEIS_PADRAO = ['cpf', 'cnpj', 'rg', 'email', 'telefone', 'fone', 'celular', 'endereco', 'logradouro', 'cep', 'senha', 'password', 'token', 'nascimento', 'salario'];
const LIMITE_PADRAO = 50;

// ── Validação: só SELECT/WITH, uma instrução, nada que escreva ou execute código ──
function limparSql(sql) { // tira comentários e o conteúdo de strings, para procurar palavras sem falsos positivos
  return String(sql).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"])*"/g, '""');
}
const PROIBIDAS = /\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|begin|declare|call|execute|exec|commit|rollback|savepoint|lock|rename|comment|purge|flashback|analyze|audit|noaudit|into|copy|connect|spool|host|start)\b/i;
function validar(sql) {
  let s = String(sql || '').trim().replace(/;+\s*$/, '');
  if (!s) return { ok: false, erro: 'consulta vazia' };
  const limpo = limparSql(s);
  if (limpo.includes(';')) return { ok: false, erro: 'uma consulta por vez (sem ";" no meio)' };
  if (!/^\s*\(*\s*(select|with)\b/i.test(limpo)) return { ok: false, erro: 'só SELECT (ou WITH … SELECT) é permitido' };
  const p = limpo.match(PROIBIDAS);
  if (p) return { ok: false, erro: `"${p[0].toLowerCase()}" não é permitido (o mapeamento só lê)` };
  if (/\bfor\s+update\b/i.test(limpo)) return { ok: false, erro: '"for update" não é permitido' };
  if (/\b(dbms_|utl_|sys\.dbms|httpuritype|dbms_scheduler)\w*/i.test(limpo)) return { ok: false, erro: 'pacotes DBMS_/UTL_ não são permitidos' };
  if (limpo.includes('@')) return { ok: false, erro: 'link de banco (@) não é permitido' };
  if (/\/\*|\*\//.test(limpo)) return { ok: false, erro: 'comentário aberto na consulta' };
  return { ok: true, sql: s };
}
const idDe = (sql) => crypto.createHash('sha1').update(String(sql).replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex').slice(0, 8);

// Divide um arquivo de consultas em instruções (";" fora de strings e comentários).
function dividir(texto) {
  const out = []; let atual = '', i = 0;
  const t = String(texto);
  while (i < t.length) {
    const c = t[i];
    if (c === "'") { const m = t.slice(i).match(/^'(?:[^']|'')*'/); const x = m ? m[0] : c; atual += x; i += x.length; continue; }
    if (c === '-' && t[i + 1] === '-') { const fim = t.indexOf('\n', i); const x = t.slice(i, fim < 0 ? t.length : fim); atual += x; i += x.length; continue; }
    if (c === '/' && t[i + 1] === '*') { const fim = t.indexOf('*/', i + 2); const x = t.slice(i, fim < 0 ? t.length : fim + 2); atual += x; i += x.length; continue; }
    if (c === ';') { if (limparSql(atual).trim()) out.push(atual.trim()); atual = ''; i++; continue; }
    atual += c; i++;
  }
  if (limparSql(atual).trim()) out.push(atual.trim());
  return out;
}

// ── Máscara de colunas pessoais ──
function sensivel(coluna, termos) {
  const n = String(coluna).toLowerCase(), tokens = n.split(/[^a-z0-9]+/).filter(Boolean);
  return termos.some((t) => { const x = String(t).toLowerCase().trim(); return x && (x.includes('_') ? n.includes(x) : tokens.includes(x)); });
}
function mascarar(itens, termos) {
  const mascaradas = new Set();
  const novos = itens.map((it) => {
    const o = {};
    for (const [k, v] of Object.entries(it)) { if (sensivel(k, termos)) { mascaradas.add(k); o[k] = '***'; } else o[k] = v; }
    return o;
  });
  return { itens: novos, mascaradas: [...mascaradas] };
}

// ── SQLcl ──
function acharSqlcl(configurado) {
  const lista = [configurado, path.join(os.homedir(), 'sqlcl', 'bin', 'sql'), '/opt/sqlcl/bin/sql', '/usr/local/bin/sql'].filter(Boolean);
  const achado = lista.find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; } });
  if (achado) return achado;
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, 'sql');
    try { if (fs.statSync(p).isFile() && /sqlcl/i.test(fs.realpathSync(p))) return p; } catch {}
  }
  return null;
}
function javaHome() {
  if (process.env.MAPA_DB_JAVA_HOME) return process.env.MAPA_DB_JAVA_HOME;
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  for (const p of ['/usr/lib/jvm/java-17-openjdk-amd64', '/usr/lib/jvm/java-21-openjdk-amd64', '/usr/lib/jvm/default-java']) if (fs.existsSync(p)) return p;
  return null;
}

// Roda um script no SQLcl (stdin) e devolve o texto. timeout em ms.
function rodarSqlcl(sqlcl, script, timeoutMs) {
  return new Promise((ok) => {
    const env = { ...process.env, ...(javaHome() ? { JAVA_HOME: javaHome() } : {}) };
    const p = spawn(sqlcl, ['-S', '-L', '/nolog'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', estourou = false;
    const t = setTimeout(() => { estourou = true; p.kill('SIGKILL'); }, timeoutMs);
    p.stdout.on('data', (b) => { out += b; });
    p.stderr.on('data', (b) => { err += b; });
    p.on('error', (e) => { clearTimeout(t); ok({ out, erro: `não consegui rodar o SQLcl: ${e.message}`, estourou }); });
    p.on('close', () => { clearTimeout(t); ok({ out, erro: err.trim() || null, estourou }); });
    p.stdin.end(script);
  });
}

// "<<<id>>>" seguido do resultado: JSON do SQLcl ou mensagem de erro (ORA-/SP2-).
function lerSecoes(saida) {
  const partes = String(saida).split(/<<<([A-Za-z0-9:_-]+)>>>/);
  const r = {};
  for (let i = 1; i < partes.length; i += 2) r[partes[i]] = partes[i + 1].trim();
  return r;
}
function lerJson(txt) {
  const m = txt.match(/\{"results":[\s\S]*\}\s*$/);
  if (!m) return null;
  try {
    const r = JSON.parse(m[0]).results[0];
    return { colunas: (r.columns || []).map((c) => c.name), itens: r.items || [] };
  } catch { return null; }
}
// Mensagem de erro do SQLcl/Oracle. Na falha de conexão junta "Connection Failed" com a linha do ORA- que explica o motivo.
const erroOra = (txt) => {
  const ora = (txt.match(/(ORA-\d+[^\n]*|SP2-\d+[^\n]*|IO Error[^\n]*|Erro[^\n]*)/) || [])[0];
  const falha = /Connection Failed/i.test(txt) ? 'Connection Failed' : null;
  return [falha, ora].filter(Boolean).join(': ') || null;
};

// Consultas já validadas → resultados. cfg: { conexao, ambiente, sqlcl, sensiveis, limite, log, timeoutMs }
async function rodar(cfg, consultas) {
  if (!cfg.conexao) return { erro: 'nenhuma conexão de banco configurada (⚙ Configurações → Banco de dados)' };
  if (cfg.ambiente === 'producao') return { erro: 'a conexão está marcada como PRODUÇÃO: o mapeamento não consulta produção (use a cópia de produção)' };
  if (!AMBIENTES[cfg.ambiente]) return { erro: 'ambiente da conexão não definido (cópia de produção ou QAS) em ⚙ Configurações → Banco de dados' };
  const sqlcl = acharSqlcl(cfg.sqlcl);
  if (!sqlcl) return { erro: 'SQLcl não encontrado (configure o caminho em ⚙ Configurações → Banco de dados)' };
  const limite = Math.min(Math.max(1, Number(cfg.limite) || LIMITE_PADRAO), 200);
  const termos = cfg.sensiveis?.length ? cfg.sensiveis : SENSIVEIS_PADRAO;
  const itens = consultas.map((s) => ({ ...validar(s), original: s })).map((v) => ({ ...v, id: idDe(v.sql || v.original) }));
  const validas = itens.filter((v) => v.ok);
  const nome = String(cfg.conexao).replace(/[^\w .-]/g, '');
  const script = [`connect -name ${nome}`, 'set sqlformat json', 'set feedback off', 'set timing off', 'prompt <<<RO>>>', 'set transaction read only;',
    'prompt <<<BASE>>>', 'select global_name from global_name;',
    ...validas.flatMap((v) => [`prompt <<<${v.id}>>>`, `select * from (${v.sql}) fetch first ${limite} rows only;`]), 'exit', ''].join('\n');
  const t0 = Date.now();
  const r = await rodarSqlcl(sqlcl, script, cfg.timeoutMs || (30000 + 10000 * validas.length));
  const secoes = lerSecoes(r.out);
  const base = lerJson(secoes.BASE || '')?.itens?.[0]?.global_name || null;
  // A sessão SÓ LEITURA precisa ter aberto: se o SQLcl devolveu erro nessa linha, nada roda (proteção em dobro além da validação).
  if (secoes.RO !== undefined && erroOra(secoes.RO)) return { erro: `não consegui abrir a sessão somente leitura (${erroOra(secoes.RO).slice(0, 120)}): nenhuma consulta foi executada` };
  if (secoes.BASE !== undefined && !base) return { erro: 'não li o nome do banco: resposta inesperada do SQLcl, nenhuma consulta foi executada' };
  if (!base && !secoes.BASE) {
    const e = erroOra(r.out) || r.erro || (r.estourou ? 'tempo esgotado ao conectar' : 'não consegui conectar');
    return { erro: `conexão "${nome}" falhou: ${e.slice(0, 200)}` };
  }
  const resultados = itens.map((v) => {
    if (!v.ok) return { id: v.id, sql: v.original, ok: false, erro: v.erro, linhas: 0, ms: 0 };
    const txt = secoes[v.id];
    if (txt === undefined) return { id: v.id, sql: v.sql, ok: false, erro: r.estourou ? 'tempo esgotado' : 'sem resposta do SQLcl', linhas: 0, ms: 0 };
    const j = lerJson(txt);
    if (!j) return { id: v.id, sql: v.sql, ok: false, erro: (erroOra(txt) || txt.split('\n')[0] || 'resposta inesperada').slice(0, 200), linhas: 0, ms: 0 };
    const m = mascarar(j.itens, termos);
    return { id: v.id, sql: v.sql, ok: true, colunas: j.colunas.map((c) => c.toLowerCase()), itens: m.itens, mascaradas: m.mascaradas, linhas: j.itens.length, cortado: j.itens.length >= limite, ms: 0 };
  });
  const ms = Date.now() - t0;
  resultados.forEach((x) => { x.ms = Math.round(ms / Math.max(1, validas.length)); });
  if (cfg.log) {
    try {
      for (const x of resultados) fs.appendFileSync(cfg.log, JSON.stringify({ em: new Date().toISOString(), id: x.id, base, conexao: cfg.conexao, ambiente: cfg.ambiente,
        consulta: x.sql.replace(/\s+/g, ' ').slice(0, 2000), ok: x.ok, linhas: x.linhas, erro: x.erro || null, mascaradas: x.mascaradas || [] }) + '\n');
    } catch {}
  }
  return { base, resultados, limite };
}

// Texto para o Claude ler: cabeçalho com o id [db:xxxxxxxx] (é ele que o handoff cita) e as linhas como tabela simples.
function formatar(res, cfg = {}) {
  if (res.erro) return `mapa-db: ${res.erro}`;
  const txt = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(/\s+/g, ' ').slice(0, 80);
  return res.resultados.map((x) => {
    if (!x.ok) return `[db:${x.id}] ERRO: ${x.erro}`;
    const cab = `[db:${x.id}] ${x.linhas} linha(s)${x.cortado ? ` (cortado em ${res.limite})` : ''} · ${res.base || '?'} (${AMBIENTES[cfg.ambiente] || cfg.ambiente})${x.mascaradas.length ? ` · mascaradas: ${x.mascaradas.join(', ')}` : ''}`;
    const cols = x.colunas;
    const linhas = x.itens.map((it) => cols.map((c) => txt(it[c])).join(' | '));
    return [cab, cols.join(' | '), ...linhas].join('\n');
  }).join('\n\n');
}

// ── Detecção das conexões da máquina (sem IA: leitura de arquivos) ──
function detectar(home = os.homedir()) {
  const lista = [];
  const raiz = path.join(home, '.dbtools', 'connections');
  let dirs = [];
  try { dirs = fs.readdirSync(raiz); } catch {}
  for (const d of dirs) {
    try {
      const props = Object.fromEntries(fs.readFileSync(path.join(raiz, d, 'dbtools.properties'), 'utf8').split('\n')
        .map((l) => l.replace(/\\:/g, ':').replace(/\\=/g, '=')).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
      if (!props.name || !/oracle/i.test(props.type || 'oracle')) continue;
      lista.push({ nome: props.name, origem: 'sqlcl', conexao: props.connectionString || '', usuario: props.userName || '', usavel: true });
    } catch {}
  }
  const tns = [process.env.TNS_ADMIN && path.join(process.env.TNS_ADMIN, 'tnsnames.ora'), path.join(home, '.oracle', 'tnsnames.ora')].filter(Boolean);
  for (const f of tns) {
    try {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/^([A-Za-z0-9_.-]+)\s*=\s*\(/gm)) {
        if (!lista.some((x) => x.nome.toLowerCase() === m[1].toLowerCase())) lista.push({ nome: m[1], origem: 'tnsnames', conexao: m[1], usuario: '', usavel: false });
      }
    } catch {}
  }
  return lista;
}

// Teste da conexão para a tela de configurações: base, versão e se o usuário consegue escrever (aviso, não bloqueio).
async function testar(cfg) {
  const consultas = [
    "select banner from v$version where banner like 'Oracle%'",
    'select count(*) as tabelas_proprias from user_tables',
    "select count(*) as privilegios_escrita from session_privs where privilege in ('INSERT ANY TABLE','UPDATE ANY TABLE','DELETE ANY TABLE','DROP ANY TABLE','CREATE ANY TABLE')",
    "select count(*) as grants_escrita from user_tab_privs_recd where privilege in ('INSERT','UPDATE','DELETE')"
  ];
  const t0 = Date.now();
  const r = await rodar({ ...cfg, log: null }, consultas);
  if (r.erro) return { ok: false, curto: 'falhou', texto: r.erro };
  const v = (i, c) => Number(r.resultados[i]?.itens?.[0]?.[c] ?? 0);
  const banner = r.resultados[0]?.itens?.[0]?.banner || '';
  const escreve = v(1, 'tabelas_proprias') > 0 || v(2, 'privilegios_escrita') > 0 || v(3, 'grants_escrita') > 0;
  return { ok: true, base: r.base, ms: Date.now() - t0, escreve,
    texto: `${r.base} · ${banner.replace(/^Oracle Database\s*/, '').slice(0, 60)} · ${Math.round((Date.now() - t0) / 100) / 10} s`,
    aviso: escreve ? 'Este usuário pode alterar dados (é dono de tabelas ou tem permissão de escrita). O mapa só executa SELECT, mas o ideal é um usuário só de leitura.' : '' };
}

// Cria uma conexão salva no SQLcl (a senha vai pelo stdin, cifrada pelo próprio SQLcl; nunca em argumento nem em log).
async function criarConexao({ sqlcl, nome, alvo, usuario, senha }) {
  if (!/^[\w .-]{2,40}$/.test(nome) || !/^[\w.-]+:\d+\/[\w.-]+$/.test(alvo) || !/^[\w$#]{1,30}$/.test(usuario)) return { ok: false, erro: 'dados inválidos' };
  const r = await rodarSqlcl(sqlcl, `connect -save "${nome}" -savepwd ${usuario}/"${String(senha).replace(/"/g, '')}"@${alvo}\nexit\n`, 60000);
  if (!detectar().some((c) => c.nome === nome)) return { ok: false, erro: (erroOra(r.out) || r.erro || 'o SQLcl não salvou a conexão').slice(0, 200) };
  return { ok: true };
}

module.exports = { criarConexao, AMBIENTES, SENSIVEIS_PADRAO, LIMITE_PADRAO, validar, dividir, mascarar, sensivel, idDe, acharSqlcl, rodar, formatar, detectar, testar, lerSecoes, lerJson };
