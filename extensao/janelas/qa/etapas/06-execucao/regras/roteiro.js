// @ts-check
// Roteiro de um cenário (roteiros/CTnn.json): substituição de ${VAR} e validação antes de rodar (6.2). O flow é validado pelo ambiente.
// Recusa aqui o que o executar-jornada.py da skill deixava passar: tipo desconhecido, comparar_com sem referência,
// variável sem valor, name: que quebra no Windows, env: do cabeçalho do flow que vence o -e, e consulta que não é SELECT.
const path = require('path');
const { validar: validarSelect } = require('../../../../../infra/plugins/mapa/lib/banco');
// validação do flow do Maestro (padrão): infra/ambientes/android/flow.js; cada ambiente tem a sua (validarFlow do contrato)
const { cabecalho, errosDoFlow } = require('../../../../../infra/ambientes/android/flow');

const { errosHttp } = require('./http');

const TIPOS = ['flow', 'bipe', 'espera', 'consulta', 'http'];
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

/**
 * Roteiro já substituído → lista de erros (vazia = pode rodar). base: pasta dos flows; envBase: o que vai por -e em todo flow.
 * validarFlow e bipe vêm do ambiente do ticket (infra/ambientes; padrão: Maestro e com bipe, o emulador).
 * @returns {string[]}
 */
function validarRoteiro(roteiro, { base, envBase = {}, validarFlow = errosDoFlow, bipe = true }) {
  const etapas = roteiro?.etapas;
  if (!Array.isArray(etapas) || !etapas.length) return ['roteiro sem etapas'];
  const erros = [],
    nomes = new Set();
  // ${VAR} que uma etapa http salva (salvar) só tem valor na hora: não conta como faltando.
  const salvas = new Set(etapas.flatMap((e) => (e?.tipo === 'http' ? Object.keys(e.salvar || {}) : [])));
  const falta = [...new Set(pendentes(etapas))].filter((n) => !salvas.has(n));
  if (falta.length) erros.push(`variável sem valor: ${falta.map((n) => '${' + n + '}').join(', ')}`);
  etapas.forEach((e, i) => {
    const onde = `etapa ${i + 1} (${e.tipo || '?'})`;
    if (!TIPOS.includes(e.tipo)) return erros.push(`${onde}: tipo desconhecido (use ${TIPOS.join(', ')})`);
    if (e.tipo === 'flow') {
      if (!e.arquivo) return erros.push(`${onde}: sem arquivo`);
      erros.push(...validarFlow(path.resolve(base, e.arquivo), { ...envBase, ...(e.env || {}) }));
    }
    if (e.tipo === 'http') {
      erros.push(...errosHttp(e, onde));
      if (e.nome && nomes.has(e.nome)) erros.push(`${onde}: nome "${e.nome}" repetido`);
      nomes.add(e.nome);
    }
    if (e.tipo === 'bipe' && !String(e.codigo ?? '').trim()) erros.push(`${onde}: sem código`);
    if (e.tipo === 'bipe' && !bipe) erros.push(`${onde}: este ambiente não tem bipe (só o coletor Android)`);
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
