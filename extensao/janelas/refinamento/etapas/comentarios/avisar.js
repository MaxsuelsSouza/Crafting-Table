// @ts-check
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const tickets = require('../../../../infra/ticket/tickets');
const { pasta } = require('../../../../infra/ticket/pasta-ticket');
const { IMPACTOS, dirSpec, impactosDe, ticketDe } = require('../../locais');
const { pausado } = require('../../estado');
const mudancas = require('./snapshot');
const { NIVEL } = require('./regras');
const { s } = require('../../orquestrador/servicos');

// Execução terminou: o que ficou sem registro vira erro; a análise que mexeu na spec é desfeita; decisão pendente e
// aplicação concluída avisam quem iniciou o refinamento (esta máquina).
const avisarImpactos = (t) => {
  const l = impactosDe(pasta(t.chave));
  let mudou = false;
  const spec = dirSpec(ticketDe(t.chave) || t);
  const parou = pausado(t.chave); // ⏸ matou a execução: triagem e análise voltam para a fila em vez de virar erro
  for (const i of l) {
    const falta = {
      triando: 'a triagem (sdd-state comentario classificar)',
      analisando: 'a análise (sdd-state impacto registrar)',
      aplicando: 'a aplicação (sdd-state impacto aplicado): confira os arquivos ou desfaça'
    }[i.status];
    if (falta && parou && i.status !== 'aplicando') {
      i.status = i.status === 'triando' ? 'triagem' : 'na_fila';
      mudou = true;
    } else if (falta) {
      i.resumo = `O Claude não registrou ${falta} deste comentário.`;
      i.status = 'erro';
      mudou = true;
    }
    if (i.snapAnalise) {
      // a análise é só leitura: se a spec mudou, volta ao que era
      const id = `a${i.id}`;
      if (mudancas.alterou(pasta(t.chave), spec, id) && mudancas.restaurar(pasta(t.chave), spec, id) && !parou) {
        Object.assign(i, {
          status: 'erro',
          resumo: 'A análise alterou a spec (era só para medir): desfeito automaticamente. Peça a análise de novo.'
        });
      }
      fs.rmSync(path.join(pasta(t.chave), 'snapshots', id), { recursive: true, force: true });
      delete i.snapAnalise;
      mudou = true;
    }
    if (['analisado', 'aguardando_decisao', 'aplicado'].includes(i.status) && !i.avisado) {
      i.avisado = true;
      mudou = true;
      if (i.nivel === 'nenhum') continue;
      const quem = tickets.ler(t.chave)?.refinamento?.iniciadoPor;
      const decide = i.status === 'aguardando_decisao';
      vscode.window
        .showWarningMessage(
          `${t.chave}: comentário de ${i.autor} — impacto ${(NIVEL[i.nivel] || [i.nivel])[0]}.${decide ? ' Nada foi alterado: decida na aba Spec.' : ''}${quem ? ` (refinamento de ${quem})` : ''}`,
          {
            detail: `${i.resumo}${
              i.passo !== null && i.passo !== undefined
                ? `
${decide ? 'Passo afetado' : 'A spec voltou ao passo'} ${i.passo}.`
                : ''
            }${
              (i.cards || []).length
                ? `
Subtarefas a revisar: ${i.cards.join(', ')}.`
                : ''
            }`
          },
          'Abrir'
        )
        .then((b) => {
          if (b) {
            s.abrirAba(t.chave, 'spec');
          }
        });
    }
  }
  if (mudou) s.gravar(t.chave, IMPACTOS, l);
};

module.exports = { avisarImpactos };
