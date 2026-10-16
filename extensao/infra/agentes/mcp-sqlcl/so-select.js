#!/usr/bin/env node
// @ts-check
// Hook PreToolUse da sessão da IA (claude.js): o MCP do SQLcl aceita qualquer SQL; aqui só passa, na conexão configurada (QA_DB_CONEXAO):
//   SELECT validado (a mesma regra do mapa-db); tabela já registrada nos conhecimentos volta pronta, sem ir ao dicionário
//   UPDATE de UMA instrução e SEMPRE com WHERE de verdade (1=1 e afins são recusados), e o COMMIT que vem depois; vai para o log
//     de escritas (QA_LOG_SQL), que o relatório lista. INSERT, DELETE, MERGE, DDL, PL/SQL e db link: recusados.
// Saída 2 = recusado; o motivo vai para a IA.
const fs = require('fs');
const lib = require('../../plugins/mapa/lib/banco');

// Consulta ao dicionário (ALL_TAB_COLUMNS…) de tabela que já está nos conhecimentos (CT_CONHECIMENTOS = arquivo .json): devolve o item.
function jaConhecida(sql) {
  if (!process.env.CT_CONHECIMENTOS || !/\b(all|user|dba)_(tab_columns|tables|constraints|cons_columns|col_comments)\b/i.test(sql)) return null;
  if (/column_name\s*(=|like|in\b)/i.test(sql)) return null; // coluna específica que o registro não tem: deixa consultar
  const nomes = [...String(sql).matchAll(/table_name\s*(?:=|like|in\s*\()\s*'([\w$#%]+)'/gi)].map((m) => m[1].toUpperCase().replace(/%/g, ''));
  if (nomes.length !== 1) return null;
  let itens = [];
  try { itens = JSON.parse(fs.readFileSync(process.env.CT_CONHECIMENTOS, 'utf8')).itens || []; } catch { return null; }
  return itens.find((i) => i.tipo === 'tabela' && String(i.chave).toUpperCase().split('.').pop() === nomes[0]) || null;
}

// UPDATE de uma instrução com WHERE que filtra algo (não tautologia); nada de DDL, PL/SQL, db link nem pacote DBMS_/UTL_.
const PROIBIDAS_UPDATE = /\b(insert|delete|merge|drop|alter|create|truncate|grant|revoke|begin|declare|call|execute|exec|commit|rollback|savepoint|lock|rename|purge|flashback|connect|spool|host|start|copy)\b/i;
function validarUpdate(sql) {
  const partes = lib.dividir(String(sql || ''));
  if (partes.length !== 1) return 'um UPDATE por chamada';
  const l = lib.limparSql(partes[0]).trim();
  if (!/^update\b/i.test(l)) return 'só SELECT ou UPDATE (INSERT, DELETE, MERGE e DDL não)';
  const where = l.match(/\bwhere\b([\s\S]*)$/i);
  if (!where) return 'UPDATE sem WHERE';
  if (/^\s*(\(?\s*(\d+|'')\s*=\s*(\d+|'')\s*\)?\s*)$/i.test(where[1]) || !/[a-z_]\w*\s*(=|in\b|<|>|like\b|between\b|is\b)/i.test(where[1]))
    return 'o WHERE precisa filtrar por coluna (pela chave do registro), não por 1=1';
  const p = l.match(PROIBIDAS_UPDATE);
  if (p) return `"${p[0].toLowerCase()}" não é permitido no UPDATE`;
  if (l.includes('@') || /\b(dbms_|utl_)\w*/i.test(l)) return 'link de banco e pacotes DBMS_/UTL_ não são permitidos';
  return '';
}
const registrar = (sql) => {
  if (!process.env.QA_LOG_SQL) return;
  try {
    fs.appendFileSync(process.env.QA_LOG_SQL, JSON.stringify({ em: new Date().toISOString(), tipo: 'aplicar', via: 'ia-mcp', ok: true, sql: [String(sql).trim()], desfazer: [] }) + '\n');
  } catch {}
};

let entrada = '';
process.stdin.on('data', (b) => { entrada += b; });
process.stdin.on('end', () => {
  try {
    decidir();
  } catch (err) {
    // fechado: hook com erro recusa (saída 1 o Claude Code trataria como "segue")
    process.stderr.write(`Recusado pela extensão: o filtro de SQL falhou (${err.message})`);
    process.exit(2);
  }
});
function decidir() {
  let e = {};
  try { e = JSON.parse(entrada); } catch { process.exit(0); }
  const recusar = (motivo) => { process.stderr.write(`Recusado pela extensão: ${motivo}`); process.exit(2); };
  const nome = String(e.tool_name || ''), args = e.tool_input || {};
  if (nome.endsWith('__connect')) {
    const ok = process.env.QA_DB_CONEXAO || '';
    if (args.connection_name !== ok) recusar(`conecte só em "${ok}" (a conexão configurada para o QA)`);
  } else if (nome.endsWith('__sql_run')) {
    const v = lib.validar(args.sql);
    if (!v.ok) {
      if (/^\s*commit\s*;?\s*$/i.test(String(args.sql || ''))) process.exit(0); // fecha o UPDATE (a sessão do MCP não faz autocommit)
      const erro = validarUpdate(args.sql);
      if (erro) recusar(`${erro}. Leitura: SELECT; escrita: só UPDATE com WHERE pela chave do registro.`);
      registrar(args.sql);
      process.exit(0);
    }
    const k = jaConhecida(args.sql);
    if (k) recusar(`a tabela ${k.chave} já está nos Conhecimentos (${k.id}), não consulte o dicionário de novo:\n${k.conteudo}\n(Falta uma coluna? Consulte filtrando por column_name e atualize o registro com conhecimento add.)`);
  } else if (nome.startsWith('mcp__sqlcl__') && !nome.endsWith('__schema_information') && !nome.endsWith('__connections_list')) {
    recusar(`${nome} não é permitido no QA (use connect, sql_run e schema_information)`);
  }
  process.exit(0);
}
