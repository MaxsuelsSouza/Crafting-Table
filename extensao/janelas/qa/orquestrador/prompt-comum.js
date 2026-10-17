// @ts-check
// Texto comum aos prompts do Claude em segundo plano (massa, cenário, pré-condição, análise do ambiente): skill, qa-state, regras e citações.
const fs = require('fs');
const path = require('path');
const vagas = require('../../../infra/agentes/etapas');
const { estado } = require('../estado');

// Skill de cada etapa (Configurações > Plugins, infra/agentes/etapas.js; padrão: ~/.claude/skills/testes-funcionais): ambiente (preparo e diagnóstico) e execução (massa e cenários).
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
  'Proibido: INSERT, DELETE e DDL no banco, UPDATE sem WHERE pela chave do registro, liberar usuário ou permissão (UPDATE só pelo MCP sqlcl, quando o banco vier por ele; no modo antigo a alteração de massa vai por qa-state massa proposta, que o humano aprova), publicar no provedor, commit, push, merge e rebase. ' +
  `Grave tudo do QA com ${QA_STATE} (a pasta ~/.claude é bloqueada para escrita); a sintaxe está neste prompt, não leia o fonte do qa-state. ` +
  'Chame os scripts pelo caminho completo, como está neste prompt (sem guardar caminho em variável de shell). ' +
  'Não leia .decisoes.json, .ao-vivo.jsonl, .mapa-db.jsonl nem .massa.json (registros da extensão, enormes): o que você precisa já está neste prompt.';
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

// Onde está o código do ticket (etapas/03-ambiente/subetapas/codigo.js): ler pela ref, nunca por checkout.
const MAPA_GIT = path.join(__dirname, '..', '..', '..', 'infra', 'plugins', 'mapa', 'bin', 'mapa-git');
const citarCodigo = (dir) =>
  Object.entries(estado(dir).codigo || {})
    .map(
      ([repo, c]) =>
        `\nCódigo do ticket (${repo}) em \`${c.ref}\`: leia com ${MAPA_GIT} ${c.caminho || '<repositório>'} show ${c.ref}:<arquivo> ou log -p ${c.ref}, sem checkout.`
    )
    .join('');

// Aba Conhecimentos: a regra (procurar antes, gravar o que descobrir) e o índice do que já existe.
const citarConhecimentos = () => {
  const k = require('../conhecimentos'); // ciclo: conhecimentos/indice.js lê o QA_STATE daqui
  return `\n${k.regra()}${k.indice()}`;
};

module.exports = {
  SKILL,
  SKILL_AMB,
  QA_STATE,
  REGRAS,
  RESPOSTAS,
  PAUSA,
  citarRespostas,
  citarDossie,
  citarCodigo,
  citarConhecimentos
};
