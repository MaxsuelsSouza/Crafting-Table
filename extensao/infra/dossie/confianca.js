// @ts-check
// Régua de confiança das fontes (aprovado > gerado > bruto > verbal > ausente), o maior nível de um eixo e as capacidades (banco e repositórios).
// Usado por: o dossiê (montar.js) e os Incidentes (incidentes/entrada.js); o QA usa pelo dossiê (qa/entrada.js).
const path = require('path');

const NIVEIS = ['ausente', 'verbal', 'bruto', 'gerado', 'aprovado'];
const rank = (n) => NIVEIS.indexOf(n);

/** Maior nível entre as fontes de um eixo. */
const nivelDe = (itens) => itens.reduce((m, i) => (rank(i.confianca) > rank(m) ? i.confianca : m), 'ausente');

/** @typedef {{ fonte: string, rotulo: string, confianca: string, arquivo?: string, detalhe?: string }} Item */

/** Banco (leitura só com conexão, ambiente e fora de produção) e repositórios; acrescenta as lacunas. */
function capacidadesDe(o, lacunas) {
  const b = o.banco || {};
  const banco = b.conexao && b.ambiente && b.ambiente !== 'producao' ? 'leitura' : 'nenhum';
  const repos = (o.repos || []).map((r) => ({ caminho: r.caminho, camada: r.camada, branchPrincipal: r.branchPrincipal || '' }));
  const semBranch = repos.filter((r) => !r.branchPrincipal).map((r) => r.caminho);
  if (!repos.length) lacunas.push('Nenhum repositório de código configurado (Configurações > Geral > Repositórios de código).');
  else if (semBranch.length) lacunas.push(`Sem branch principal configurada: ${semBranch.map((c) => path.basename(c)).join(', ')} (Configurações > Geral > Repositórios de código).`);
  if (banco === 'nenhum') lacunas.push('Sem acesso ao banco (não configurado ou em produção): dados confirmados ficam como pendência.');
  return { banco, repos, semBranch };
}

module.exports = { NIVEIS, rank, nivelDe, capacidadesDe };
