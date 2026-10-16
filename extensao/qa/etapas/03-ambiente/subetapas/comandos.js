// @ts-check
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../componentes/ao-vivo');
const { pausado } = require('../../../orquestrador/rodando');
const { LOG_AMB } = require('../estado');
const { PAPEIS, papeisDe } = require('../regras/papeis');
const { portaAberta, esperar, adbSaida } = require('../dependencias');

// ── Ambiente pelos Comandos das Configurações: se lá há um comando que sobe a API e outro que sobe o Metro, eles bastam
// (o que já responde na porta não é rodado de novo); o emulador vem do AVD padrão. Falta comando → script da skill.
// App não instalado → o script da skill completa (ele reaproveita API, Metro e emulador de pé e compila o app).
// Escolha por pontos: nome do botão vale mais que o comando. `yarn/npm start` NÃO conta como Metro: no wms-mobile ele é `yarn android`
// (compila e instala o app), não o bundler.
async function viaComandos(dir, d) {
  const vivo = (tipo, texto) => {
    aoVivo.anotar(dir, { tipo, texto });
    fs.appendFileSync(path.join(dir, LOG_AMB), `[${new Date().toLocaleTimeString('pt-BR')}] ${texto}\n`);
  };
  fs.writeFileSync(
    path.join(dir, LOG_AMB),
    `Ambiente pelos Comandos das Configurações · ${new Date().toISOString()}\n\n`
  );
  const lista = d.comandos?.lista() || [],
    achou = papeisDe(lista);
  vivo(
    'acao',
    lista.length
      ? `Comandos nas Configurações: ${lista.map((b) => b.nome).join(', ')}`
      : 'Nenhum comando cadastrado em Configurações → Comandos'
  );
  const faltam = Object.keys(PAPEIS).filter((k) => !achou[k]);
  if (faltam.length) {
    vivo(
      'aviso',
      `Falta comando para ${faltam.map((k) => PAPEIS[k].nome).join(' e ')}: uso o preparar-ambiente.py da skill`
    );
    return null;
  }
  vivo('acao', `Suficiente: API por “${achou.api.nome}” e Metro por “${achou.metro.nome}”`);
  for (const [k, p] of Object.entries(PAPEIS)) {
    if (await portaAberta(p.porta)) vivo('acao', `${p.nome} já responde na porta ${p.porta}`);
    else {
      vivo('acao', `Rodando “${achou[k].nome}” (${achou[k].comando})`);
      d.comandos.rodar(achou[k].nome);
    }
  }
  const adb = d.adb,
    pronto = () => adbSaida(adb, ['shell', 'getprop', 'sys.boot_completed']).trim() === '1';
  if (!(await d.emulador.aparelhos()).length) {
    vivo('acao', `Ligando o emulador ${d.emulador.avd || ''}`.trim());
    d.emulador.ligar();
  } else vivo('acao', 'Emulador já ligado');
  const parar = () => pausado(dir);
  for (const p of Object.values(PAPEIS)) {
    if (!(await esperar(() => portaAberta(p.porta), p.espera, parar))) {
      if (!parar())
        vivo(
          'erro',
          `${p.nome} não respondeu na porta ${p.porta} em ${p.espera}s (veja o terminal “${achou[p === PAPEIS.api ? 'api' : 'metro'].nome}”)`
        );
      return {
        parou_em: p === PAPEIS.api ? 'api' : 'metro',
        fonte: 'comandos',
        terminais: [achou.api.nome, achou.metro.nome]
      };
    }
    vivo('acao', `${p.nome} respondendo na porta ${p.porta}`);
  }
  if (!(await esperar(async () => pronto(), 300, parar))) {
    if (!parar()) vivo('erro', 'O emulador não terminou de ligar em 5 min');
    return { parou_em: 'app', fonte: 'comandos', terminais: [achou.api.nome, achou.metro.nome] };
  }
  adbSaida(adb, ['reverse', 'tcp:5111', 'tcp:5111']);
  adbSaida(adb, ['reverse', 'tcp:8081', 'tcp:8081']);
  const app = adbSaida(adb, ['shell', 'pm', 'list', 'packages']).match(/package:(br\.com\.ferreiracosta\.wms\S*)/)?.[1];
  if (!app) {
    vivo(
      'aviso',
      'App do WMS não instalado no emulador: o preparar-ambiente.py da skill compila e instala (reaproveita o que já está de pé)'
    );
    return null;
  }
  vivo('acao', `Emulador pronto com o app ${app}`);
  return {
    fonte: 'comandos',
    terminais: [achou.api.nome, achou.metro.nome],
    app,
    parou_em: null,
    itens: [],
    backend: achou.api.pasta || d.backend,
    mobile: achou.metro.pasta || null
  };
}

module.exports = { viaComandos };
