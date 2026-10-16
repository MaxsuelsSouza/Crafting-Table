// @ts-check
// Decisão do humano sobre a mudança pedida em comentário: aplicar ([aplicar] ao Claude, com snapshot), consultar, manter ou não prosseguir;
// desfazer depois de aplicar; dar ciência.
const vscode = require('vscode');
const os = require('os');
const maestro = require('../../../../infra/agentes/maestro');
const { nomeProvedor } = require('../../../../infra/provedores');
const { dirSpec, IMPACTOS, impactosDe, ticketDe } = require('../../locais');
const { snapshot, restaurar } = require('./snapshot');

// Decisão sobre a mudança pedida em comentário (ver teste-acoes.js: formato do `acoes`).
const acoes = (s) => ({
  // Decisão sobre a mudança pedida em comentário. "Não prosseguir" descarta (a spec nunca foi tocada); manter só registra;
  // consultar vira uma dúvida para o PO; aplicar guarda um snapshot e manda o Claude regredir ([aplicar]).
  async mudancaDecidir({ id, op }) {
    const t = s.ticketAberto();
    if (!t) return;
    const l = impactosDe(s.pasta(t.chave)),
      i = l.find((x) => x.id === id && x.status === 'aguardando_decisao');
    const o = op === 'nao' ? null : (i?.opcoes || [])[Number(op)];
    if (!i || (op !== 'nao' && !o)) return;
    if (o?.tipo === 'aplicar' && maestro.rodando(s.pasta(t.chave)))
      return vscode.window.showWarningMessage(
        'O Claude ainda está trabalhando neste ticket: espere a etapa terminar para aplicar.'
      );
    const ok = await vscode.window.showWarningMessage(
      `${o ? o.rotulo : 'Não prosseguir'}?`,
      {
        modal: true,
        detail: !o
          ? 'A mudança do comentário é descartada e a spec segue como estava (nada foi alterado).'
          : o.tipo === 'aplicar'
            ? `O Claude vai regredir a spec: ${o.instrucao || o.rotulo}
Um snapshot é guardado: dá para desfazer depois.`
            : o.tipo === 'consultar'
              ? 'Vira uma dúvida (aba Dúvidas) para você enviar ao ticket; a spec espera a resposta.'
              : 'Nada muda na spec.'
      },
      'Confirmar'
    );
    if (!ok) return;
    i.decisao = {
      opcao: o ? o.rotulo : 'Não prosseguir',
      tipo: o ? o.tipo : 'nao_prosseguir',
      por: os.userInfo().username,
      em: new Date().toISOString()
    };
    if (!o) i.status = 'descartado';
    else if (o.tipo === 'aplicar') {
      snapshot(s.pasta(t.chave), dirSpec(ticketDe(t.chave) || t), i.id);
      Object.assign(i, { snapshot: true, status: 'aplicando' });
    } else i.status = 'decidido';
    s.gravar(t.chave, IMPACTOS, l);
    if (o?.tipo === 'consultar')
      await s.orq.sdd([
        'duvida',
        'add',
        '--ref',
        s.pasta(t.chave),
        '--texto',
        o.instrucao || o.rotulo,
        '--contexto',
        `Comentário de ${i.autor}: ${i.resumo}`
      ]);
    if (o?.tipo === 'aplicar')
      s.orq.etapa(
        ticketDe(t.chave),
        `[aplicar] Mudança escolhida no ticket ${t.chave}. Siga a seção "Aplicar a mudança escolhida" da skill sdd.\n` +
          `Opção escolhida: ${o.rotulo}\nInstrução: ${o.instrucao || o.rotulo}\nImpacto: ${i.nivel} — ${i.resumo} (passo ${i.passo ?? '?'}; cards ${(i.cards || []).join(', ') || 'nenhum'})\n` +
          `Comentário id: ${i.id} · autor: ${i.autor} · data: ${i.data} · link: ${i.link}\nTexto:\n${i.texto}`,
        false,
        undefined,
        `Aplicando mudança de ${i.autor}`
      );
    s.render();
  },
  // "Não prosseguir" depois de aplicar: volta a spec e os cards ao snapshot de antes da aplicação.
  async mudancaDesfazer({ id }) {
    const t = s.ticketAberto();
    if (!t) return;
    const l = impactosDe(s.pasta(t.chave)),
      i = l.find((x) => x.id === id && ['aplicado', 'erro'].includes(x.status) && x.snapshot);
    if (!i) return;
    if (maestro.rodando(s.pasta(t.chave)))
      return vscode.window.showWarningMessage('O Claude ainda está trabalhando neste ticket: espere a etapa terminar.');
    const ok = await vscode.window.showWarningMessage(
      'Desfazer a mudança?',
      {
        modal: true,
        detail: `A spec e os cards voltam ao estado de antes de aplicar. Subtarefas já atualizadas no ${nomeProvedor()} não são mexidas.`
      },
      'Desfazer'
    );
    if (!ok) return;
    if (!restaurar(s.pasta(t.chave), dirSpec(ticketDe(t.chave) || t), i.id))
      return vscode.window.showErrorMessage('Snapshot não encontrado: nada foi desfeito.');
    i.status = 'desfeito';
    s.gravar(t.chave, IMPACTOS, l);
    vscode.window.showInformationMessage('Mudança desfeita: spec e cards voltaram ao estado anterior.');
    s.render();
  },
  async impactoCiente({ id }) {
    const l = impactosDe(s.pasta(s.aberto)),
      i = l.find((x) => x.id === id);
    if (!i) return;
    i.status = 'ciente';
    s.gravar(s.aberto, IMPACTOS, l);
    s.render();
  }
});

module.exports = { acoes };
