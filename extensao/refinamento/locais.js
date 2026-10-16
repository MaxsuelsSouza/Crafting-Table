// @ts-check
const fs = require('fs');
const path = require('path');
// Comuns a todos os módulos (infra/): leitores da pasta do ticket e a spec. Reexportados abaixo, com os mesmos nomes de sempre.
const { pasta, ler, lerTexto, NOTAS, ORIGEM, decisoesDe, ticketDe } = require('../infra/pasta-ticket');
const {
  HANDOFF,
  HANDOFF_LEGADO,
  dirSpec,
  arqHandoff,
  docsDaSpec,
  TAREFAS,
  tarefasDe,
  estadoSpec,
  comSpec
} = require('../infra/spec');

// FONTE ÚNICA de "onde cada coisa mora". Mudou um local? Muda só aqui (painel, prompts e abas leem daqui).
//
// PASTA DO TICKET  ~/.claude/tickets/<CHAVE>/  (o Claude NÃO escreve aqui com Write: "arquivo sensível")
//   <qualquer arquivo>       aba Docs (anexos do Jira + atalhos do hook documentos.py)
//   .notas.html              aba Notas            .origem.json     de onde veio cada doc baixado
//   .tarefas.json            aba Tarefas          .duvidas.json    aba Dúvidas
//   .decisoes.json           aba Decisões         .impactos.json   vigia de comentários
//   evidencias/              aba Evidências       aprovados/       cópia de cada passo aprovado
//   .ao-vivo.jsonl           caixa "Ao vivo"      .notificacoes.*  sino
// PASTA DA SPEC    <repo de specs>/<spec.dir>/    (versionada; o Claude escreve aqui)
//   spec.md plan.md tasks.md analise.md testes.md + qualquer outro .md  → aba Docs
//   mapa-backend.md, mapa-mobile.md                                    → aba Análise (NÃO aparecem em Docs)
//   sdd-state.json           estado do SDD (só o sdd-state altera)
// RAIZ DO REPO DE SPECS    <repo>/constitution.md  (passo 0)             → aba Docs
const NOMES = {
  notas: '.notas.html',
  origem: '.origem.json',
  tarefas: '.tarefas.json',
  duvidas: '.duvidas.json',
  impactos: '.impactos.json',
  decisoes: '.decisoes.json'
};
const PASSOS = { 1: 'spec.md', 2: 'spec.md', 3: 'plan.md', 4: 'tasks.md', 5: 'analise.md', 6: 'testes.md' };

const arquivoPasso = (r, n) => (n === 0 ? path.join(r.spec.repo, 'constitution.md') : path.join(dirSpec(r), PASSOS[n]));

const DUVIDAS = '.duvidas.json'; // gravado pelo `sdd-state duvida add` (opção "Tirar dúvida" nas perguntas do Claude)
const duvidasDe = (dir) => {
  const l = dir ? ler(path.join(dir, DUVIDAS), []) : [];
  return Array.isArray(l) ? l : [];
};
const textoDuvida = (x) =>
  `Dúvida levantada no refinamento: ${x.texto}${x.contexto ? `\nContexto: ${x.contexto}` : ''}`;
// Estado da própria extensão no refinamento (a IA não grava aqui): { pausa?: { motivo, pergunta, detalhe? }, correcao?: { passo, tentativas } }.
// pausa.motivo: 'briefing' (ticket só com título: o dev explica) | 'verificacao' (o passo não ficou pronto depois das correções).
const REFINO = '.refinamento.json';
const BRIEFING = '.briefing-refinamento.md'; // o que o dev explicou quando o ticket não bastava: fonte verbal do passo 1
const refinoDe = (dir) => {
  const v = dir ? ler(path.join(dir, REFINO), {}) : {};
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
};
const gravarRefino = (dir, patch) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, REFINO),
    JSON.stringify({ ...refinoDe(dir), ...patch, atualizado: new Date().toISOString() }, null, 2)
  );
};
const briefingDe = (dir) => (dir ? lerTexto(path.join(dir, BRIEFING)) || '' : '').trim();
const IMPACTOS = '.impactos.json'; // comentários do Jira em análise/analisados (vigia de mudanças)
const impactosDe = (dir) => {
  const l = dir ? ler(path.join(dir, IMPACTOS), []) : [];
  return Array.isArray(l) ? l : [];
};

// Frase que o maestro manda ao Claude dizendo onde gravar.
const ondeSalvar = (r) =>
  dirSpec(r)
    ? `\nPasta da spec (grave aqui spec, plano, testes e qualquer documento para o usuário; as análises vão em ${HANDOFF.backend}/${HANDOFF.mobile}, que aparecem na aba Análise; ~/.claude é bloqueada para escrita): ${dirSpec(r)}`
    : '';

module.exports = {
  NOMES,
  HANDOFF,
  HANDOFF_LEGADO,
  pasta,
  dirSpec,
  arquivoPasso,
  arqHandoff,
  docsDaSpec,
  ondeSalvar,
  ler,
  lerTexto,
  NOTAS,
  ORIGEM,
  TAREFAS,
  DUVIDAS,
  IMPACTOS,
  REFINO,
  BRIEFING,
  refinoDe,
  gravarRefino,
  briefingDe,
  decisoesDe,
  duvidasDe,
  tarefasDe,
  impactosDe,
  textoDuvida,
  ticketDe,
  estadoSpec,
  comSpec
};
