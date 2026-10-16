// @ts-check
// Etapas da esteira de Implementação, na ordem em que rodam. Fonte única: o orquestrador, as abas e as Configurações > Plugins
// (infra/agentes/etapas.js) leem daqui. Só dados (sem require de lógica): infra/agentes/etapas.js carrega este arquivo cedo.
//   n, nome, arq   número, nome na caixa de etapas e o artefato que prova que a etapa terminou (ARQ: os artefatos das etapas 2 a 7)
//   vaga           plugin/skill que a etapa usa (VAGAS abaixo; null = só o prompt da extensão)
//   obs            nota da etapa em Configurações > Plugins
// Um arquivo por etapa: 01-dossie/ (extensão, sem IA, com a Reprodução do bug), 02 a 05 e 07 (tarefa do prompt e o que for só da etapa),
// 06-verificacao.js (extensão, sem IA).
const path = require('path');
const dossie = require('../../infra/dossie/arquivos');

const ARQ = {
  2: 'entendimento.md',
  3: 'varredura.md',
  4: 'plano-mudanca.md',
  5: 'implementacao.log.md',
  6: 'verificacao.json',
  7: 'implementacao.md'
};
const ETAPAS = [
  { n: 1, nome: 'Dossiê', arq: dossie.JSON_, vaga: null, obs: 'a extensão lê o disco do ticket, sem IA' },
  { n: 2, nome: 'Entendimento', arq: ARQ[2], vaga: null },
  { n: 3, nome: 'Varredura do código', arq: ARQ[3], vaga: 'impl.mapa' },
  { n: 4, nome: 'Plano de mudança', arq: ARQ[4], vaga: 'impl.mapa' },
  { n: 5, nome: 'Implementação', arq: ARQ[5], vaga: null },
  { n: 6, nome: 'Verificação', arq: ARQ[6], vaga: null, obs: 'comandos de build e teste de Configurações > Comandos' },
  { n: 7, nome: 'Resumo', arq: ARQ[7], vaga: null }
];

// Vaga da Implementação em Configurações > Plugins (infra/agentes/etapas.js junta com as dos outros módulos).
const LOCAL = (n) => path.join(__dirname, '..', '..', 'infra', 'plugins', n);
const VAGAS = {
  'impl.mapa': {
    padrao: { tipo: 'local', id: 'mapa', nome: 'mapa', caminho: LOCAL('mapa') },
    como: 'bins mapa-db, mapa-git e mapa-conferir (--plugin-dir)',
    contrato:
      'Bins <raiz>/bin/mapa-git (git só leitura), mapa-db (SELECT só leitura, recusa produção) e mapa-conferir <mapa.md> --repo --db-log (confere as evidências) para a Varredura do código e o Plano de mudança da esteira de Implementação.'
  }
};

module.exports = { ETAPAS, ARQ, VAGAS };
