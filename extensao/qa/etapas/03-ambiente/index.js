// @ts-check
// Etapa 3 · Ambiente (API, Metro, emulador e app): primeiro pelos Comandos das Configurações; o que faltar, pelo script da skill.
//   estado.js            .ambiente.json, trava do ambiente (um por máquina), log e os preparos em andamento
//   dependencias.js      script da skill, git, portas, espera e adb
//   regras/papeis.js     qual Comando sobe a API e qual sobe o Metro
//   subetapas/comandos.js  ambiente pelos Comandos
//   subetapas/skill.js     ambiente pelo preparar-ambiente.py
//   prompt.js · analise.js  o Claude analisa por que o preparo parou
//   status.js            caixa do ambiente no rodapé
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const { gravarJson } = require('../../estado');
const { pausado } = require('../../orquestrador/rodando');
const { AMBIENTE, ambiente, hoje } = require('./estado');
const { shaDe } = require('./dependencias');
const { viaComandos } = require('./subetapas/comandos');
const { prepararPelaSkill } = require('./subetapas/skill');

async function preparar(dir, chave, backend, d = {}) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  vivo('etapa', 'QA · Ambiente');
  gravarJson(path.join(dir, AMBIENTE), {
    ...(ambiente(dir) || {}),
    preparando: true,
    parou_em: null,
    erro: null,
    analise: null,
    em: new Date().toISOString()
  });
  vivo('acao', 'Procurando nos Comandos (Configurações) o que sobe API, Metro e emulador');
  const c = await viaComandos(dir, { ...d, backend });
  if (pausado(dir)) {
    gravarJson(path.join(dir, AMBIENTE), { ...ambiente(dir), preparando: false });
    return null;
  }
  if (c) {
    const amb = {
      ...c,
      data: hoje(),
      em: new Date().toISOString(),
      preparando: false,
      sha: { backend: shaDe(c.backend), mobile: shaDe(c.mobile) }
    };
    gravarJson(path.join(dir, AMBIENTE), amb);
    if (amb.parou_em) return null;
    vivo('fim', `Ambiente pronto pelos Comandos · backend ${amb.sha.backend || '?'} · mobile ${amb.sha.mobile || '?'}`);
    return amb;
  }
  return prepararPelaSkill(dir, chave, backend);
}

module.exports = { n: 3, preparar };
