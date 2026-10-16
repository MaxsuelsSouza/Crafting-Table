// @ts-check
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const { lerJson, gravarJson, estado, mudar } = require('../../estado');
const { registrarPausa } = require('../../orquestrador/pausa');
const { massa, massaAdd, massaEstado } = require('./estado');

// ── Massa por SQL: a IA PROPÕE o lote (qa-state massa proposta); você lê e aprova no cartão; a extensão executa numa transação só e registra a massa.
// Nada de escrita sai da IA: só o lote aprovado, pela conexão configurada, nunca produção. O SQL de desfazer fica no item da massa.
const PROPOSTA = '.massa-proposta.json',
  LOG_SQL = '.massa-sql.log.jsonl';
const propostaMassa = (dir) => lerJson(path.join(dir, PROPOSTA), null);
function proporMassa(dir, { papel, cenarios: cens = [], dados = {}, sql, desfazer, porque = '' }) {
  const b = require('./regras/sql'),
    v = b.validarAlteracao(sql),
    u = b.validarAlteracao(desfazer);
  if (!v.ok) throw new Error(`--sql recusado: ${v.erro}`);
  if (!u.ok) throw new Error(`--desfazer obrigatório e válido: ${u.erro}`);
  if (!cens.length) throw new Error('--cenarios é obrigatório');
  if (estado(dir).massaFase === 'produzir' && v.stmts.some((x) => !/^\s*update\b/i.test(x)))
    throw new Error(
      '--sql recusado: na fase de produzir a massa só vale UPDATE (com WHERE); se não der, use massa desistir'
    );
  const p = {
    papel: papel || '',
    cenarios: cens,
    dados,
    sql: v.stmts,
    desfazer: u.stmts,
    porque: String(porque).trim(),
    em: new Date().toISOString()
  };
  gravarJson(path.join(dir, PROPOSTA), p);
  registrarPausa(dir, {
    motivo: 'massa-sql',
    pergunta: `Alterar o banco para montar a massa de ${cens.join(', ')}? Leia o SQL abaixo antes de aprovar.`,
    opcoes: ['Aprovar e executar', 'Recusar'],
    etapa: 'Massa',
    detalhe: p.porque
  });
  return p;
}
const logSql = (dir, o) => {
  try {
    fs.appendFileSync(path.join(dir, LOG_SQL), `${JSON.stringify({ em: new Date().toISOString(), ...o })}\n`);
  } catch {
    /* o log não derruba o fluxo */
  }
};
/** Executa o lote aprovado. d: { banco, executarSql(banco, stmts) }. Erro: nada é gravado (rollback) e a pausa vira pergunta com as saídas. */
async function aplicarProposta(dir, d) {
  const p = propostaMassa(dir);
  if (!p) return { ok: false, erro: 'não há proposta de massa' };
  const b = d.banco || {},
    vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const r = await (d.executarSql || require('./dependencias').executar)(b, p.sql);
  logSql(dir, {
    tipo: 'aplicar',
    conexao: b.conexao || '',
    ambiente: b.ambiente || '',
    cenarios: p.cenarios,
    sql: p.sql,
    desfazer: p.desfazer,
    ok: r.ok,
    saida: String(r.saida || '').slice(0, 500)
  });
  if (!r.ok) {
    vivo('erro', `A alteração de massa falhou (nada foi gravado): ${String(r.saida).split('\n')[0].slice(0, 160)}`);
    mudar(dir, {
      pausa: {
        motivo: 'massa-sql-erro',
        pergunta: `O banco recusou o lote e nada foi gravado: ${String(r.saida).slice(0, 300)}`,
        opcoes: ['Tentar de novo', 'Seguir sem essa massa'],
        etapa: 'Massa'
      }
    });
    return { ok: false, erro: r.saida };
  }
  const id = massaAdd(dir, {
    papel: p.papel,
    cenarios: p.cenarios,
    dados: p.dados,
    consulta: p.sql.join(';\n'),
    origem: 'sql',
    desfazer: p.desfazer
  });
  fs.rmSync(path.join(dir, PROPOSTA), { force: true });
  mudar(dir, { pausa: null });
  vivo(
    'fim',
    `Massa ${id} montada por SQL (${p.sql.length} instrução(ões)) para ${p.cenarios.join(', ')}; o SQL de desfazer está na aba Massa`
  );
  return { ok: true, id };
}
function recusarProposta(dir) {
  fs.rmSync(path.join(dir, PROPOSTA), { force: true });
  logSql(dir, { tipo: 'recusar' });
  mudar(dir, { pausa: null });
}
/** Desfaz a alteração de um item de massa montado por SQL (o humano confirma antes). */
async function desfazerMassa(dir, id, d) {
  const m = massa(dir),
    i = m.itens.find((x) => x.id === id);
  if (!i?.desfazer?.length) throw new Error(`massa ${id} não tem SQL de desfazer`);
  const r = await (d.executarSql || require('./dependencias').executar)(d.banco || {}, i.desfazer);
  logSql(dir, { tipo: 'desfazer', massa: id, sql: i.desfazer, ok: r.ok, saida: String(r.saida || '').slice(0, 500) });
  if (!r.ok) throw new Error(String(r.saida).split('\n')[0].slice(0, 200) || 'o banco recusou');
  massaEstado(dir, id, 'invalida');
  return true;
}

module.exports = { PROPOSTA, LOG_SQL, propostaMassa, proporMassa, aplicarProposta, recusarProposta, desfazerMassa };
