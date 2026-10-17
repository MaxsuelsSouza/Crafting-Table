// @ts-check
// Um claude -p da etapa 7 (7.1 plano, 7.3 execução) com o mesmo ambiente das outras etapas (banco só leitura, modelo, pastas) e as pastas
// que os bins precisam: IMPLEMENTACAO_DIR (implementacao-gravar) e FLUXO_DIR (reproducao-fluxo, <aba>/teste). Devolve a pausa pedida, se houver.
const path = require('path');
const vagas = require('../../../../infra/agentes/etapas');
const { ambiente } = require('../../orquestrador/ambiente');
const { lerPausa, limparPausa } = require('../../orquestrador/pausa');
const { dirTeste } = require('./arquivos');
const { deps } = require('./dependencias');

/** @returns {Promise<{ pergunta?: string, motivo?: string, opcoes?: string[] } | null>} a pausa pedida pelo Claude (ou null) */
async function rodarClaude(s, t, dir, { prompt, titulo, ferramentas, mcp = null }) {
  const env = ambiente(s, t);
  limparPausa(dir);
  await deps.claude(dir, {
    prompt: prompt + vagas.aviso('impl.mapa'),
    titulo,
    ferramentas,
    mcp,
    env: {
      MAPA_DB_CONEXAO: env.banco.conexao,
      MAPA_DB_AMBIENTE: env.banco.ambiente,
      MAPA_DB_SQLCL: env.banco.sqlcl,
      MAPA_DB_SENSIVEIS: env.banco.sensiveis.join(','),
      MAPA_DB_LOG: path.join(dir, '.mapa-db.jsonl'),
      IMPLEMENTACAO_DIR: dir,
      FLUXO_DIR: dirTeste(dir)
    },
    extras: [
      ...(env.modelo ? ['--model', env.modelo] : []),
      ...vagas.pluginDirs('impl.mapa'),
      '--settings',
      JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }),
      '--add-dir',
      dir,
      '--add-dir',
      s.pasta(t.id),
      ...env.repos.map((r) => r.caminho)
    ],
    aoMudar: () => s.render()
  });
  const p = lerPausa(dir);
  if (p?.pergunta) limparPausa(dir);
  return p?.pergunta ? p : null;
}

module.exports = { rodarClaude };
