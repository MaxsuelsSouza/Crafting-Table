// @ts-check
// Revisão de card já no Jira (mudança vinda de comentário): aplicar ou descartar.
const vscode = require('vscode');
const os = require('os');
const jira = require('../../../../../infra/provedores/fachada').jira;
const { TAREFAS, lerTexto, tarefasDe, impactosDe } = require('../../../locais');
const { ondeNome } = require('../rotulos');
const { descricaoJira } = require('../jira');

const acoes = (s) => ({
  // Revisão de card já no Jira: aplica o texto novo (descrição/título/estimativa) e comenta na subtarefa o motivo,
  // quem pediu a mudança (autor do comentário, com o link) e quem aplicou.
  async revisaoAplicar({ id }) {
    const t = s.ticketAberto();
    const c = t && tarefasDe(s.pasta(t.chave)).find((x) => x.id === id);
    if (!c?.revisao || !c.ticket) return;
    const novo = { ...c, ...c.revisao.campos };
    const descricao = c.tipo === 'qa' ? lerTexto(c.arquivo || '') : descricaoJira(t, novo);
    const origem = impactosDe(s.pasta(t.chave)).find((i) => i.link === c.revisao.comentario);
    const ok = await vscode.window.showWarningMessage(
      `Aplicar a alteração em ${c.ticket}?`,
      {
        modal: true,
        detail: `A descrição de ${c.ticket} será substituída${c.revisao.campos.titulo ? ' (e o título)' : ''} e um comentário vai registrar o motivo.\n\nMotivo: ${c.revisao.motivo}${origem ? `\nMudança pedida por: ${origem.autor}` : ''}`
      },
      `Aplicar no ${ondeNome(t)}`
    );
    if (!ok) return;
    let r = {},
      eu = { nome: os.userInfo().username };
    try {
      r = await jira.atualizarDescricao(s.secrets, { site: t.site }, c.ticket, descricao, {
        titulo: c.revisao.campos.titulo,
        estimativa: c.revisao.campos.estimativa
      });
      try {
        eu = await jira.eu(s.secrets, t.site);
      } catch {}
      await jira.comentar(
        s.secrets,
        { key: c.ticket, site: t.site },
        [
          '🔄 **Descrição atualizada pela Crafting Table**',
          '',
          `**Motivo:** ${c.revisao.motivo}`,
          origem
            ? `**Mudança pedida por:** ${origem.autor}${origem.link ? ` — [comentário em ${t.chave}](${origem.link})` : ''}`
            : c.revisao.comentario && !jira.ehDocumento(t)
              ? `**Origem:** [comentário](${c.revisao.comentario})`
              : null,
          `**Alteração feita por:** ${eu.nome}`
        ]
          .filter((x) => x !== null)
          .join('\n')
      );
    } catch (e) {
      return vscode.window.showErrorMessage(`Alteração não aplicada em ${c.ticket}: ${e.message}`);
    }
    const l = tarefasDe(s.pasta(t.chave)),
      x = l.find((y) => y.id === id);
    Object.assign(x, x.revisao.campos);
    (x.historico ||= []).push({
      em: new Date().toISOString(),
      evento: 'revisao',
      texto: `Alteração aplicada em ${c.ticket} (${x.revisao.motivo.slice(0, 120)})`
    });
    delete x.revisao;
    s.gravar(t.chave, TAREFAS, l);
    s.notificar(t.chave, 'jira', `subtarefa ${c.ticket} atualizada${origem ? ` por mudança de ${origem.autor}` : ''}`);
    vscode.window.showInformationMessage(
      `${c.ticket} atualizada e comentada.${r.aviso ? ` Atenção: ${r.aviso}.` : ''}`
    );
    s.render();
  },
  async revisaoDescartar({ id }) {
    const t = s.ticketAberto();
    const l = t ? tarefasDe(s.pasta(t.chave)) : [],
      x = l.find((y) => y.id === id);
    if (!x?.revisao) return;
    const ok = await vscode.window.showWarningMessage(
      `Descartar a alteração proposta para ${x.ticket || id}?`,
      { modal: true, detail: `A subtarefa no ${ondeNome(t)} fica como está.` },
      'Descartar'
    );
    if (!ok) return;
    (x.historico ||= []).push({
      em: new Date().toISOString(),
      evento: 'revisao',
      texto: `Alteração descartada (${x.revisao.motivo.slice(0, 120)})`
    });
    delete x.revisao;
    s.gravar(t.chave, TAREFAS, l);
    s.render();
  }
});

module.exports = { acoes };
