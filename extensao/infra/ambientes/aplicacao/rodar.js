// @ts-check
// Processos de fora (adb, Maestro, npx playwright): rodar sem rejeitar e saber se um binário está no PATH.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

/** Roda um binário e resolve { rc, saida } (nunca rejeita). env: soma ao do processo. */
const rodar = (bin, args, { cwd, timeout = 10 * 60000, env } = /** @type {any} */ ({})) =>
  new Promise((ok) =>
    execFile(
      bin,
      args,
      { cwd, timeout, maxBuffer: 20 * 1024 * 1024, ...(env ? { env: { ...process.env, ...env } } : {}) },
      (err, out, errOut) =>
        ok({ rc: err ? (typeof err.code === 'number' ? err.code : 1) : 0, saida: `${out || ''}${errOut || ''}` })
    )
  );
const noPath = (bin) => (process.env.PATH || '').split(path.delimiter).some((p) => p && fs.existsSync(path.join(p, bin)));

module.exports = { rodar, noPath };
