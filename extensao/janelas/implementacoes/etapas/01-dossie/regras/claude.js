// @ts-check
// Um `claude -p` da Reprodução (1.2, 1.3, 1.5 e o rascunho do pedido de dados) como Promise: resolve true quando o Claude termina e false se
// não deu para começar (já há um rodando na pasta). Banco só leitura (mapa-db), as pastas do ticket e os repositórios entram em --add-dir.
// o: { prompt, titulo, ferramentas, mcp? }.
const path = require('path');
const maestro = require('../../../../../infra/agentes/maestro');
const vagas = require('../../../../../infra/agentes/etapas');
const { ambiente } = require('../../../orquestrador/ambiente');

/** @returns {Promise<boolean>} */
const claude = (s, t, o) =>
  new Promise((ok) => {
    const dir = s.pastaAba(t.id),
      env = ambiente(s, t);
    let terminou = false;
    const foi = maestro.rodar(dir, {
      prompt: o.prompt + vagas.aviso('impl.mapa'),
      titulo: o.titulo,
      ferramentas: o.ferramentas,
      mcp: o.mcp || null,
      env: {
        MAPA_DB_CONEXAO: env.banco.conexao,
        MAPA_DB_AMBIENTE: env.banco.ambiente,
        MAPA_DB_SQLCL: env.banco.sqlcl,
        MAPA_DB_SENSIVEIS: env.banco.sensiveis.join(','),
        MAPA_DB_LOG: path.join(dir, '.mapa-db.jsonl'),
        IMPLEMENTACAO_DIR: dir
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
      aoMudar: () => {
        s.render();
        if (!terminou && !maestro.rodando(dir)) {
          terminou = true;
          ok(true);
        }
      }
    });
    if (!foi) ok(false);
  });

module.exports = { claude };
