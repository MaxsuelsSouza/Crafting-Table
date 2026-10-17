// @ts-check
// Dependências reais do ambiente: script da skill (só do QA) e, de infra/ambientes/, git (sha), portas, espera e adb.
const fs = require('fs');
const path = require('path');
const { SKILL_AMB } = require('../../orquestrador/prompt-comum');
const { shaDe } = require('../../../../infra/ambientes/aplicacao/sha');
const { portaAberta, dormir, esperar } = require('../../../../infra/ambientes/aplicacao/portas');
const { adbSaida } = require('../../../../infra/ambientes/android/adb');

const scriptPreparo = (backend) =>
  [
    path.join(backend, 'testes-funcionais', 'preparar-ambiente.py'),
    path.join(SKILL_AMB(), 'assets', 'backend', 'preparar-ambiente.py')
  ].find((f) => fs.existsSync(f)) || null;

module.exports = { scriptPreparo, shaDe, portaAberta, dormir, esperar, adbSaida };
