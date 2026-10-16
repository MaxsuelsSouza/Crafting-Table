// @ts-check
// Subetapa 5.3 · Subir o ambiente: emulador, API, Metro e Start do app, na ordem estrita, pelos comandos de Configurações → Comandos.
// Idempotente: o que já está de pé segue. Na retomada roda de novo, pois o ambiente pode ter caído.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { SUBETAPAS, pausar } = require('./estado');

// ── Comandos das Configurações: papel pelo nome do botão (vale mais) ou pelo comando.
const PAPEIS = {
  api: { nome: 'API', porta: 5111, espera: 240, nomeRe: /\bapi\b|backend/i, cmdRe: /dotnet\s+(run|watch)|5111/i },
  metro: {
    nome: 'Metro',
    porta: 8081,
    espera: 120,
    nomeRe: /\bmetro\b|bundler/i,
    cmdRe: /react-native\s+start|\bmetro\b|8081/i
  },
  start: {
    nome: 'Start',
    espera: 600,
    nomeRe: /\bstart\b|\bandroid\b|\bapp\b/i,
    cmdRe: /(yarn|npm)\s+(run\s+)?(android|start)|run-android/i
  }
};
const acharComando = (lista, p) =>
  lista
    .map((b) => [b, (p.nomeRe.test(b.nome) ? 2 : 0) + (p.cmdRe.test(b.comando || '') ? 1 : 0)])
    .filter(([, n]) => n > 0)
    .sort((x, y) => y[1] - x[1])[0]?.[0] || null;

// Sobe tudo na ordem estrita. Devolve null (pronto) ou { motivo, pergunta } da primeira falha.
async function subirAmbiente(dir, d) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const cmds = d.comandos.lista(),
    esp = d.esperar;
  const faltam = ['api', 'metro', 'start'].filter((k) => !acharComando(cmds, PAPEIS[k]));
  if (faltam.length)
    return {
      motivo: `Falta comando em Configurações → Comandos para ${faltam.map((k) => PAPEIS[k].nome).join(', ')}`,
      pergunta: 'Cadastre o(s) comando(s) e tente de novo.'
    };
  // 1. Emulador
  vivo('etapa', 'Ambiente · 1. Emulador');
  if (!(await d.emulador.aparelhos()).length) {
    vivo('acao', 'Ligando o emulador');
    d.emulador.ligar();
  } else vivo('acao', 'Emulador já ligado');
  if (!(await esp(async () => (await d.emulador.aparelhos()).length > 0 && (await d.emulador.pronto()), 300)))
    return {
      motivo: 'O emulador não terminou de ligar em 5 min',
      pergunta: 'Ligue o emulador à mão ou tente de novo?'
    };
  // 2. API
  vivo('etapa', 'Ambiente · 2. API');
  const rodarPapel = async (k, pronto) => {
    const p = PAPEIS[k],
      b = acharComando(cmds, p);
    if (await pronto()) vivo('acao', `${p.nome} já está de pé`);
    else {
      vivo('acao', `Rodando “${b.nome}”`);
      d.comandos.rodar(b.nome);
    }
    if (!(await esp(pronto, p.espera)))
      return {
        motivo: `${p.nome} não ficou pronto em ${p.espera}s (veja o terminal “${b.nome}”)`,
        pergunta: 'Corrija o terminal e tente de novo?'
      };
    vivo('acao', `${p.nome} pronto`);
    return null;
  };
  let f = await rodarPapel('api', () => d.portaAberta(PAPEIS.api.porta));
  if (f) return f;
  // 3. Metro (aguarda de fato estar de pé: status running)
  vivo('etapa', 'Ambiente · 3. Metro');
  f = await rodarPapel('metro', async () => (await d.portaAberta(PAPEIS.metro.porta)) && (await d.metroStatus()));
  if (f) return f;
  // 4. Start: só depois do Metro pronto
  vivo('etapa', 'Ambiente · 4. Start');
  return rodarPapel('start', async () => d.appInstalado());
}

// Devolve true se parou (pausa); false para seguir para a 5.4.
async function rodar({ dir, d, ponto, comecar, concluirSub }) {
  const S3 = SUBETAPAS[2];
  ponto();
  comecar(S3);
  const falha = await subirAmbiente(dir, d);
  if (falha) return pausar(dir, falha.motivo, falha.pergunta);
  fs.writeFileSync(path.join(dir, '.ambiente.ok'), new Date().toISOString());
  concluirSub(S3);
  return false;
}

module.exports = { PAPEIS, acharComando, subirAmbiente, rodar };
