// @ts-check
// Dependências reais da etapa 5 (VS Code): comandos, emulador, portas, Metro, app, banco (SQLcl), o Claude e a gravação de tela.
// Os testes injetam as suas; qualquer chave passada por `d` em executar vence.
const path = require('path');
const maestro = require('../../../painel/maestro');
const banco = require('../../../plugins/mapa/lib/banco');
const vagas = require('../../../agentes/etapas');
const { FERRAMENTAS } = require('./regras/ferramentas');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperarPadrao(teste, segundos) {
  for (const fim = Date.now() + segundos * 1000; Date.now() < fim; await dormir(3000)) if (await teste()) return true;
  return teste();
}

// Dependências reais (VS Code). Os testes injetam as suas; qualquer chave passada por `d` vence.
function depsPadrao(s, t, dir) {
  const vscode = require('vscode'),
    { cfg } = require('../../../configuracao/configuracao'),
    emu = require('../../../modulos/emulador');
  const { execFileSync } = require('child_process'),
    adb = path.join(emu.SDK, 'platform-tools', 'adb');
  const adbOut = (a) => {
    try {
      return execFileSync(adb, a, { timeout: 15000 }).toString();
    } catch {
      return '';
    }
  };
  const cmds = () => require('../../../modulos/comandos').api;
  return {
    comandos: {
      lista: () => cmds()?.lista() || [],
      rodar: (nome) => {
        const b = cmds()
          ?.lista()
          .find((x) => x.nome === nome);
        if (b && !b.rodando) cmds().alternar({ id: b.id });
      }
    },
    emulador: {
      aparelhos: () => emu.dispositivos(),
      ligar: () => emu.ligar(cfg().get('avdPadrao')),
      pronto: () => adbOut(['shell', 'getprop', 'sys.boot_completed']).trim() === '1'
    },
    portaAberta: (n) =>
      new Promise((ok) => {
        const sk = require('net').connect(n, '127.0.0.1');
        const fim = (v) => {
          sk.destroy();
          ok(v);
        };
        sk.setTimeout(1500);
        sk.on('connect', () => fim(true));
        sk.on('error', () => fim(false));
        sk.on('timeout', () => fim(false));
      }),
    // Metro de pé = /status responde packager-status:running (porta aberta sozinha não prova).
    metroStatus: async () => {
      try {
        return (await (await fetch('http://127.0.0.1:8081/status')).text()).includes('packager-status:running');
      } catch {
        return false;
      }
    },
    appInstalado: () => /package:br\.com\.ferreiracosta\.wms/.test(adbOut(['shell', 'pm', 'list', 'packages'])),
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
          ferramentas: FERRAMENTAS(mapa, adb),
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
    gravarTela: (destino) => {
      if (emu.emuladorRodando())
        require('../../../modulos/evidencias').gravar?.({ destino, chave: t.chave, continuo: true });
    },
    pararTela: () => require('../../../modulos/evidencias').pararGravacao?.(),
    adb
  };
}

module.exports = { depsPadrao, esperarPadrao };
