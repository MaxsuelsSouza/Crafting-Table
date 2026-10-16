// @ts-check
// Aprovar: card de dev vira subtarefa (ou item, no papel "quebrar"); o card [QA] cria ou atualiza a subtarefa de QA com o plano.
const vscode = require('vscode');
const jira = require('../../../../../infra/provedores/fachada').jira;
const { TAREFAS, lerTexto, tarefasDe } = require('../../../locais');
const { ondeNome, filhoDe, respNome } = require('../rotulos');
const { QA_EXISTENTE, descricaoJira } = require('../jira');

const acoes = (s) => ({
  // Aprovar = criar a subtarefa no Jira (com confirmação). Só então o card vai para Aprovadas.
  async tarefaAprovar({ id }) {
    const t = s.ticketAberto();
    const c0 = t && tarefasDe(s.pasta(t.chave)).find((x) => x.id === id);
    if (!c0 || c0.status !== 'pendente') return;
    await new Promise((ok) => setTimeout(ok, 150)); // os campos do detalhe chegam antes
    const c = tarefasDe(s.pasta(t.chave)).find((x) => x.id === id);
    if (c.tipo === 'qa') return acoes(s).qaAprovar(t, c);
    const filho = filhoDe(t),
      oque = filho ? `O item (${filho})` : 'A subtarefa';
    const ok = await vscode.window.showWarningMessage(
      `Aprovar ${c.id}? ${oque} será criad${filho ? 'o' : 'a'} no ${ondeNome(t)}, no ticket ${t.chave}.`,
      {
        modal: true,
        detail: `“${c.titulo}”\nResponsável: ${respNome(c) || 'sem responsável'} · Estimativa original: ${c.estimativa || 'sem estimativa'}`
      },
      `Aprovar e criar no ${ondeNome(t)}`
    );
    if (!ok) return;
    let r;
    try {
      r = await jira.criarSubtarefa(s.secrets, jira.alvo(t), {
        resumo: c.titulo,
        descricao: descricaoJira(t, c),
        estimativa: c.estimativa,
        responsavelId: c.responsavel?.id,
        atribuirAMim: !c.responsavel && !!c.vinculado,
        tipoNome: filho || undefined
      });
    } catch (e) {
      return vscode.window.showErrorMessage(
        `${filho ? 'Item' : 'Subtarefa'} não criad${filho ? 'o' : 'a'}: ${e.message}`
      );
    }
    const l = tarefasDe(s.pasta(t.chave)),
      x = l.find((y) => y.id === id);
    Object.assign(x, { status: 'aprovada', ticket: r.key });
    (x.historico ||= []).push({
      em: new Date().toISOString(),
      evento: 'aprovada',
      texto: `Aprovada: subtarefa ${r.key} criada no ${ondeNome(t)}`
    });
    s.gravar(t.chave, TAREFAS, l);
    s.notificar(t.chave, 'jira', `subtarefa ${r.key} criada`);
    vscode.window.showInformationMessage(
      `${id} aprovada: subtarefa ${r.key} criada em ${t.chave}.${r.aviso ? ` Atenção: ${r.aviso}.` : ''}`
    );
    s.render();
  },
  async qaAprovar(t, c) {
    if (!t?.chave || c?.tipo !== 'qa') return; // só pelo tarefaAprovar
    const plano = lerTexto(c.arquivo || '');
    if (!plano)
      return vscode.window.showErrorMessage(`Plano de testes não encontrado: ${c.arquivo || '(sem arquivo)'}`);
    let existente = null;
    try {
      const j = s.cacheJira[t.chave] || (await jira.buscar(s.secrets, jira.alvo(t)));
      existente = (j.subtarefas || []).find((s) => QA_EXISTENTE.test(s.resumo || ''));
    } catch (e) {
      return vscode.window.showErrorMessage(`Não consegui ler as subtarefas de ${t.chave}: ${e.message}`);
    }
    const ok = await vscode.window.showWarningMessage(
      existente
        ? `Aprovar o plano de testes? A subtarefa ${existente.key} (“${existente.resumo}”) já existe em ${t.chave}: a descrição dela será substituída pelo plano.`
        : `Aprovar o plano de testes? A subtarefa “${c.titulo}” será criada no ${ondeNome(t)}, no ticket ${t.chave}.`,
      {
        modal: true,
        detail: `${c.resumo || ''}\nResponsável: ${respNome(c) || 'sem responsável'} · Estimativa original: ${c.estimativa || 'sem estimativa'}`
      },
      existente ? `Aprovar e atualizar no ${ondeNome(t)}` : `Aprovar e criar no ${ondeNome(t)}`
    );
    if (!ok) return;
    let key, aviso;
    try {
      if (existente) {
        await jira.atualizarDescricao(s.secrets, { site: t.site }, existente.key, plano);
        key = existente.key;
      } else
        ({ key, aviso } = await jira.criarSubtarefa(s.secrets, jira.alvo(t), {
          resumo: c.titulo,
          descricao: plano,
          estimativa: c.estimativa,
          responsavelId: c.responsavel?.id,
          atribuirAMim: !c.responsavel && !!c.vinculado
        }));
    } catch (e) {
      return vscode.window.showErrorMessage(`Plano de testes não enviado: ${e.message}`);
    }
    const l = tarefasDe(s.pasta(t.chave)),
      x = l.find((y) => y.id === c.id);
    Object.assign(x, { status: 'aprovada', ticket: key });
    (x.historico ||= []).push({
      em: new Date().toISOString(),
      evento: 'aprovada',
      texto: existente
        ? `Aprovada: descrição de ${key} atualizada`
        : `Aprovada: subtarefa ${key} criada no ${ondeNome(t)}`
    });
    s.gravar(t.chave, TAREFAS, l);
    s.notificar(t.chave, 'jira', `subtarefa ${key} [QA] ${existente ? 'atualizada' : 'criada'}`);
    vscode.window.showInformationMessage(
      `Plano de testes aprovado: ${existente ? `${key} atualizada` : `${key} criada`} em ${t.chave}.${aviso ? ` Atenção: ${aviso}.` : ''}`
    );
    delete s.cacheJira[t.chave];
    s.render();
  }
});

module.exports = { acoes };
