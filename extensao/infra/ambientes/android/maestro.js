// @ts-check
// Etapa flow no Android: roda um flow do Maestro no aparelho da vez. Movido de janelas/qa/etapas/06-execucao/dependencias.js.
// saidaTeste: prints e debug do Maestro direto na pasta do cenário (sem varrer ~/.maestro/tests).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { rodar, serialDe } = require('./adb');

const maestroBin = () =>
  [path.join(os.homedir(), '.maestro', 'bin', 'maestro'), 'C:/maestro/bin/maestro.bat'].find((f) => fs.existsSync(f)) ||
  'maestro';

/** @returns {Promise<{ rc: number, saida: string }>} */
const flow = async (arquivo, env, { junit, cwd, saidaTeste }, ctx = {}) =>
  rodar(
    maestroBin(),
    [
      '--device',
      await serialDe(ctx),
      'test',
      '--format',
      'junit',
      '--output',
      junit,
      ...(saidaTeste ? ['--test-output-dir', saidaTeste, '--debug-output', saidaTeste, '--flatten-debug-output'] : []),
      ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
      arquivo
    ],
    { cwd }
  );

module.exports = { maestroBin, flow };
