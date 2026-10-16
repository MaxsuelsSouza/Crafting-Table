// @ts-check
// Consultas só leitura pelo MCP do SQLcl, com o mesmo contrato do mapa-db (lib.rodar): { base, resultados, limite } ou { erro }.
// Mesmas proteções: só SELECT validado, recusa produção, transação somente leitura desfeita no fim, colunas sensíveis mascaradas e log.
const fs = require('fs');
const lib = require('../../plugins/mapa/lib/banco');
const { sessao } = require('./sessao');

/** @param {{ conexao: string, ambiente: string, sqlcl?: string, sensiveis?: string[], limite?: number, log?: string }} cfg */
async function consultar(cfg, consultas) {
  if (!cfg.conexao) return { erro: 'nenhuma conexão de banco configurada (⚙ Configurações → Banco de dados)' };
  if (cfg.ambiente === 'producao') return { erro: 'a conexão está marcada como PRODUÇÃO: o QA não consulta produção' };
  if (!lib.AMBIENTES[cfg.ambiente]) return { erro: 'ambiente da conexão não definido (cópia de produção ou QAS) em ⚙ Configurações → Banco de dados' };
  const limite = Math.min(Math.max(1, Number(cfg.limite) || lib.LIMITE_PADRAO), 200);
  const termos = cfg.sensiveis?.length ? cfg.sensiveis : lib.SENSIVEIS_PADRAO;
  const itens = consultas.map((s) => ({ ...lib.validar(s), original: s })).map((v) => ({ ...v, id: lib.idDe(v.sql || v.original) }));
  const validas = itens.filter((v) => v.ok);
  const script = ['rollback;', 'set transaction read only;', 'set sqlformat json', 'set feedback off', 'prompt <<<BASE>>>', 'select global_name from global_name;',
    ...validas.flatMap((v) => [`prompt <<<${v.id}>>>`, `select * from (${v.sql}) fetch first ${limite} rows only;`]), 'rollback;'].join('\n');
  const t0 = Date.now();
  let saida;
  try {
    const cliente = await sessao(cfg);
    saida = await cliente.chamar('sqlcl_run', { sqlcl: script }, 30000 + 10000 * validas.length);
  } catch (e) {
    return { erro: `MCP do SQLcl: ${e.message}`, mcp: true };
  }
  const secoes = lib.lerSecoes(saida);
  const base = lib.lerJson(secoes.BASE || '')?.itens?.[0]?.global_name || null;
  if (!base) return { erro: 'não li o nome do banco pelo MCP: nenhuma consulta foi considerada', mcp: true };
  const ms = Math.round((Date.now() - t0) / Math.max(1, validas.length));
  const resultados = itens.map((v) => {
    if (!v.ok) return { id: v.id, sql: v.original, ok: false, erro: v.erro, linhas: 0, ms: 0 };
    const txt = secoes[v.id];
    if (txt === undefined) return { id: v.id, sql: v.sql, ok: false, erro: 'sem resposta do MCP', linhas: 0, ms };
    const j = lib.lerJson(txt);
    if (!j) {
      const ora = (txt.match(/(ORA-\d+[^\n]*|SP2-\d+[^\n]*)/) || [])[0];
      return { id: v.id, sql: v.sql, ok: false, erro: (ora || txt.trim().split('\n')[0] || 'resposta inesperada').slice(0, 200), linhas: 0, ms };
    }
    const m = lib.mascarar(j.itens, termos);
    return { id: v.id, sql: v.sql, ok: true, colunas: j.colunas.map((c) => c.toLowerCase()), itens: m.itens, mascaradas: m.mascaradas, linhas: j.itens.length, cortado: j.itens.length >= limite, ms };
  });
  if (cfg.log) {
    try {
      for (const x of resultados) fs.appendFileSync(cfg.log, JSON.stringify({ em: new Date().toISOString(), id: x.id, base, conexao: cfg.conexao, ambiente: cfg.ambiente, via: 'mcp',
        consulta: x.sql.replace(/\s+/g, ' ').slice(0, 2000), ok: x.ok, linhas: x.linhas, erro: x.erro || null, mascaradas: x.mascaradas || [] }) + '\n');
    } catch {}
  }
  return { base, resultados, limite };
}

// O MCP responde e a conexão abre? { ok, base, ms } ou { ok: false, erro }.
async function saude(cfg) {
  const t0 = Date.now();
  const r = await consultar({ ...cfg, log: undefined }, []);
  return r.erro ? { ok: false, erro: r.erro } : { ok: true, base: r.base, ms: Date.now() - t0 };
}

module.exports = { consultar, saude };
