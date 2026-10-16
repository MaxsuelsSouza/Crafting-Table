// @ts-check
// Dependências reais do ambiente: script da skill, git, portas, espera e adb.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { SKILL_AMB } = require('../../orquestrador/prompt-comum');

const scriptPreparo = (backend) =>
  [
    path.join(backend, 'testes-funcionais', 'preparar-ambiente.py'),
    path.join(SKILL_AMB(), 'assets', 'backend', 'preparar-ambiente.py')
  ].find((f) => fs.existsSync(f)) || null;
const shaDe = (repo) => {
  try {
    return repo
      ? execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { timeout: 5000 }).toString().trim()
      : null;
  } catch {
    return null;
  }
};
const portaAberta = (n) =>
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
  });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(teste, segundos, parar) {
  for (const fim = Date.now() + segundos * 1000; Date.now() < fim; await dormir(3000)) {
    if (await teste()) return true;
    if (parar()) return false;
  }
  return teste();
}
const adbSaida = (adb, args) => {
  try {
    return execFileSync(adb, args, { timeout: 15000 }).toString();
  } catch {
    return '';
  }
};

module.exports = { scriptPreparo, shaDe, portaAberta, dormir, esperar, adbSaida };
