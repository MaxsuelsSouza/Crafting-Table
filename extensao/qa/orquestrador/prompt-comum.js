// @ts-check
// Texto comum aos prompts do Claude em segundo plano (massa, cenário, pré-condição, análise do ambiente): skill, qa-state, regras e citações.
const fs = require('fs');
const path = require('path');
const vagas = require('../../agentes/etapas');

// Skill de cada etapa (Configurações > Plugins, agentes/etapas.js; padrão: ~/.claude/skills/testes-funcionais): ambiente (preparo e diagnóstico) e execução (massa e cenários).
const SKILL = () => vagas.pastaSkill('qa.execucao') || '';
const SKILL_AMB = () => vagas.pastaSkill('qa.ambiente') || '';
// ── Prompts do Claude em segundo plano (execução). A skill testes-funcionais é o método; as paradas dela viram registro.
const QA_STATE = path.join(__dirname, '..', 'bin', 'qa-state');
// Falta informação que só o humano tem (qual usuário, regra ambígua) e nenhuma fonte responde: o Claude PERGUNTA (qa-state pausa) em vez de inventar.
// A extensão mostra a pergunta no cartão e retoma com a resposta (.respostas.md).
const REGRAS =
  'Modo não interativo, sem ninguém para aprovar permissões. Não invente dado nem regra: o que não consta nas fontes você pergunta. ' +
  `Para perguntar ao humano: ${QA_STATE} pausa --motivo "<curto>" --pergunta "<o que falta, em uma frase>" [--opcoes "A|B"] e TERMINE em seguida, sem concluir o cenário. ` +
  'Bloqueio de fluxo ou tela, falha de ambiente ou de ferramenta: NÃO conclua nem pule o cenário. Pause com o qa-state (pausa, descrevendo o bloqueio: tela, passo e o que viu) e TERMINE: o humano é avisado e instrui. Zero skip. ' +
  'Proibido: escrever no banco por conta própria (INSERT/UPDATE/DELETE/DDL, liberar usuário ou permissão; a alteração de massa só vai por qa-state massa proposta, que o humano aprova antes de rodar), publicar no provedor, commit, push, merge e rebase. ' +
  `Grave tudo do QA com ${QA_STATE} (a pasta ~/.claude é bloqueada para escrita).`;
const RESPOSTAS = '.respostas.md',
  PAUSA = '.pausa.json';
const citarRespostas = (dir) =>
  fs.existsSync(path.join(dir, RESPOSTAS))
    ? `\nRespostas do humano a perguntas anteriores (use-as): ${path.join(dir, RESPOSTAS)}`
    : '';
const citarDossie = (dir) =>
  fs.existsSync(path.join(dir, 'dossie.md'))
    ? `\nDossiê do ticket (fontes, confiança e lacunas): ${path.join(dir, 'dossie.md')}`
    : '';

module.exports = { SKILL, SKILL_AMB, QA_STATE, REGRAS, RESPOSTAS, PAUSA, citarRespostas, citarDossie };
