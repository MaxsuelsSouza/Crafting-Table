// @ts-check
// Campos do card pendente: estimativa e responsável.
const vscode = require('vscode');
const jira = require('../../../../infra/ticket').jira;
const { escolherPessoa } = require('../../../../componentes/escolher-pessoa');
const { TAREFAS, tarefasDe } = require('../../../locais');
const { ondeNome } = require('../rotulos');

const acoes = (s) => ({
  tarefaCampo({ id, campo, valor }) {
    const l = tarefasDe(s.pasta(s.aberto)),
      c = l.find((x) => x.id === id);
    if (!c || c.status !== 'pendente') return;
    if (campo === 'estimativa') {
      const v = String(valor || '').trim();
      if (v && !/^(\d+(\.\d+)?[wdhm]\s*)+$/i.test(v))
        return vscode.window.showWarningMessage(
          `Estimativa no formato do ${ondeNome(s.ticketAberto())}: 30m, 2h, 1d ou 1d 4h.`
        );
      if ((c.estimativa || '') === v) return;
      c.estimativa = v;
    } else return;
    s.gravar(s.aberto, TAREFAS, l);
  },
  // Responsável: UMA pessoa, escolhida na mesma busca das menções do comentário (pessoas do ticket). "Eu" e "Sem responsável" no topo.
  async tarefaResponsavel({ id }) {
    const t = s.ticketAberto();
    const c = t && tarefasDe(s.pasta(t.chave)).find((x) => x.id === id);
    if (!c || c.status !== 'pendente') return;
    let eu = null;
    try {
      eu = await jira.eu(s.secrets, t.site);
    } catch {
      /* sem "Eu": a busca continua */
    }
    const atual = c.responsavel?.nome || (c.vinculado ? 'você' : '');
    const r = await escolherPessoa({
      titulo: `Responsável por ${c.id}${atual ? ` (hoje: ${atual})` : ''}`,
      placeholder: `Digite parte do nome ou do e-mail para buscar no ${ondeNome(t)}`,
      buscar: (q) => jira.pessoas(s.secrets, jira.alvo(t), q),
      fixas: [
        ...(eu ? [{ label: `$(account) Eu (${eu.nome})`, pessoa: { id: eu.id, nome: eu.nome } }] : []),
        { label: '$(circle-slash) Sem responsável', pessoa: null }
      ]
    });
    if (!r) return;
    const l = tarefasDe(s.pasta(t.chave)),
      x = l.find((y) => y.id === id);
    if (!x || x.status !== 'pendente') return;
    delete x.vinculado;
    if (r.pessoa) x.responsavel = { id: r.pessoa.id, nome: r.pessoa.nome };
    else delete x.responsavel;
    s.gravar(t.chave, TAREFAS, l);
    s.render();
  }
});

module.exports = { acoes };
