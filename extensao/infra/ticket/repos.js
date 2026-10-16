// @ts-check
// Repositórios de código do ticket (saiu de refinamento/orquestrador.js, que reexporta): os das configurações que existem em disco ou,
// sem eles, os achados no repositório de specs (reposAuto).
// Onde é usado: Refinamento (orquestrador), Implementações (implementacoes/orquestrador/ambiente.js) e, via servicos.reposDe do painel.js, Incidentes e QA.
// Como usar: const { reposDe } = require('./repos'); reposDe(t) → [{ camada, caminho, refRelease? }]
const fs = require('fs');
const { cfg, reposAuto, SPECS_PADRAO } = require('../../configuracao/configuracao');

const reposDe = (t) => {
  const lista = (cfg().get('repositorios') || []).filter((r) => r?.caminho && fs.existsSync(r.caminho));
  return lista.length ? lista : reposAuto(t?.spec?.repo || cfg().get('specsDir') || SPECS_PADRAO);
};

module.exports = { reposDe };
