// @ts-check
// card.json (qa/card.json), escrito pela IA no 6.0 Gerar: em que camada cada cenário é verificado.
//   app              roteiro com flows no ambiente (Maestro no emulador/aparelho, Playwright no web; sai da tela de início)
//   api              roteiro só com etapas http (+ consultas): sem app, em segundos
//   banco            roteiro só com consultas antes × depois
//   nao-verificavel  não dá para verificar aqui (porque obrigatório): vai para o relatório como não verificável
// ambiente (opcional): onde o cenário roda (infra/ambientes: emulador, aparelho, web); sem ele, o do ticket (v1: um por ticket).
// { "cenarios": { "CT01": { "camada": "app", "porque": "a regra está na tela de conferência", "ambiente": "emulador" } } }
const path = require('path');
const { lerJson, gravarJson } = require('../../../estado');
const { NOMES: AMBIENTES } = require('../../../../../infra/ambientes');

const CAMADAS = ['app', 'api', 'banco', 'nao-verificavel'];
const CARD = 'card.json';

/** ids: cenários do plano; exigir: os que esta volta precisa cobrir (padrão: todos). @returns {string[]} */
function validarCard(card, ids = [], exigir = ids) {
  const cs = card?.cenarios;
  if (!cs || typeof cs !== 'object')
    return ['falta "cenarios": { "CT01": { "camada": "app|api|banco|nao-verificavel", "porque": "…" } }'];
  const erros = [];
  for (const [id, v] of Object.entries(cs)) {
    if (ids.length && !ids.includes(id)) erros.push(`${id}: não está no plano`);
    if (!CAMADAS.includes(v?.camada)) erros.push(`${id}: camada precisa ser ${CAMADAS.join(', ')}`);
    if (!String(v?.porque || '').trim()) erros.push(`${id}: sem "porque"`);
    if (v?.ambiente !== undefined && !AMBIENTES.includes(v.ambiente))
      erros.push(`${id}: ambiente precisa ser ${AMBIENTES.join(', ')}`);
  }
  const faltam = exigir.filter((id) => !cs[id]);
  if (faltam.length) erros.push(`sem camada: ${faltam.join(', ')}`);
  return erros;
}

const lerCard = (dir) => lerJson(path.join(dir, CARD), { cenarios: {} });
const camadaDe = (dir, id) => lerCard(dir).cenarios[id] || null;
/** Mescla (o Gerar pode cobrir só os pendentes; os outros ficam). */
function registrarCard(dir, card, ids, exigir = ids) {
  const erros = validarCard(card, ids, exigir);
  if (!erros.length) {
    const atual = lerCard(dir);
    gravarJson(path.join(dir, CARD), {
      cenarios: { ...atual.cenarios, ...card.cenarios },
      em: new Date().toISOString()
    });
  }
  return erros;
}

// O roteiro bate com a camada? app precisa de flow; api de http; banco só consulta.
function errosDaCamada(camada, roteiro) {
  const tipos = new Set((roteiro?.etapas || []).map((e) => e.tipo));
  if (camada === 'app' && !tipos.has('flow')) return ['camada app sem nenhum flow'];
  if (camada === 'api' && !tipos.has('http')) return ['camada api sem nenhuma etapa http'];
  if (camada === 'api' && (tipos.has('flow') || tipos.has('bipe')))
    return ['camada api não abre o app (tire flow/bipe ou mude a camada)'];
  if (camada === 'banco' && [...tipos].some((t) => t !== 'consulta' && t !== 'espera'))
    return ['camada banco só tem consultas (mude a camada se precisa de app ou API)'];
  return [];
}

module.exports = { CAMADAS, CARD, validarCard, lerCard, camadaDe, registrarCard, errosDaCamada };
