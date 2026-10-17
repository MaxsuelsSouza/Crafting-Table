// @ts-check
// Ambiente emulador: AVD do Android SDK na máquina (craftingTable.avdPadrao), app do WMS pelo Metro, jornada pelo Maestro.
//   avd.js    AVDs, ligados, ligar, aparelhos do adb, print (lógica que era de modulos/emulador.js)
//   subir.js  Comandos (API, Metro, Start) + boot do AVD + adb reverse + app
// Contrato: infra/ambientes/index.js.
const fs = require('fs');
const avd = require('./avd');
const { subir } = require('./subir');
const { baseAndroid, requisitosAndroid } = require('../android/base');

module.exports = {
  nome: 'emulador',
  rotulo: 'emulador',
  ...baseAndroid({
    serialGravar: (o) => o.serial || avd.emuladorRodando()?.serial || '',
    aparelho: () => 'emulador ligado'
  }),
  requisitos: (ctx = {}) => [
    ...requisitosAndroid(ctx),
    ...(fs.existsSync(avd.EMULATOR) ? [] : [`emulator não encontrado (${avd.EMULATOR}): instale o Android Emulator no SDK`]),
    ...(ctx.avd ? [] : ['nenhum AVD configurado (craftingTable.avdPadrao)'])
  ],
  subir,
  ligado: () => !!avd.emuladorRodando()
};
