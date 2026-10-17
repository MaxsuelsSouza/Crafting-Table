// @ts-check
// Sobe o ambiente aparelho (coletor Android físico, USB ou Wi-Fi): sem boot de AVD; o aparelho precisa estar conectado e autorizado,
// com o app do WMS já instalado (a extensão não compila nem instala). Comandos (API, Metro) → adb reverse no serial → app.
// ctx: { serial (craftingTable.aparelhoSerial), comandos, parar?, backend?, adb?, aparelhos?() → [{ serial, estado }], portaAberta?,
//        esperar?, metroStatus?, appInstalado?() }. Devolve o ambiente pronto ou { parou_em, erro }.
const { aparelhos, appDe, reverse } = require('../android/adb');
const { PAPEIS } = require('../aplicacao/papeis');
const { acharComandos } = require('../aplicacao/comandos');
const { shaDe } = require('../aplicacao/sha');
const { subirApiMetro } = require('../android/subir-app');

async function subir(dir, ctx, vivo) {
  const serial = ctx.serial;
  const parar = (parou_em, erro, extra = {}) => {
    vivo('erro', erro);
    return { parou_em, erro, fonte: 'comandos', ...extra };
  };
  if (!serial) return parar('config', 'Sem o serial do aparelho: configure craftingTable.aparelhoSerial (adb devices mostra o serial)');
  const lista = await (ctx.aparelhos || (() => aparelhos(ctx.adb)))(),
    a = lista.find((x) => x.serial === serial);
  if (a?.estado !== 'device')
    return parar(
      'aparelho',
      a
        ? `Aparelho ${serial} está "${a.estado}": desbloqueie e autorize a depuração USB`
        : `Aparelho ${serial} não está conectado (USB, ou adb connect <ip>:5555 no Wi-Fi)`
    );
  vivo('acao', `Aparelho ${serial} conectado`);
  const c = acharComandos(ctx, vivo, ['api', 'metro']);
  if (!('achou' in c)) return c;
  const { achou } = c,
    terminais = [achou.api.nome, achou.metro.nome];
  const f = await subirApiMetro(achou, ctx, vivo);
  if (f) return { ...f, fonte: 'comandos', terminais };
  reverse(ctx.adb, serial, [PAPEIS.api.porta, PAPEIS.metro.porta]);
  const app = await (ctx.appInstalado || (() => appDe(ctx.adb, serial)))();
  if (!app) return parar('app', `App do WMS não instalado no aparelho ${serial}: instale o APK (a extensão não instala)`, { terminais });
  vivo('acao', `Aparelho pronto${typeof app === 'string' ? ` com o app ${app}` : ''}`);
  const backend = achou.api.pasta || ctx.backend,
    mobile = achou.metro.pasta || null;
  return {
    nome: 'aparelho',
    fonte: 'comandos',
    terminais,
    app: typeof app === 'string' ? app : null,
    serial,
    parou_em: null,
    itens: [],
    backend,
    mobile,
    sha: { backend: shaDe(backend), mobile: shaDe(mobile) }
  };
}

module.exports = { subir };
