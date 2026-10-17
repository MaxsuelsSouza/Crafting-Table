// @ts-check
// Etapa 3 · Ambiente do ticket (infra/ambientes: emulador, aparelho ou web; d.ambiente): primeiro pelos Comandos das Configurações;
// no emulador, o que faltar, pelo script da skill.
//   estado.js            .ambiente.json, trava do ambiente (um por máquina), log e os preparos em andamento
//   dependencias.js      script da skill; git, portas, espera e adb (reexportados de infra/ambientes)
//   regras/papeis.js     qual Comando sobe a API e qual sobe o Metro (reexporta infra/ambientes/aplicacao/papeis.js)
//   subetapas/comandos.js  ambiente pelos Comandos (ambiente.subir)
//   subetapas/codigo.js    onde está o código do ticket (infra/git localizar): ref para a skill e os prompts
//   subetapas/skill.js     ambiente pelo preparar-ambiente.py
//   prompt.js · analise.js  o Claude analisa por que o preparo parou
//   status.js            caixa do ambiente no rodapé
const path = require('path');
const aoVivo = require('../../../../componentes/ao-vivo');
const { gravarJson } = require('../../estado');
const { pausado } = require('../../orquestrador/rodando');
const { AMBIENTE, ambiente, hoje } = require('./estado');
const { shaDe } = require('./dependencias');
const { viaComandos } = require('./subetapas/comandos');
const { prepararPelaSkill } = require('./subetapas/skill');
const { localizarCodigo } = require('./subetapas/codigo');

async function preparar(dir, chave, backend, d = {}) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  vivo('etapa', 'QA · Ambiente');
  if (!(await localizarCodigo(dir, d))) return null; // pausou: código não achado ou em mais de um lugar
  gravarJson(path.join(dir, AMBIENTE), {
    ...(ambiente(dir) || {}),
    preparando: true,
    parou_em: null,
    erro: null,
    analise: null,
    em: new Date().toISOString()
  });
  vivo('acao', `Procurando nos Comandos (Configurações) o que sobe o ambiente ${d.ambiente || 'emulador'}`);
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
      sha: c.sha || { backend: shaDe(c.backend), mobile: shaDe(c.mobile) }
    };
    gravarJson(path.join(dir, AMBIENTE), amb);
    if (amb.parou_em) return null;
    vivo(
      'fim',
      `Ambiente pronto pelos Comandos (${amb.nome}) · ${Object.entries(amb.sha)
        .map(([k, v]) => `${k} ${v || '?'}`)
        .join(' · ')}`
    );
    return amb;
  }
  return prepararPelaSkill(dir, chave, backend);
}

module.exports = { n: 3, preparar };
