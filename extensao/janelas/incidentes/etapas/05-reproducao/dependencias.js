// @ts-check
// Dependências reais da etapa 5 (VS Code): comandos, o ambiente do ticket (infra/ambientes) e o emulador, banco (SQLcl), o Claude e a gravação de tela.
// Os testes injetam as suas; qualquer chave passada por `d` em executar vence.
const path = require('path');
const maestro = require('../../../../infra/agentes/maestro');
const banco = require('../../../../infra/plugins/mapa/lib/banco');
const vagas = require('../../../../infra/agentes/etapas');
const { FERRAMENTAS } = require('./regras/ferramentas');
const ambientes = require('../../../../infra/ambientes');

const { esperar } = require('../../../../infra/ambientes/aplicacao/portas');
const esperarPadrao = (teste, segundos) => esperar(teste, segundos);

// Dependências reais (VS Code). Os testes injetam as suas; qualquer chave passada por `d` vence.
function depsPadrao(s, t, dir) {
  const { cfg } = require('../../../../configuracao/configuracao'),
    { ADB: adb } = require('../../../../infra/ambientes/android/adb');
  const cmds = () => require('../../../../modulos/comandos').api;
  // Ambiente do ticket (infra/ambientes/escolher.js): camada dos repositórios → craftingTable.ambientePadrao.
  const ambiente = ambientes.escolher({ repos: s.reposDe?.(t) || [], padrao: cfg().get('ambientePadrao') }),
    amb = ambientes.obter(ambiente);
  return {
    ambiente,
    avd: cfg().get('avdPadrao'),
    serial: cfg().get('aparelhoSerial') || '',
    webUrl: cfg().get('webUrl') || '',
    comandos: {
      lista: () => cmds()?.lista() || [],
      rodar: (nome) => {
        const b = cmds()
          ?.lista()
          .find((x) => x.nome === nome);
        if (b && !b.rodando) cmds().alternar({ id: b.id });
      }
    },
    // emulador (AVD, boot), portas, Metro (/status) e app instalado: os padrões de infra/ambientes (os testes injetam os seus)
    esperar: esperarPadrao,
    banco: {
      conexao: cfg().get('bancoConexao') || '',
      ambiente: cfg().get('bancoAmbiente') || '',
      sqlcl: cfg().get('bancoSqlcl')
    },
    executarSql: async (sql) => {
      const b = cfg(),
        conexao = String(b.get('bancoConexao') || '').replace(/[^\w .-]/g, ''),
        sqlcl = banco.acharSqlcl(b.get('bancoSqlcl'));
      if (!conexao || !sqlcl) return { ok: false, saida: 'banco não configurado (Configurações → Banco de dados)' };
      const r = await banco.rodarSqlcl(
        sqlcl,
        [
          `connect -name ${conexao}`,
          'set feedback on',
          'whenever sqlerror exit failure rollback',
          sql.trim().replace(/;*\s*$/, ';'),
          'commit;',
          'exit',
          ''
        ].join('\n'),
        120000
      );
      const saida = `${r.out}\n${r.erro || ''}`.trim();
      return { ok: !r.estourou && !/ORA-\d|SP2-\d/.test(saida), saida };
    },
    claude: (opts) =>
      new Promise((ok) => {
        const mapa = vagas.raiz('incidentes.mapa') || '';
        const extras = [
          '--settings',
          JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }),
          '--add-dir',
          dir,
          ...(cfg().get('modelo') ? ['--model', cfg().get('modelo')] : [])
        ];
        const foi = maestro.rodar(dir, {
          ferramentas: FERRAMENTAS(mapa, adb, amb),
          mcp: amb.mcp?.(path.join(dir, 'evidencias')) || null, // web: Playwright MCP gravando vídeo e prints nas evidências
          extras: [...extras, ...vagas.pluginDirs('incidentes.mapa')],
          ...opts,
          env: {
            MERGULHO_DIR: dir,
            MAPA_DB_CONEXAO: cfg().get('bancoConexao') || '',
            MAPA_DB_AMBIENTE: cfg().get('bancoAmbiente') || '',
            MAPA_DB_SQLCL: cfg().get('bancoSqlcl') || '',
            MAPA_DB_SENSIVEIS: (cfg().get('bancoColunasSensiveis') || []).join(','),
            MAPA_DB_LOG: path.join(dir, '.mapa-db.jsonl'),
            ...(opts.env || {})
          },
          aoMudar: () => {
            s.render?.();
            if (!maestro.rodando(dir)) ok(true);
          }
        });
        if (!foi) ok(false);
      }),
    // vídeo da tela pelo ambiente (emulador/aparelho: screenrecord no serial que subiu; web: o Playwright MCP grava)
    gravarTela: (destino, a) => amb.evidencia.gravar(destino, { chave: t.chave, serial: a?.serial }),
    pararTela: () => amb.evidencia.parar(),
    adb
  };
}

module.exports = { depsPadrao, esperarPadrao };
