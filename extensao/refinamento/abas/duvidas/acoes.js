// @ts-check
// Cliques da aba Dúvidas: enviar ao ticket, responder, confirmar ou rejeitar a resposta sugerida por comentário.
const vscode = require('vscode');
const jira = require('../../../infra/provedores/fachada').jira;
const { DUVIDAS, duvidasDe, textoDuvida } = require('../../locais');
const { escolherMencoes } = require('./mencoes');
const { fecharDuvida } = require('./fechar');

const acoes = (s) => ({
  // Prévia + confirmação antes de publicar: o comentário fica visível para todo o time no Jira.
  async duvidaEnviar({ id }) {
    const t = s.ticketAberto();
    const l = t ? duvidasDe(s.pasta(t.chave)) : [];
    const x = l.find((y) => y.id === id);
    if (!x || x.enviadaEm) return;
    const local = jira.ehDocumento(t); // ticket-documento: o comentário fica no documento, sem menção nem rede
    const mencoes = local ? [] : await escolherMencoes(t, s.secrets);
    if (!mencoes) return;
    const ok = await vscode.window.showWarningMessage(
      local ? `Registrar a dúvida como comentário no documento ${t.chave}?` : `Comentar no ${t.chave}?`,
      {
        modal: true,
        detail:
          (local
            ? 'Fica só no documento (nada sai da máquina). Quem responder adiciona um comentário na aba Ticket.'
            : mencoes.length
              ? `Menciona: ${mencoes.map((m) => '@' + m.nome).join(', ')}`
              : 'Sem menção a ninguém.') +
          '\n\n' +
          textoDuvida(x)
      },
      'Enviar'
    );
    if (!ok) return;
    try {
      await jira.comentar(s.secrets, jira.alvo(t), textoDuvida(x), mencoes);
    } catch (e) {
      return vscode.window.showErrorMessage(e.message);
    }
    x.enviadaEm = new Date().toISOString();
    s.gravar(t.chave, DUVIDAS, l);
    vscode.window.showInformationMessage(
      local
        ? `${x.id} registrada nos comentários do documento ${t.chave}.`
        : `${x.id} enviada para os comentários do ${t.chave}.`
    );
    s.atualizarJira(t.chave);
  },
  async duvidaResponder({ id }) {
    const t = s.ticketAberto(),
      x = t && duvidasDe(s.pasta(t.chave)).find((y) => y.id === id);
    if (!x || x.resposta) return;
    const texto = (
      await vscode.window.showInputBox({
        title: `${id}: ${x.texto}`.slice(0, 120),
        prompt: 'Resposta da dúvida',
        ignoreFocusOut: true
      })
    )?.trim();
    if (texto) fecharDuvida(s, t, id, { texto, origem: 'manual' });
  },
  duvidaConfirmar({ id }) {
    const t = s.ticketAberto(),
      sug = t && duvidasDe(s.pasta(t.chave)).find((y) => y.id === id)?.sugestao;
    if (sug)
      fecharDuvida(s, t, id, {
        texto: sug.texto,
        origem: 'comentario',
        autor: sug.autor,
        comentarioId: sug.comentarioId,
        link: sug.link
      });
  },
  duvidaRejeitar({ id }) {
    const t = s.ticketAberto(),
      l = t ? duvidasDe(s.pasta(t.chave)) : [],
      x = l.find((y) => y.id === id);
    if (!x?.sugestao) return;
    (x.descartados ||= []).push(x.sugestao.comentarioId);
    x.sugestao = null;
    s.gravar(t.chave, DUVIDAS, l);
    s.render();
  }
});

module.exports = { acoes };
