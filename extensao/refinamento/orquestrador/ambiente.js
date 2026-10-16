// @ts-check
// Variáveis de ambiente do mapa-db (banco do mapeamento), lidas das configurações.
const path = require('path');
const { cfg } = require('../../configuracao/configuracao');
const { pasta } = require('../../infra/ticket/pasta-ticket');

// Banco do mapeamento: conexão/ambiente vêm das configurações (o Claude não escolhe a base). Sem isso, mapa-db recusa.
const bancoEnv = (t) => {
  const conexao = cfg().get('bancoConexao') || '',
    ambiente = cfg().get('bancoAmbiente') || '';
  return {
    MAPA_DB_CONEXAO: conexao,
    MAPA_DB_AMBIENTE: ambiente,
    MAPA_DB_SQLCL: cfg().get('bancoSqlcl') || '',
    MAPA_DB_SENSIVEIS: (cfg().get('bancoColunasSensiveis') || []).join(','),
    MAPA_DB_LOG: path.join(pasta(t.chave), '.mapa-db.jsonl')
  };
};

module.exports = { bancoEnv };
