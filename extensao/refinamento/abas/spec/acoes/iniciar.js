// @ts-check
// Iniciar o refinamento (▶ refinar): tipo do ticket, ticket só com título e a execução que cria a spec. As respostas às pausas: pausas.js.
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const tickets = require('../../../../infra/tickets');
const jira = require('../../../../infra/ticket').jira;
const { sobreTicket } = require('../../../../implementacoes/dossie');
const { SPECS_PADRAO } = require('../../../../configuracao/configuracao');
const { estadoSpec, gravarRefino } = require('../../../locais');
const hierarquia = require('../../../hierarquia');
const orq = require('../../../orquestrador');
const { pasta } = require('../comum');
const { modo } = require('../cabecalho');
const { PERGUNTAS_BRIEFING } = require('../pausa');

const briefingFeito = (t) => require('../../../locais').briefingDe(pasta(t.chave)) !== '';
// Descrição ou documento do ticket bastam? j = ticket do provedor; sem ele (ainda não buscou, erro de rede) não dá para medir e não bloqueia.
const suficiente = (t, j) => !j || j.erro || sobreTicket(t, j).suficiente;

const acoes = (s) => ({
  // ▶ Iniciar refinamento: modo aguardando_inicio + conversa nova que o hook do plugin sdd acorda com o /sdd:iniciar.
  // A spec mora no repositório de specs (craftingTable.specsDir), em <CHAVE>-<slug>/. Spec já existente: continua de onde parou.
  async refinar() {
    const t = s.ticketAberto();
    if (!t) return;
    if (estadoSpec(t)) {
      s.mudarAba('spec');
      return require('.').acoes(s).retomar();
    } // retomar mora em controle.js
    let repo = t.spec?.repo || vscode.workspace.getConfiguration('craftingTable').get('specsDir') || SPECS_PADRAO;
    if (!fs.existsSync(repo)) {
      const uri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        title: 'Repositório de specs (onde a spec vai morar)',
        openLabel: 'Usar este repositório'
      });
      if (!uri) return;
      repo = uri[0].fsPath;
    }
    let j;
    try {
      j = jira.ehDocumento(t)
        ? require('../../../../provedores/documento').buscarSync({ key: t.chave })
        : s.cacheJira?.[t.chave];
    } catch {
      /* sem dados: não bloqueia */
    }
    // Tipo do ticket (hierarquia Épico > Feature > História > Subtarefa): o que se refina depende dele. Sem o tipo (ticket por documento,
    // ainda não buscou) segue como desenvolvimento; tipo fora das variáveis: pergunta o que ele é e grava lá.
    let papel = { papel: 'desenvolver' };
    if (j?.tipo && !jira.ehDocumento(t)) {
      const h = hierarquia.papelDe(j.tipo);
      if (!h) {
        gravarRefino(pasta(t.chave), {
          pausa: {
            motivo: 'tipo',
            tipo: j.tipo,
            pergunta: `${t.chave} é do tipo “${j.tipo}”, que ainda não está na hierarquia dos tipos (Configurações › variáveis). O que um ticket deste tipo é para o time?`
          }
        });
        s.mudarAba('spec');
        s.render();
        return;
      }
      if (h.papel === 'executar') {
        const pai = j.pai ? ` (${j.pai})` : '';
        return vscode.window.showWarningMessage(
          `${t.chave} é do tipo “${j.tipo}”, que já é a unidade de trabalho. Refine o ticket pai${pai}: é ali que nascem as subtarefas.`
        );
      }
      papel = h;
    }
    // Ticket só com título: pergunta ao dev antes de gastar uma execução (nunca invenção). Já explicou? segue com o briefing.
    if (!briefingFeito(t) && !suficiente(t, j)) {
      gravarRefino(pasta(t.chave), {
        pausa: {
          motivo: 'briefing',
          pergunta:
            'O ticket só tem o título: não há o que refinar sem saber o que se quer. Responda para o Claude começar.',
          perguntas: PERGUNTAS_BRIEFING
        }
      });
      s.mudarAba('spec');
      s.render();
      return;
    }
    modo(t.chave, 'aguardando_inicio');
    tickets.gravar({
      ...tickets.ler(t.chave),
      refinamento: {
        ...tickets.ler(t.chave).refinamento,
        iniciadoPor: os.userInfo().username,
        papel: papel.papel,
        tipoTicket: j?.tipo || null,
        filho: papel.filho || null
      }
    });
    s.mudarAba('spec'); // o refinamento acontece na aba Spec
    s.atualizarJira(t.chave); // anexos do ticket aparecem em Docs para baixar
    // Maestro (prova): o Claude roda em segundo plano e a caixa Ao vivo da aba Spec mostra o que ele faz.
    orq.etapa(
      t,
      `/sdd:iniciar ${pasta(t.chave)} ${repo}${tickets.ler(t.chave)?.titulo && jira.ehDocumento(t) ? `\nTítulo do ticket (use em sdd-state init --titulo, é o slug da pasta da spec): ${tickets.ler(t.chave).titulo}` : ''}\nTicket aguardando início: só crie a spec (init + status) e termine dizendo para clicar em Dar início.`,
      false,
      repo,
      'Criando a spec do ticket',
      undefined,
      true
    );
    s.render();
  }
});

module.exports = { acoes };
