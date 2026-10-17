// @ts-check
// Partes do contrato comuns aos ambientes Android (emulador e aparelho): papéis, saúde, etapas flow (Maestro) e bipe (DataWedge),
// validação do flow, evidências (screenrecord + prints do Maestro), ferramentas da IA, texto e guia dos prompts.
// Usado por: infra/ambientes/emulador/index.js e aparelho/index.js (cada um acrescenta nome, requisitos, subir e o aparelho do texto).
const fs = require('fs');
const { ADB } = require('./adb');
const { maestroBin, flow } = require('./maestro');
const { bipe } = require('./bipe');
const { errosDoFlow } = require('./flow');
const { evidencia } = require('./evidencia');
const { PAPEIS } = require('../aplicacao/papeis');
const { saude } = require('../aplicacao/saude');
const { noPath } = require('../aplicacao/rodar');

/** adb e Maestro na máquina (o que falta, em texto). */
const requisitosAndroid = (ctx = {}) => [
  ...(fs.existsSync(ctx.adb || ADB) || noPath('adb') ? [] : [`adb não encontrado (${ctx.adb || ADB}): instale o Android SDK platform-tools`]),
  ...(maestroBin() !== 'maestro' || noPath('maestro') ? [] : ['Maestro não encontrado (~/.maestro/bin/maestro): instale o Maestro'])
];

/** @param {{ serialGravar: (o: any) => string, aparelho: (amb: any) => string }} o */
const baseAndroid = ({ serialGravar, aparelho }) => ({
  plataforma: 'android',
  papeis: ['api', 'metro'],
  saude: () => saude(['api', 'metro']),
  etapas: { flow, bipe },
  validarFlow: errosDoFlow,
  evidencia: evidencia(serialGravar),
  ferramentas: ['Bash(adb:*)', 'Bash(maestro:*)'],
  texto: (amb = {}) => `API http://localhost:${PAPEIS.api.porta} · Metro ${PAPEIS.metro.porta} · ${aparelho(amb)}`,
  guia: () => 'Pode abrir o app (maestro hierarchy, adb) para achar seletores',
  comoPrint: (arquivo, amb = {}) => `adb${amb.serial ? ` -s ${amb.serial}` : ''} exec-out screencap -p > ${arquivo}`
});

module.exports = { baseAndroid, requisitosAndroid };
