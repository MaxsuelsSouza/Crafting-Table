// @ts-check
// Ambiente aparelho: coletor Android físico (Zebra) por USB ou Wi-Fi. Serial obrigatório (craftingTable.aparelhoSerial), sem boot de AVD,
// adb reverse das portas e o app precisa estar instalado. Jornada, bipe e vídeo iguais aos do emulador (android/), no serial dele.
// Contrato: infra/ambientes/index.js.
const { subir } = require('./subir');
const { baseAndroid, requisitosAndroid } = require('../android/base');

// WMS_ADB_SERIAL: o jeito antigo de nomear o aparelho (antes da configuração); vale só se a configuração estiver vazia.
const serialDe = (o = {}) => o.serial || process.env.WMS_ADB_SERIAL || '';

module.exports = {
  nome: 'aparelho',
  rotulo: 'aparelho',
  ...baseAndroid({
    serialGravar: serialDe,
    aparelho: (amb) => `aparelho ${amb.serial || serialDe()} conectado (adb reverse)`
  }),
  requisitos: (ctx = {}) => [
    ...requisitosAndroid(ctx),
    ...(serialDe(ctx) ? [] : ['sem o serial do aparelho (craftingTable.aparelhoSerial)'])
  ],
  subir: (dir, ctx, vivo) => subir(dir, { ...ctx, serial: serialDe(ctx) }, vivo),
  serialDe
};
