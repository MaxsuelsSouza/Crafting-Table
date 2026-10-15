// @ts-check
// Banco para a IA em segundo plano: lê a configuração (Configurações > Banco) e entrega o env do mapa-db e o texto do prompt.
// Só leitura via <mapa>/bin/mapa-db, só quando configurado e fora de produção; sem isso a IA não consulta e registra pendência.
const path = require('path');

/** @param {{ get: (k: string) => any }} c */
const daConfig = (c) => ({ conexao: c.get('bancoConexao') || '', ambiente: c.get('bancoAmbiente') || '', sqlcl: c.get('bancoSqlcl') || '', sensiveis: c.get('bancoColunasSensiveis') || [] });
const liberado = (b) => !!(b.conexao && b.ambiente && b.ambiente !== 'producao');
const texto = (b) => (liberado(b) ? `configurado (${b.ambiente === 'qas' ? 'QAS' : 'cópia de produção'}): mapa-db, só leitura` : 'NÃO configurado: não consulte banco; registre como pendência');
/** Variáveis que o mapa-db lê; log em <dir>/.mapa-db.jsonl. */
const env = (b, dir) => ({ MAPA_DB_CONEXAO: b.conexao, MAPA_DB_AMBIENTE: b.ambiente, MAPA_DB_SQLCL: b.sqlcl, MAPA_DB_SENSIVEIS: b.sensiveis.join(','), MAPA_DB_LOG: path.join(dir, '.mapa-db.jsonl') });

module.exports = { daConfig, liberado, texto, env };
