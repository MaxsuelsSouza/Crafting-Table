// @ts-check
// Etapas do Refinamento, na ordem da spec SDD (passos 0 a 6), e a etapa paralela de comentários. Fonte única: as Configurações > Plugins
// (infra/agentes/etapas.js) leem daqui. Só dados (sem require de lógica): infra/agentes/etapas.js carrega este arquivo cedo.
//   n               passo do sdd-state (0 a 6); sem n = não é passo (corre ao lado ou vale para todas)
//   nome, vaga      nome na tela de plugins e o plugin/skill que a etapa usa (VAGAS abaixo)
//   subetapas       a etapa-mãe não tem vaga própria; cada subetapa tem a sua (3 → 3.1 Mapeamento, 3.2 Plano técnico)
//   todas           vale para todas as etapas (aparece no fim, sem número)
//   arquivo         a lógica própria da etapa nesta pasta; null = só o prompt genérico do passo (orquestrador/seguir.js)
// A ordem e o texto de cada passo vêm do plugin sdd (sdd-state); a extensão só decide quando rodar (orquestrador/).
const path = require('path');

/** @type {{ n?: number, nome: string, vaga?: string, subetapas?: { nome: string, vaga: string }[], todas?: boolean, arquivo: string | null }[]} */
const ETAPAS = [
  { n: 0, nome: 'Constituição', vaga: 'refinamento.sdd', arquivo: null },
  { n: 1, nome: 'Especificação', vaga: 'refinamento.sdd', arquivo: null },
  { n: 2, nome: 'Clarificação', vaga: 'refinamento.sdd', arquivo: null },
  {
    n: 3,
    nome: 'Plano técnico',
    subetapas: [
      { nome: 'Mapeamento do código', vaga: 'refinamento.mapa' },
      { nome: 'Plano técnico', vaga: 'refinamento.sdd' }
    ],
    arquivo: '03-plano-tecnico'
  },
  { n: 4, nome: 'Tarefas', vaga: 'refinamento.sdd', arquivo: null },
  { n: 5, nome: 'Análise de qualidade', vaga: 'refinamento.sdd', arquivo: null },
  { n: 6, nome: 'Plano de testes', vaga: 'refinamento.metodoQa', arquivo: '06-plano-testes' },
  { nome: 'Comentários novos (triagem, impacto, aplicar)', vaga: 'refinamento.sdd', arquivo: 'comentarios' },
  { nome: 'Regras de escrita', vaga: 'refinamento.foco', todas: true, arquivo: null }
];

// Vagas do Refinamento em Configurações > Plugins (infra/agentes/etapas.js junta com as dos outros módulos).
// contrato: o que a extensão espera de quem ocupa a vaga (base da verificação por IA de um substituto).
const LOCAL = (n) => path.join(__dirname, '..', '..', 'infra', 'plugins', n);
const VAGAS = {
  'refinamento.sdd': {
    padrao: { tipo: 'plugin', id: 'sdd@crafting-local', nome: 'sdd', skill: 'sdd' },
    como: 'skill invocada + bin sdd-state + hooks',
    contrato:
      'Método SDD em 7 passos (0 Constituição, 1 spec.md v1.0 com RFnn e Dado/Quando/Então, 2 Clarificação spec.md v2.0, 3 plan.md com "## Mapeamento do código" e "## Conformidade com a Constituição", ' +
      '4 tasks.md com tNN e cards, 5 analise.md com achados Ann, 6 testes.md e card qa). Estado só pelo bin <raiz>/bin/sdd-state (init, status, check, iniciar N, concluir N --versao --resumo, ajuste, ' +
      'pergunta add|responder, achado add|resolver|aceitar, card add|editar|revisar, impacto registrar|aplicado, comentario classificar, duvida add, json) gravando sdd-state.json, .tarefas.json, .impactos.json, .duvidas.json. ' +
      'Nunca aprova passo (só a pessoa). Modo [segundo plano] sem AskUserQuestion. Modos [triagem], [impacto] e [aplicar] para comentários novos do ticket. Hooks que bloqueiam edição direta dos JSONs de estado e do "aprovar".'
  },
  'refinamento.foco': {
    padrao: { tipo: 'local', id: 'foco', nome: 'foco', caminho: LOCAL('foco') },
    como: 'hooks (--plugin-dir)',
    contrato:
      'Hooks sem skill: SessionStart injeta regras de escrita curta em PT-BR; PostToolUse em Write/Edit mede os .md (limites: spec 300 linhas, plan 350, tasks 300, analise 200, constitution 450, testes 450, mapa-* 350; ' +
      '90 palavras por parágrafo, 35 por frase) e devolve exit 2 com o que enxugar. Substitui o i-have-adhd, que fica desligado nas execuções.'
  },
  'refinamento.mapa': {
    padrao: { tipo: 'local', id: 'mapa', nome: 'mapa', caminho: LOCAL('mapa'), skill: 'mapear' },
    como: 'skill mapa:mapear + bins (--plugin-dir)',
    contrato:
      'Passo 3: grava mapa-backend.md e/ou mapa-mobile.md na pasta da spec com Camadas por RF, Onde o fluxo vive, Inventário invertido (RF | Hoje | Desejado | Menor mudança | Quem mais passa aqui), ' +
      'Contratos, Banco, O que não vamos criar, Riscos; evidências arquivo:linha. Bins <raiz>/bin/mapa-git (git só leitura), mapa-db (SELECT só leitura, máx. 50 linhas, colunas sensíveis mascaradas, log em MAPA_DB_LOG, ' +
      'recusa produção; env MAPA_DB_CONEXAO/AMBIENTE/SQLCL/SENSIVEIS) e mapa-conferir <mapa.md> --repo --db-log (confere as evidências).'
  },
  'refinamento.metodoQa': {
    padrao: {
      tipo: 'plugin',
      id: 'fcx-qa-test-planning@fcxlabs',
      nome: 'fcx-qa-test-planning',
      skill: 'jira-qa-planner'
    },
    como: 'lido como método (não invocado)',
    contrato:
      'Método do passo 6: testes.md em PT-BR com CT01… sequencial, Gherkin Dado que/Quando/Então, "📌 Validações:" com ✔, no mínimo 1 positivo, 1 negativo e 1 borda por RF, cada CT cita o RF e a subtarefa, ' +
      'regressão nomeada, "⚠️ (inferido)" no que não tem base na spec, templates de fluxo/tela e de API, estimativa em horas (modo detalhado). Não usa a ferramenta de tickets: a extensão cria o card [QA].'
  }
};

module.exports = { ETAPAS, VAGAS };
