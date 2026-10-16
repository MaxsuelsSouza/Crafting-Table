// @ts-check
// Blocos do prompt-base de toda execução: escrita pelo gravador, ticket por documento, explicação do dev e tipo do ticket (quebrar).
const path = require('path');
const jira = require('../../../infra/provedores/fachada').jira;
const tickets = require('../../../infra/ticket/tickets');
const { pasta } = require('../../../infra/ticket/pasta-ticket');
const { briefingDe, BRIEFING } = require('../locais');
const { papelDoTicket } = require('../estado');
const { GRAVAR } = require('./ferramentas');

const ESCRITA =
  `\nESCRITA: nesta execução não existe Write nem Edit. Para gravar um arquivo da spec ("grave em <pasta da spec>/NOME") use ${GRAVAR} NOME <<'FIM' … FIM ` +
  '(texto pela entrada padrão, só o nome do arquivo, sem pasta; aceita .md da pasta da spec, constitution.md e .memoria-passo-N.md). Para alterar um arquivo, leia, aplique a mudança e grave o conteúdo inteiro de novo.';
// Ticket por documento: o documento é o ticket. Grava o contexto (descrição, subtarefas, comentários, caminho do original) na pasta do
// ticket, de forma síncrona, e devolve o bloco do prompt. Ticket do Jira: ''.
const CONTEXTO = '.contexto-ticket.md';
const blocoDocumento = (t) => {
  if (!jira.ehDocumento(t)) return '';
  const d = pasta(t.chave),
    ctx = require('../../../infra/ticket/contexto');
  const doc = tickets.ler(t.chave)?.documento || t.documento || {};
  let arq = path.join(d, CONTEXTO);
  try {
    const regravar = () => {
      try {
        ctx.gravarContexto(
          d,
          CONTEXTO,
          require('../../../infra/provedores/documento').buscarSync({ key: t.chave }),
          tickets.ler(t.chave) || t
        );
      } catch {
        /* pasta sumiu */
      }
    };
    regravar();
    ctx.prepararDocumento(tickets.ler(t.chave) || t).then(regravar, () => {}); // extração (docx/pdf) assíncrona: o contexto é regravado com o texto
  } catch {
    /* sem contexto: o prompt ainda aponta o original */
  }
  return (
    `\nTicket por documento (sem ferramenta de gestão). Contexto do ticket: ${arq}. Documento original: ${doc.arquivo ? path.join(d, doc.arquivo) : '(sem arquivo)'} ` +
    '(imagem e PDF: leia com Read; se houver páginas em .documento-paginas/, leia as imagens). Trate este contexto como o ticket: o passo 1 usa como insumo; não use ferramenta de tickets.'
  );
};
// O que o dev explicou quando o ticket só tinha título (aba Spec): fonte verbal, de confiança menor que a spec aprovada.
const blocoBriefing = (t) =>
  briefingDe(pasta(t.chave))
    ? `\nExplicação do dev (fonte verbal; o ticket sozinho não bastava): ${path.join(pasta(t.chave), BRIEFING)}. Leia antes do passo 1, trate como insumo e marque o que só vem dela.`
    : '';
// Ticket que se quebra (Épico, Feature…): a spec descreve o escopo e a saída são itens do tipo abaixo, não subtarefas de dev.
const blocoTipo = (t) => {
  const { papel, tipo, filho } = papelDoTicket(t);
  if (papel !== 'quebrar') return '';
  const itens = filho ? `itens do tipo "${filho}"` : 'itens do nível abaixo';
  return (
    `\nTipo do ticket: ${tipo || '?'} (papel: quebrar). Este refinamento NÃO é de desenvolvimento: o resultado são ${itens}, que o time refina depois, um a um. ` +
    `Passos 1 e 2: especificação do escopo (o quê e por quê, critérios de aceite, sem tecnologia). Passo 3 (plan.md): "## Decomposição", como o escopo se divide em ${itens}, ordem e dependências; ` +
    'NÃO mapeie código nem consulte banco. Passo 4: cada card (sdd-state card) é UM item, com título, objetivo e critérios de aceite na descrição; nada de subtarefas técnicas, camadas ou estimativa em horas. ' +
    'Os passos 5 e 6 não existem neste escopo (init --escopo quebrar os dispensa).'
  );
};

module.exports = { ESCRITA, CONTEXTO, blocoDocumento, blocoBriefing, blocoTipo };
