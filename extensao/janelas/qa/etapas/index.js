// @ts-check
// Etapas do QA, na ordem em que rodam. Fonte única: a caixa "Etapas do QA" (abas/evidencias/etapas.js) e as Configurações > Plugins
// (infra/agentes/etapas.js) leem daqui. Só dados (sem require de lógica): infra/agentes/etapas.js carrega este arquivo cedo.
//   n, nome   número e nome na caixa de etapas
//   vaga      plugin/skill que a etapa usa (VAGAS abaixo; null = só o prompt da extensão) · obs: nota na aba Plugins
//   arquivo   a lógica da etapa (NN-nome/ ou NN-nome.js nesta pasta); a ordem de execução é a do orquestrador/executar.js
const os = require('os');
const path = require('path');

const ETAPAS = [
  { n: 1, nome: 'Planejamento', vaga: null, obs: 'método embutido na extensão', arquivo: '01-planejamento' },
  { n: 2, nome: 'Cenários', vaga: null, arquivo: '02-cenarios' },
  { n: 3, nome: 'Ambiente', vaga: 'qa.ambiente', arquivo: '03-ambiente' },
  {
    n: 4,
    nome: 'Pré-condição (health check e login)',
    vaga: 'qa.execucao',
    obs: 'roda antes da suíte, fora da lista de cenários',
    arquivo: '04-precondicao'
  },
  {
    n: 5,
    nome: 'Massa de dados',
    vaga: 'qa.execucao',
    obs: 'pela receita do 6.0 Gerar, sem IA; a IA só corrige a receita',
    arquivo: '05-massa'
  },
  {
    n: 6,
    nome: 'Execução de cada cenário',
    vaga: 'qa.execucao',
    obs: '6.0 Gerar: uma sessão escreve camadas, receita e roteiros; a jornada roda sem IA',
    arquivo: '06-execucao'
  },
  {
    n: 7,
    nome: 'Relatório e publicar',
    vaga: 'qa.execucao',
    obs: 'a IA escreve o relatório (moldes/relatorio-qa.md); você confere o nível',
    arquivo: '07-publicar'
  }
];

// Vagas do QA em Configurações > Plugins (infra/agentes/etapas.js junta com as dos outros módulos).
const SKILLS = path.join(os.homedir(), '.claude', 'skills');
// contrato: o que a extensão espera de quem ocupa a vaga (base da verificação por IA de um substituto).
const VAGAS = {
  'qa.ambiente': {
    padrao: {
      tipo: 'skill',
      id: 'testes-funcionais',
      nome: 'testes-funcionais',
      caminho: path.join(SKILLS, 'testes-funcionais')
    },
    como: 'script executado + referências lidas',
    contrato:
      'Script <raiz>/assets/backend/preparar-ambiente.py --chave KEY --json [--build-app], idempotente, que sobe API (5111), Metro (8081), emulador e app; imprime linhas "[ OK|FEITO|PEND.|AVISO] texto" ' +
      'e uma última linha JSON {parou_em (null se ok), itens[{item, verdito, detalhe}], ref, backend, mobile, pendentes, app}. Referências references/diagnostico.md e references/ambiente-execucao.md para analisar quando o preparo para.'
  },
  'qa.execucao': {
    padrao: {
      tipo: 'skill',
      id: 'testes-funcionais',
      nome: 'testes-funcionais',
      caminho: path.join(SKILLS, 'testes-funcionais')
    },
    como: 'SKILL.md lido como método',
    contrato:
      'SKILL.md com o método de execução de um cenário (CTnn) no app/API e o método de massa de dados (consultas só leitura na cópia de produção). Funciona sem AskUserQuestion: onde mandaria parar, pausa pelo qa-state (pausa) e aguarda o humano; nunca pula cenário nem segue sem resposta. ' +
      'O Claude registra pelo qa-state da extensão (card <json> com a camada de cada cenário, receita <json> de massa, roteiro CTnn <json> | roteiro CTnn refazer, evidencia CTnn, aviso CTnn, cenario CTnn concluir --status passou|falhou|sem-massa; ' +
      'precondicao --status ok|falhou antes da suíte: health check e login; relatorio <md> --nivel no fim). Camadas por references/plano-para-suite.md, jornada mobile por Maestro/adb (references/jornada-mobile-maestro.md), relatório por moldes/relatorio-qa.md.'
  }
};

module.exports = { ETAPAS, VAGAS };
