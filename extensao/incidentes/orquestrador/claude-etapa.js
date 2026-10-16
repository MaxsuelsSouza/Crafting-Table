// @ts-check
// Opções do `claude -p` de uma etapa de 1 a 4 (maestro.rodar): prompt, banco, ferramentas, env do mapa-db, plugins e pastas liberadas.
const path = require('path');
const vagas = require('../../infra/agentes/etapas'); // plugin de cada etapa (Configurações > Plugins)
const { ETAPAS } = require('../etapas');
const { prompt, FERRAMENTAS } = require('../prompt');

const opcoesClaude = ({ s, t, dir, n, ajuste, aoMudar }) => {
  const { cfg } = require('../../configuracao/configuracao');
  const mapa = vagas.raiz('incidentes.mapa') || '',
    conexao = cfg().get('bancoConexao') || '',
    amb = cfg().get('bancoAmbiente') || '';
  const repos = s.reposDe(t),
    banco =
      conexao && amb && amb !== 'producao'
        ? `configurado (${amb === 'qas' ? 'QAS' : 'cópia de produção'}): mapa-db, só leitura`
        : 'NÃO configurado: não consulte banco; registre como pendência';
  return {
    prompt: prompt(t, dir, n, repos, banco, ajuste) + vagas.aviso('incidentes.mapa'),
    titulo: `Mergulho · Etapa ${n}: ${ETAPAS[n - 1].nome}${ajuste ? ' (ajuste)' : ''}`,
    ferramentas: FERRAMENTAS(mapa),
    env: {
      MAPA_DB_CONEXAO: conexao,
      MAPA_DB_AMBIENTE: amb,
      MAPA_DB_SQLCL: cfg().get('bancoSqlcl') || '',
      MAPA_DB_SENSIVEIS: (cfg().get('bancoColunasSensiveis') || []).join(','),
      MAPA_DB_LOG: path.join(dir, '.mapa-db.jsonl'),
      MERGULHO_DIR: dir
    },
    extras: [
      ...(cfg().get('modelo') ? ['--model', cfg().get('modelo')] : []),
      ...vagas.pluginDirs('incidentes.mapa'),
      '--settings',
      JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }),
      '--add-dir',
      dir,
      '--add-dir',
      s.pasta(t.id),
      ...repos.map((r) => r.caminho)
    ],
    aoMudar
  };
};

module.exports = { opcoesClaude };
