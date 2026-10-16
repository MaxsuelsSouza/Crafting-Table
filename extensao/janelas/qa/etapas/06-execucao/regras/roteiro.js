// @ts-check
// Roteiro de um cenário (roteiros/CTnn.json): substituição de ${VAR} e validação antes de rodar (6.2).
// Recusa aqui o que o executar-jornada.py da skill deixava passar: tipo desconhecido, comparar_com sem referência,
// variável sem valor, name: que quebra no Windows, env: do cabeçalho do flow que vence o -e, e consulta que não é SELECT.
const fs = require('fs');
const path = require('path');
const { validar: validarSelect } = require('../../../../../infra/plugins/mapa/lib/banco');

const TIPOS = ['flow', 'bipe', 'espera', 'consulta'];
const VAR = /\$\{(\w+)\}/g;

// ${NOME} → valor, recursivo em objetos e listas; variável desconhecida fica literal (a validação acusa depois).
const substituir = (v, vars) =>
  typeof v === 'string'
    ? v.replace(VAR, (m, n) => (n in vars ? String(vars[n]) : m))
    : Array.isArray(v)
      ? v.map((x) => substituir(x, vars))
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, substituir(x, vars)]))
        : v;

// Variáveis do roteiro (que podem citar a massa) por cima das da massa; --var/massa vencem o default do roteiro.
const resolverVars = (roteiro, massa = {}) => ({ ...substituir(roteiro.variaveis || {}, massa), ...massa });

// Dados da massa válida do cenário (Etapa 5) viram as variáveis do roteiro (P2: nenhum ID cravado).
const varsDaMassa = (itens) =>
  Object.fromEntries(itens.flatMap((i) => Object.entries(i.dados || {})).map(([k, v]) => [k, String(v)]));

const pendentes = (v) => [...JSON.stringify(v).matchAll(VAR)].map((m) => m[1]);

// Cabeçalho do flow (antes do 1º ---): chaves de env: e o name:.
function cabecalho(texto) {
  const topo = texto.split(/^---\s*$/m)[0];
  const env = topo.match(/^env:\s*\n((?:[ \t]+.*\n?)+)/m)?.[1] || '';
  return {
    env: [...env.matchAll(/^[ \t]+(\w+)\s*:/gm)].map((m) => m[1]),
    nome:
      topo
        .match(/^name:\s*(.+)$/m)?.[1]
        .trim()
        .replace(/^["']|["']$/g, '') || ''
  };
}
const SUBFLOW = /^\s*(?:-\s*)?(?:runFlow:\s*|file:\s*)([\w./-]+\.ya?ml)\s*$/gm;

// Flow e seus subflows (BFS): existe, name: sem " < > : | ? * e env: do cabeçalho sem chave que o runner passa por -e.
function errosDoFlow(arquivo, envPassado) {
  const erros = [],
    vistos = new Set(),
    fila = [arquivo];
  while (fila.length) {
    const f = fila.shift();
    if (vistos.has(f)) continue;
    vistos.add(f);
    let tx;
    try {
      tx = fs.readFileSync(f, 'utf8');
    } catch {
      erros.push(`flow não encontrado: ${f}`);
      continue;
    }
    const cab = cabecalho(tx);
    if (/["<>:|?*]/.test(cab.nome))
      erros.push(`${path.basename(f)}: name "${cab.nome}" tem " < > : | ? * (quebra no Windows)`);
    if (f === arquivo) {
      const choque = cab.env.filter((k) => k in envPassado);
      if (choque.length)
        erros.push(
          `${path.basename(f)}: env: do cabeçalho repete ${choque.join(', ')} (vence o -e no Maestro): tire do cabeçalho`
        );
    }
    for (const m of tx.matchAll(SUBFLOW)) fila.push(path.resolve(path.dirname(f), m[1]));
  }
  return erros;
}

/**
 * Roteiro já substituído → lista de erros (vazia = pode rodar). base: pasta dos flows; envBase: o que vai por -e em todo flow.
 * @returns {string[]}
 */
function validarRoteiro(roteiro, { base, envBase = {} }) {
  const etapas = roteiro?.etapas;
  if (!Array.isArray(etapas) || !etapas.length) return ['roteiro sem etapas'];
  const erros = [],
    nomes = new Set();
  const falta = [...new Set(pendentes(etapas))];
  if (falta.length) erros.push(`variável sem valor: ${falta.map((n) => '${' + n + '}').join(', ')}`);
  etapas.forEach((e, i) => {
    const onde = `etapa ${i + 1} (${e.tipo || '?'})`;
    if (!TIPOS.includes(e.tipo)) return erros.push(`${onde}: tipo desconhecido (use ${TIPOS.join(', ')})`);
    if (e.tipo === 'flow') {
      if (!e.arquivo) return erros.push(`${onde}: sem arquivo`);
      erros.push(...errosDoFlow(path.resolve(base, e.arquivo), { ...envBase, ...(e.env || {}) }));
    }
    if (e.tipo === 'bipe' && !String(e.codigo ?? '').trim()) erros.push(`${onde}: sem código`);
    if (['bipe', 'espera'].includes(e.tipo) && e.segundos !== undefined && !(Number(e.segundos) >= 0))
      erros.push(`${onde}: segundos inválido`);
    if (e.tipo === 'consulta') {
      if (!e.nome) erros.push(`${onde}: sem nome`);
      else if (nomes.has(e.nome)) erros.push(`${onde}: nome "${e.nome}" repetido`);
      const v = validarSelect(e.sql);
      if (!v.ok) erros.push(`${onde}: ${v.erro}`);
      if (e.comparar_com !== undefined) {
        if (!nomes.has(e.comparar_com))
          erros.push(`${onde}: comparar_com "${e.comparar_com}" não é uma consulta anterior deste roteiro`);
        if (!['igual', 'diferente'].includes(e.esperado))
          erros.push(`${onde}: esperado precisa ser igual ou diferente`);
      }
      nomes.add(e.nome);
    }
  });
  return erros;
}

module.exports = { TIPOS, substituir, resolverVars, varsDaMassa, pendentes, cabecalho, validarRoteiro };
