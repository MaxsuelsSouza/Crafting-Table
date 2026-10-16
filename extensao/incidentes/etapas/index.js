// @ts-check
// Etapas do Mergulho (módulo Incidentes), na ordem em que rodam. Fonte única: o orquestrador, a aba Mergulho e as Configurações > Plugins
// (infra/agentes/etapas.js) leem daqui. Só dados (sem require de lógica): infra/agentes/etapas.js carrega este arquivo cedo.
//   n, nome, arq   número, nome na caixa de etapas e o artefato que prova que a etapa terminou
//   vaga           plugin/skill que a etapa usa (VAGAS abaixo; null = só o prompt da extensão)
//   arquivo        a lógica da etapa (NN-nome.js nesta pasta), carregada por logica(n)
// Cada arquivo de etapa exporta { n, tarefa?, leTicket?, analisaAnexos?, sempreAprovar?, antes?, depois?, responder? } (1 a 4: um `claude -p`
// por etapa, orquestrador/) ou { executar } (5, com o fecho da 6). Ver incidentes/CONTRATO.md para os artefatos.
const os = require('os');
const path = require('path');

const ETAPAS = [
  { n: 1, nome: 'Triagem', arq: '1-triagem.md', vaga: 'incidentes.mapa', arquivo: '01-triagem' },
  { n: 2, nome: 'Artefatos e input do PO', arq: '2-artefatos.md', vaga: 'incidentes.mapa', arquivo: '02-artefatos' },
  { n: 3, nome: 'Dados e logs', arq: '3-dados-logs.md', vaga: 'incidentes.mapa', arquivo: '03-dados-logs' },
  { n: 4, nome: 'Diagnóstico', arq: '4-diagnostico.md', vaga: 'incidentes.mapa', arquivo: '04-diagnostico' },
  {
    n: 5,
    nome: 'Ambiente e reprodução',
    arq: 'reproducao.json',
    vaga: 'incidentes.reproducao',
    arquivo: '05-reproducao'
  },
  { n: 6, nome: 'Evidências', arq: 'resumo.md', vaga: null, arquivo: '06-evidencias' }
];
const logica = (n) => require(`./${ETAPAS[n - 1].arquivo}`);
// Documentos das etapas 1 a 4 (o que a reprodução e o resumo leem).
const documentos = (dir) =>
  ETAPAS.slice(0, 4)
    .map((e) => path.join(dir, e.arq))
    .join(', ');

// Vagas do Incidente em Configurações > Plugins (infra/agentes/etapas.js junta com as dos outros módulos).
const LOCAL = (n) => path.join(__dirname, '..', '..', 'infra', 'plugins', n);
const SKILLS = path.join(os.homedir(), '.claude', 'skills');
const VAGAS = {
  'incidentes.mapa': {
    padrao: { tipo: 'local', id: 'mapa', nome: 'mapa', caminho: LOCAL('mapa') },
    como: 'bins mapa-db e mapa-git (--plugin-dir)',
    contrato:
      'Bins <raiz>/bin/mapa-db (SELECT só leitura na base configurada, log em MAPA_DB_LOG, recusa produção) e <raiz>/bin/mapa-git (git só leitura) para triagem, artefatos, dados e logs e diagnóstico do incidente.'
  },
  'incidentes.reproducao': {
    padrao: {
      tipo: 'skill',
      id: 'testes-funcionais',
      nome: 'testes-funcionais',
      caminho: path.join(SKILLS, 'testes-funcionais')
    },
    como: 'SKILL.md e referências lidos',
    contrato:
      'Documentação do app para montar a massa de teste (INSERTs novos e distintos a partir da cópia de produção, só leitura), planejar o fluxo de 5 a 12 passos e reproduzir no emulador por Maestro/adb ' +
      '(references/jornada-mobile-maestro.md), com print por adb exec-out screencap. Sem AskUserQuestion.'
  }
};

module.exports = { ETAPAS, logica, documentos, VAGAS };
