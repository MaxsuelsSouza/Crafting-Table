// @ts-check
// Reprovar o card e pedir alteração ao Claude.
const vscode = require('vscode');
const { TAREFAS, tarefasDe } = require('../../../locais');

const acoes = (s) => ({
  async tarefaReprovar({ id }) {
    const t = s.ticketAberto();
    if (!t?.chave || tarefasDe(s.pasta(t.chave)).find((x) => x.id === id)?.status !== 'pendente') return;
    const motivo = await vscode.window.showInputBox({
      title: `Reprovar ${id}`,
      prompt: 'Motivo (opcional): vai para o Claude na análise de consistência',
      ignoreFocusOut: true
    });
    if (motivo === undefined) return;
    const l = tarefasDe(s.pasta(t.chave)),
      x = l.find((y) => y.id === id);
    Object.assign(x, { status: 'reprovada', motivo: motivo.trim() });
    (x.historico ||= []).push({
      em: new Date().toISOString(),
      evento: 'reprovada',
      texto: `Reprovada${motivo.trim() ? `: ${motivo.trim()}` : ''}`
    });
    s.gravar(t.chave, TAREFAS, l);
    s.render();
  },
  // Pedido de alteração: o card fica "Claude alterando" e entra na fila; o Claude roda assim que estiver livre.
  tarefaAlterar({ id, texto }) {
    const t = s.ticketAberto();
    const l = t ? tarefasDe(s.pasta(t.chave)) : [],
      x = l.find((y) => y.id === id);
    if (!x || x.status !== 'pendente' || !String(texto || '').trim()) return;
    Object.assign(x, { status: 'em_alteracao', alteracao: texto.trim(), fila: true });
    (x.historico ||= []).push({
      em: new Date().toISOString(),
      evento: 'alteracao',
      texto: `Alteração pedida: ${texto.trim()}`
    });
    s.gravar(t.chave, TAREFAS, l);
    s.render();
    s.orq.filaTarefas(t);
  }
});

module.exports = { acoes };
