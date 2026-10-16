// @ts-check
// Dependências externas da Etapa 6 (a jornada 6.2): Maestro, adb (serial, bipe), banco só leitura, prints do Maestro e ~/.wms-testes.env.
// d = dependências do painel (abas/acoes/dependencias.js): d.adb, d.banco.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { consultar } = require('../05-massa/dependencias');

const rodar = (bin, args, { cwd, timeout = 10 * 60000 } = {}) =>
  new Promise((ok) =>
    execFile(bin, args, { cwd, timeout, maxBuffer: 20 * 1024 * 1024 }, (err, out, errOut) =>
      ok({ rc: err ? (typeof err.code === 'number' ? err.code : 1) : 0, saida: `${out || ''}${errOut || ''}` })
    )
  );

// ~/.wms-testes.env (WMS_ENV_FILE troca o caminho): a sessão vence o arquivo; vazio ou placeholder <…> é ignorado.
function envWms() {
  const arq = process.env.WMS_ENV_FILE || path.join(os.homedir(), '.wms-testes.env'),
    r = {};
  let tx = '';
  try {
    tx = fs.readFileSync(arq, 'utf8');
  } catch {
    /* sem arquivo: só a sessão */
  }
  for (const l of tx.split('\n').map((x) => x.trim())) {
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const [k, ...v] = l.split('='),
      val = v
        .join('=')
        .trim()
        .replace(/^["']|["']$/g, '');
    if (k.trim() && val && !val.startsWith('<')) r[k.trim()] = val;
  }
  const de = (k) => process.env[k] || r[k];
  // O runner passa ao Maestro como MATRICULA, SENHA e APP_ID (subflows/login.yaml da skill).
  return Object.fromEntries(
    [
      ['MATRICULA', de('WMS_API_LOGIN')],
      ['SENHA', de('WMS_API_SENHA')],
      ['APP_ID', de('WMS_APP_ID')]
    ].filter(([, v]) => v)
  );
}

const maestroBin = () =>
  [path.join(os.homedir(), '.maestro', 'bin', 'maestro'), 'C:/maestro/bin/maestro.bat'].find((f) => fs.existsSync(f)) ||
  'maestro';

function jornada(d) {
  const adb = d.adb || 'adb';
  let serial = process.env.WMS_ADB_SERIAL || process.env.ANDROID_SERIAL || '';
  // Aparelho físico só se nomeado (WMS_ADB_SERIAL/ANDROID_SERIAL); senão o primeiro emulador.
  const aparelho = async () =>
    serial || (serial = (await rodar(adb, ['devices'])).saida.match(/^(emulator-\d+)\s+device$/m)?.[1] || '');
  const shell = async (...a) => rodar(adb, ['-s', await aparelho(), 'shell', ...a], { timeout: 30000 });
  return {
    envBase: envWms(),
    maestro: async (arquivo, env, { junit, cwd }) =>
      rodar(
        maestroBin(),
        [
          '--device',
          await aparelho(),
          'test',
          '--format',
          'junit',
          '--output',
          junit,
          ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
          arquivo
        ],
        { cwd }
      ),
    // Código entre aspas simples para o shell do aparelho (espaço e metacaractere quebravam o adb shell da skill); confere a entrega.
    bipe: async (codigo, acao = 'br.com.ferreiracosta.SCANNER') => {
      const x = await shell(
        `am broadcast -a ${acao} --es com.symbol.datawedge.data_string '${codigo.replace(/'/g, `'\\''`)}'`
      );
      return { ok: x.rc === 0 && /Broadcast completed/i.test(x.saida), saida: x.saida };
    },
    esperar: (s) => new Promise((ok) => setTimeout(ok, s * 1000)),
    consultar: async (sql) => {
      const res = await consultar(d.banco, [sql]);
      if (res.erro) return { ok: false, erro: res.erro };
      const x = res.resultados[0];
      return x.ok ? { ok: true, colunas: x.colunas, itens: x.itens, base: res.base } : { ok: false, erro: x.erro };
    },
    // PNGs que o Maestro gravou em ~/.maestro/tests desde o início da jornada.
    prints: (desde) => {
      const raiz = path.join(os.homedir(), '.maestro', 'tests'),
        out = [];
      const andar = (p) => {
        let itens = [];
        try {
          itens = fs.readdirSync(p, { withFileTypes: true });
        } catch {
          return;
        }
        for (const i of itens) {
          const f = path.join(p, i.name);
          if (i.isDirectory()) andar(f);
          else if (/\.png$/i.test(i.name) && fs.statSync(f).mtime >= desde) out.push(f);
        }
      };
      andar(raiz);
      return out;
    }
  };
}

module.exports = { jornada, envWms };
