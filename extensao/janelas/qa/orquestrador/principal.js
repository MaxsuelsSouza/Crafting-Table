// @ts-check
// Entrada de cada execução do QA (executar.js): os repositórios voltam para a principal (infra/git garantirPrincipal; checkout com a chave do
// ticket no nome fica). O QA lê o código pela ref (etapas/03-ambiente/subetapas/codigo.js), nunca por checkout.
// Recusa por proteção (sujo, branch presa, worktree da esteira, execução de outro ticket) vira a pausa 'principal':
// Tentar de novo · Seguir assim (estado.principalOk: não confere mais neste ticket). Erro de git e repositório sem principal seguem.
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const git = require('../../../infra/git');
const { estado, mudar } = require('../estado');

const TENTAR = 'Tentar de novo',
  SEGUIR = 'Seguir assim';
const PROTECOES = ['sujo', 'presa', 'worktree-esteira', 'dono'];

/** @returns {boolean} true = segue; false = pausou */
function garantirPrincipal(dir, d) {
  if (estado(dir).principalOk) return true;
  for (const r of (d.repos || []).filter((x) => x?.caminho && x.branchPrincipal)) {
    const res = git.garantirPrincipal(r, { chave: d.chave, chaves: [d.chave].filter(Boolean) });
    if (res.trocou)
      aoVivo.anotar(dir, {
        tipo: 'acao',
        texto: `${path.basename(r.caminho)}: de volta para ${r.branchPrincipal} (estava em ${res.de})`
      });
    if (!res.ok && PROTECOES.includes(String(res.motivo))) {
      mudar(dir, {
        execucao: 'pausado',
        pausa: {
          motivo: 'principal',
          etapa: 'Ambiente',
          pergunta: `${res.texto} Antes de rodar, o QA volta o repositório para a principal (${r.branchPrincipal}).`,
          opcoes: [TENTAR, SEGUIR]
        }
      });
      aoVivo.anotar(dir, { tipo: 'aviso', texto: `${path.basename(r.caminho)}: ${res.texto}` });
      return false;
    }
  }
  return true;
}

/** Resposta à pausa 'principal' (texto livre = tentar de novo). @returns {boolean} tratou */
function responderPrincipal(dir, pausa, resposta) {
  if (pausa?.motivo !== 'principal') return false;
  mudar(dir, { pausa: null, ...(String(resposta).trim() === SEGUIR ? { principalOk: true } : {}) });
  return true;
}

module.exports = { garantirPrincipal, responderPrincipal, TENTAR, SEGUIR };
