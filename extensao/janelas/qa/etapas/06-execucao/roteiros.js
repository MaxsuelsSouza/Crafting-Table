// @ts-check
// Roteiro de cada cenário no disco: roteiros/CTnn.json = { base (pasta dos flows), hash e instrução do cenário quando foi escrito, variaveis, etapas }.
// O Claude registra pelo qa-state (6.1); a extensão reaproveita enquanto o texto do cenário e a instrução do humano não mudam (↻ sem gastar Claude).
const fs = require('fs');
const path = require('path');
const { lerJson, gravarJson, estado } = require('../../estado');
const { cenarios, CENARIOS } = require('../02-cenarios/mapa');
const { massa } = require('../05-massa/estado');
const { substituir, resolverVars, varsDaMassa, validarRoteiro } = require('./regras/roteiro');
const { envWms } = require('./dependencias');

const ROTEIROS = 'roteiros';
const arquivo = (dir, id) => path.join(dir, ROTEIROS, `${id}.json`);
const emExecucao = (dir, id) => {
  const c = cenarios(dir).cenarios.find((x) => x.id === id);
  if (!c || c.status !== 'executando') throw new Error(`${id} não está em execução`);
  return c;
};

// Lote do 6.1 (estado.loteRoteiro): a mesma sessão registra também os roteiros dos próximos cenários pendentes.
const doLote = (dir, id) => {
  const c = cenarios(dir).cenarios.find((x) => x.id === id);
  return (estado(dir).loteRoteiro || []).includes(id) && ['pendente', 'desatualizado'].includes(c?.status) ? c : null;
};
// Valida já com a massa do cenário, para o Claude corrigir na mesma sessão em vez de descobrir na jornada.
function registrarRoteiro(dir, id, arq) {
  const c = doLote(dir, id) || emExecucao(dir, id);
  let r;
  try {
    r = JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch (e) {
    throw new Error(`roteiro não é um JSON legível: ${e.message}`);
  }
  if (Array.isArray(r)) r = { etapas: r };
  const base = path.dirname(path.resolve(arq)),
    vars = varsDaMassa(massa(dir).itens.filter((i) => i.estado === 'valida' && (i.cenarios || []).includes(id)));
  const erros = validarRoteiro(substituir(r, resolverVars(r, vars)), { base, envBase: envWms() });
  if (erros.length) throw new Error(`roteiro recusado, corrija e registre de novo:\n- ${erros.join('\n- ')}`);
  gravarJson(arquivo(dir, id), {
    ...r,
    base,
    hash: c.hash,
    instrucao: c.instrucao || '',
    em: new Date().toISOString()
  });
}
const roteiroDe = (dir, c) => {
  const r = lerJson(arquivo(dir, c.id), null);
  return r && r.hash === c.hash && r.instrucao === (c.instrucao || '') ? r : null;
};
const descartarRoteiro = (dir, id) => fs.rmSync(arquivo(dir, id), { force: true });

// 6.3: o diagnóstico concluiu que a falha é do roteiro (seletor, espera, consulta errada): descarta e guarda o motivo na execução.
function pedirNovoRoteiro(dir, id, nota) {
  emExecucao(dir, id);
  const r = cenarios(dir),
    ex = r.cenarios.find((x) => x.id === id).execucoes.at(-1);
  ex.refazerRoteiro = String(nota || 'o diagnóstico pediu outro roteiro');
  gravarJson(path.join(dir, CENARIOS), r);
  descartarRoteiro(dir, id);
}

// Lê e consome o pedido de outro roteiro da execução em andamento ('' = nenhum).
function pedidoDeRoteiro(dir, id) {
  const r = cenarios(dir),
    ex = r.cenarios.find((x) => x.id === id)?.execucoes?.at(-1),
    nota = ex?.refazerRoteiro || '';
  if (nota) {
    delete ex.refazerRoteiro;
    gravarJson(path.join(dir, CENARIOS), r);
  }
  return nota;
}

module.exports = { ROTEIROS, registrarRoteiro, roteiroDe, descartarRoteiro, pedirNovoRoteiro, pedidoDeRoteiro };
