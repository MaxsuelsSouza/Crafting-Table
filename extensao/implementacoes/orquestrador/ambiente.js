// @ts-check
// Ambiente da esteira: repositórios do ticket, banco (Configurações) e modelo; e o texto do banco no prompt.
const { deps } = require('../dependencias');

const ambiente = (s, t) => {
  const c = deps.cfg(),
    repos = s.reposDe(t);
  return {
    repos,
    banco: {
      conexao: c.get('bancoConexao') || '',
      ambiente: c.get('bancoAmbiente') || '',
      sqlcl: c.get('bancoSqlcl') || '',
      sensiveis: c.get('bancoColunasSensiveis') || []
    },
    modelo: c.get('modelo') || ''
  };
};
const textoBanco = (b) =>
  b.conexao && b.ambiente && b.ambiente !== 'producao'
    ? `configurado (${b.ambiente === 'qas' ? 'QAS' : 'cópia de produção'}): mapa-db, só leitura`
    : 'NÃO configurado: não consulte banco; registre como pendência';

module.exports = { ambiente, textoBanco };
