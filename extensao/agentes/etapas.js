// @ts-check
const fs = require('fs');
const os = require('os');
const path = require('path');

// Etapas de cada módulo e o plugin ou skill que cada uma usa (só para agentes com plugins, hoje o Claude Code).
// Uma "vaga" (slot) é o lugar de um plugin/skill no fluxo; várias etapas podem dividir a mesma vaga. A pessoa troca o ocupante
// em Configurações > Plugins (craftingTable.pluginsEtapa = { vaga: Escolha }); sem troca vale o padrão. O código das etapas
// pergunta aqui o caminho (raiz, pastaSkill, pluginDirs) em vez de ter o caminho fixo, então a troca vale na próxima execução.
//   Escolha = { tipo: 'plugin' (instalado no agente) | 'skill' (pasta com SKILL.md) | 'local' (plugin da extensão, --plugin-dir),
//               id, nome, caminho? (skill/local), skill? (plugin: qual skill dele) }

const LOCAL = (n) => path.join(__dirname, '..', 'plugins', n);
const SKILLS = path.join(os.homedir(), '.claude', 'skills');

// contrato: o que a extensão espera de quem ocupa a vaga (base da verificação por IA de um substituto).
const VAGAS = {
  'refinamento.sdd': {
    padrao: { tipo: 'plugin', id: 'sdd@crafting-local', nome: 'sdd', skill: 'sdd' }, como: 'skill invocada + bin sdd-state + hooks',
    contrato: 'Método SDD em 7 passos (0 Constituição, 1 spec.md v1.0 com RFnn e Dado/Quando/Então, 2 Clarificação spec.md v2.0, 3 plan.md com "## Mapeamento do código" e "## Conformidade com a Constituição", '
      + '4 tasks.md com tNN e cards, 5 analise.md com achados Ann, 6 testes.md e card qa). Estado só pelo bin <raiz>/bin/sdd-state (init, status, check, iniciar N, concluir N --versao --resumo, ajuste, '
      + 'pergunta add|responder, achado add|resolver|aceitar, card add|editar|revisar, impacto registrar|aplicado, comentario classificar, duvida add, json) gravando sdd-state.json, .tarefas.json, .impactos.json, .duvidas.json. '
      + 'Nunca aprova passo (só a pessoa). Modo [segundo plano] sem AskUserQuestion. Modos [triagem], [impacto] e [aplicar] para comentários novos do ticket. Hooks que bloqueiam edição direta dos JSONs de estado e do "aprovar".'
  },
  'refinamento.foco': {
    padrao: { tipo: 'local', id: 'foco', nome: 'foco', caminho: LOCAL('foco') }, como: 'hooks (--plugin-dir)',
    contrato: 'Hooks sem skill: SessionStart injeta regras de escrita curta em PT-BR; PostToolUse em Write/Edit mede os .md (limites: spec 300 linhas, plan 350, tasks 300, analise 200, constitution 450, testes 450, mapa-* 350; '
      + '90 palavras por parágrafo, 35 por frase) e devolve exit 2 com o que enxugar. Substitui o i-have-adhd, que fica desligado nas execuções.'
  },
  'refinamento.mapa': {
    padrao: { tipo: 'local', id: 'mapa', nome: 'mapa', caminho: LOCAL('mapa'), skill: 'mapear' }, como: 'skill mapa:mapear + bins (--plugin-dir)',
    contrato: 'Passo 3: grava mapa-backend.md e/ou mapa-mobile.md na pasta da spec com Camadas por RF, Onde o fluxo vive, Inventário invertido (RF | Hoje | Desejado | Menor mudança | Quem mais passa aqui), '
      + 'Contratos, Banco, O que não vamos criar, Riscos; evidências arquivo:linha. Bins <raiz>/bin/mapa-git (git só leitura), mapa-db (SELECT só leitura, máx. 50 linhas, colunas sensíveis mascaradas, log em MAPA_DB_LOG, '
      + 'recusa produção; env MAPA_DB_CONEXAO/AMBIENTE/SQLCL/SENSIVEIS) e mapa-conferir <mapa.md> --repo --db-log (confere as evidências).'
  },
  'refinamento.metodoQa': {
    padrao: { tipo: 'plugin', id: 'fcx-qa-test-planning@fcxlabs', nome: 'fcx-qa-test-planning', skill: 'jira-qa-planner' }, como: 'lido como método (não invocado)',
    contrato: 'Método do passo 6: testes.md em PT-BR com CT01… sequencial, Gherkin Dado que/Quando/Então, "📌 Validações:" com ✔, no mínimo 1 positivo, 1 negativo e 1 borda por RF, cada CT cita o RF e a subtarefa, '
      + 'regressão nomeada, "⚠️ (inferido)" no que não tem base na spec, templates de fluxo/tela e de API, estimativa em horas (modo detalhado). Não usa a ferramenta de tickets: a extensão cria o card [QA].'
  },
  'qa.ambiente': {
    padrao: { tipo: 'skill', id: 'testes-funcionais', nome: 'testes-funcionais', caminho: path.join(SKILLS, 'testes-funcionais') }, como: 'script executado + referências lidas',
    contrato: 'Script <raiz>/assets/backend/preparar-ambiente.py --chave KEY --json [--build-app], idempotente, que sobe API (5111), Metro (8081), emulador e app; imprime linhas "[ OK|FEITO|PEND.|AVISO] texto" '
      + 'e uma última linha JSON {parou_em (null se ok), itens[{item, verdito, detalhe}], ref, backend, mobile, pendentes, app}. Referências references/diagnostico.md e references/ambiente-execucao.md para analisar quando o preparo para.'
  },
  'qa.execucao': {
    padrao: { tipo: 'skill', id: 'testes-funcionais', nome: 'testes-funcionais', caminho: path.join(SKILLS, 'testes-funcionais') }, como: 'SKILL.md lido como método',
    contrato: 'SKILL.md com o método de execução de um cenário (CTnn) no app/API e o método de massa de dados (consultas só leitura na cópia de produção). Funciona sem AskUserQuestion: onde mandaria parar, pausa pelo qa-state (pausa) e aguarda o humano; nunca pula cenário nem segue sem resposta. '
      + 'O Claude registra pelo qa-state da extensão (massa add, evidencia CTnn, cenario CTnn concluir --status passou|falhou|sem-massa; precondicao --status ok|falhou antes da suíte: health check e login). Jornada mobile por Maestro/adb (references/jornada-mobile-maestro.md).'
  },
  'impl.mapa': {
    padrao: { tipo: 'local', id: 'mapa', nome: 'mapa', caminho: LOCAL('mapa') }, como: 'bins mapa-db, mapa-git e mapa-conferir (--plugin-dir)',
    contrato: 'Bins <raiz>/bin/mapa-git (git só leitura), mapa-db (SELECT só leitura, recusa produção) e mapa-conferir <mapa.md> --repo --db-log (confere as evidências) para a Varredura do código e o Plano de mudança da esteira de Implementação.'
  },
  ...require('../incidentes/etapas').VAGAS // vagas do Incidente: incidentes/etapas/index.js
};

// subetapas: [{ nome, vaga }] — a etapa-mãe não tem vaga própria; cada subetapa tem a sua (Etapa 4 → 4.1, 4.2).
// Etapas na ordem de cada módulo (a tela numera: Etapa 1, Etapa 2…); vaga null = a etapa não usa plugin nem skill (só o prompt da extensão).
// todas: vale para todas as etapas do módulo (aparece no fim, sem número).
const MODULOS = [
  { id: 'refinamento', nome: 'Refinamento', etapas: [
    { nome: 'Constituição', vaga: 'refinamento.sdd' },
    { nome: 'Especificação', vaga: 'refinamento.sdd' },
    { nome: 'Clarificação', vaga: 'refinamento.sdd' },
    { nome: 'Plano técnico', subetapas: [{ nome: 'Mapeamento do código', vaga: 'refinamento.mapa' }, { nome: 'Plano técnico', vaga: 'refinamento.sdd' }] },
    { nome: 'Tarefas', vaga: 'refinamento.sdd' },
    { nome: 'Análise de qualidade', vaga: 'refinamento.sdd' },
    { nome: 'Plano de testes', vaga: 'refinamento.metodoQa' },
    { nome: 'Comentários novos (triagem, impacto, aplicar)', vaga: 'refinamento.sdd' },
    { nome: 'Regras de escrita', vaga: 'refinamento.foco', todas: true }] },
  { id: 'impl', nome: 'Implementação', etapas: [
    { nome: 'Dossiê', vaga: null, obs: 'a extensão lê o disco do ticket, sem IA' },
    { nome: 'Entendimento', vaga: null },
    { nome: 'Varredura do código', vaga: 'impl.mapa' },
    { nome: 'Plano de mudança', vaga: 'impl.mapa' },
    { nome: 'Implementação', vaga: null },
    { nome: 'Verificação', vaga: null, obs: 'comandos de build e teste de Configurações > Comandos' },
    { nome: 'Resumo', vaga: null }] },
  { id: 'qa', nome: 'QA', etapas: [
    { nome: 'Planejamento', vaga: null, obs: 'método embutido na extensão' },
    { nome: 'Cenários', vaga: null },
    { nome: 'Ambiente', vaga: 'qa.ambiente' },
    { nome: 'Pré-condição (health check e login)', vaga: 'qa.execucao', obs: 'roda antes da suíte, fora da lista de cenários' },
    { nome: 'Massa de dados', vaga: 'qa.execucao' },
    { nome: 'Execução de cada cenário', vaga: 'qa.execucao' },
    { nome: 'Publicar', vaga: null }] },
  { id: 'incidentes', nome: 'Incidentes', etapas: require('../incidentes/etapas').ETAPAS.map(({ nome, vaga }) => ({ nome, vaga })) }
];
// Marca de cada etapa na ordem do módulo: "Etapa N" (ou "Todas as etapas") + nome; subs = [{ marca: "N.1", nome, vaga }]. titulos = o texto corrido ("Etapa N. Nome").
const marcas = (m) => { let n = 0; return m.etapas.map((e) => { const marca = e.todas ? 'Todas as etapas' : `Etapa ${++n}`;
  return { marca, nome: e.nome, subs: (e.subetapas || []).map((x, i) => ({ marca: `${n}.${i + 1}`, nome: x.nome, vaga: x.vaga })) }; }); };
const titulos = (m) => marcas(m).map((x) => (x.marca.startsWith('Etapa') ? `${x.marca}. ${x.nome}` : `${x.marca} · ${x.nome}`));

const ler = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const config = () => { try { return require('vscode').workspace.getConfiguration('craftingTable'); } catch { return null; } }; // sem vscode (testes): só o padrão
const trocas = () => config()?.get?.('pluginsEtapa') || {};

/** @returns {{ tipo: string, id: string, nome: string, caminho?: string, skill?: string }} */
const escolha = (vaga) => trocas()[vaga] || VAGAS[vaga].padrao;
const ehPadrao = (vaga) => !trocas()[vaga];
// Caminho de instalação de um plugin do Claude Code (installed_plugins.json), null se não instalado.
function instalado(id) {
  const reg = ler(path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json'), {});
  const v = (reg.plugins || reg)[id];
  return (Array.isArray(v) ? v[0] : v)?.installPath || null;
}
// Raiz do ocupante: pasta do plugin (bins, hooks) ou da skill. null = não está na máquina.
const raiz = (vaga) => { const e = escolha(vaga); return e.tipo === 'plugin' ? instalado(e.id) : e.caminho || null; };
// Pasta da skill (onde está o SKILL.md): plugin com skill → <raiz>/skills/<skill>; skill avulsa → a própria pasta.
const pastaSkill = (vaga) => { const e = escolha(vaga), r = raiz(vaga); return r && e.tipo !== 'skill' && e.skill ? path.join(r, 'skills', e.skill) : r; };
// --plugin-dir para o claude: só o que mora fora do registro do agente (plugins da extensão). Instalados já carregam sozinhos.
const pluginDirs = (vaga) => { const e = escolha(vaga); return e.tipo === 'local' && e.caminho ? ['--plugin-dir', e.caminho] : []; };
// Nome curto para o prompt ("plugin:skill" ou "skill").
const rotulo = (vaga) => { const e = escolha(vaga); return e.skill && e.tipo !== 'skill' ? `${e.nome}:${e.skill}` : e.nome; };
// Frase para o prompt quando a vaga foi trocada: o texto da etapa cita o padrão; o Claude usa o substituto no lugar.
const aviso = (vaga) => (ehPadrao(vaga) ? '' : `\nNo lugar de ${VAGAS[vaga].padrao.nome}, use ${rotulo(vaga)} (${pastaSkill(vaga) || 'não instalado'}): onde o texto citar ${VAGAS[vaga].padrao.nome}, siga ${rotulo(vaga)}.`);
// Onde a vaga aparece (para o card dizer que trocar vale para todas as etapas dela): "Módulo · Etapa N. Nome" ou "Módulo · Etapa N.K Subetapa".
const usos = (vaga) => MODULOS.flatMap((m) => { const t = titulos(m), ms = marcas(m);
  return m.etapas.flatMap((e, i) => [...(e.vaga === vaga ? [`${m.nome} · ${t[i]}`] : []), ...ms[i].subs.filter((x) => x.vaga === vaga).map((x) => `${m.nome} · Etapa ${x.marca} ${x.nome}`)]); });

module.exports = { VAGAS, MODULOS, marcas, titulos, escolha, ehPadrao, raiz, pastaSkill, pluginDirs, rotulo, aviso, usos, instalado };
