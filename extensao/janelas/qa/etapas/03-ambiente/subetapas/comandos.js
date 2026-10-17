// @ts-check
// ── Ambiente pelos Comandos das Configurações: quem sobe é o ambiente do ticket (infra/ambientes: emulador, aparelho ou web; d.ambiente).
// O que já responde na porta não roda de novo. No emulador, falta de Comando (API, Metro) ou app não instalado → null: o script da
// skill completa (ele reaproveita API, Metro e emulador de pé e compila o app). Nos outros ambientes a skill não serve: o que parou fica.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const ambientes = require('../../../../../infra/ambientes');
const { pausado } = require('../../../orquestrador/rodando');
const { LOG_AMB } = require('../estado');

// d → ctx do subir (infra/ambientes/index.js). rodarStart: false, o app ausente é da skill (ela compila no 1º preparo do dia).
const ctxAmbiente = (dir, d) => ({
  comandos: d.comandos,
  parar: () => pausado(dir),
  backend: d.backend,
  avd: d.emulador?.avd,
  emulador: d.emulador,
  adb: d.adb,
  serial: d.serial,
  webUrl: d.webUrl,
  rodarStart: false
});

async function viaComandos(dir, d) {
  const vivo = (tipo, texto) => {
    aoVivo.anotar(dir, { tipo, texto });
    fs.appendFileSync(path.join(dir, LOG_AMB), `[${new Date().toLocaleTimeString('pt-BR')}] ${texto}\n`);
  };
  fs.writeFileSync(
    path.join(dir, LOG_AMB),
    `Ambiente pelos Comandos das Configurações · ${new Date().toISOString()}\n\n`
  );
  const a = ambientes.obter(d.ambiente),
    r = await a.subir(dir, ctxAmbiente(dir, d), vivo);
  // o preparar-ambiente.py da skill só sobe o emulador
  if (r.falta && a.nome === 'emulador') {
    vivo(
      'aviso',
      r.falta === 'app'
        ? 'App do WMS não instalado no emulador: o preparar-ambiente.py da skill compila e instala (reaproveita o que já está de pé)'
        : `${r.erro}: uso o preparar-ambiente.py da skill`
    );
    return null;
  }
  return { nome: a.nome, ...r };
}

module.exports = { viaComandos, ctxAmbiente };
