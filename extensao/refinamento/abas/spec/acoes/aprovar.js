// @ts-check
// Botão Aprovar do passo (só o humano clica): confere o que falta decidir antes; a última aprovação anexa o refinamento.md.
const vscode = require('vscode');
const os = require('os');
const maestro = require('../../../../infra/agentes/maestro');
const { sddState } = require('../../../../configuracao/configuracao');
const { tarefasDe, impactosDe, ticketDe, estadoSpec } = require('../../../locais');
const mudancas = require('../../../etapas/comentarios/regras');
const orq = require('../../../orquestrador');
const { pasta, nomeProvedor } = require('../comum');
const { abertos } = require('../abertos');
const { semDecisaoDo } = require('../agora');
const { anexarPacote } = require('../anexar');

const acoes = (s) => ({
  async specAprovar({ id }) {
    const r = s.ticketAberto(),
      n = Number(id),
      est = estadoSpec(r);
    if (maestro.rodando(pasta(r.id)))
      return vscode.window.showWarningMessage('O Claude ainda está trabalhando neste ticket: espere a etapa terminar.');
    if (mudancas.pendentes(impactosDe(pasta(r.id))).length)
      return vscode.window.showWarningMessage(
        `Há uma mudança pedida em comentário do ${nomeProvedor(r)} esperando sua decisão (caixa vermelha acima): decida antes de aprovar.`
      );
    const cards = tarefasDe(pasta(r.id));
    const semDecisao = [4, 6].includes(n) ? semDecisaoDo(n, cards) : [];
    if (semDecisao.length) {
      s.mudarAba('tarefas');
      s.render();
      return vscode.window.showWarningMessage(
        n === 4
          ? `Decida as tarefas antes de aprovar o passo 4: ${semDecisao.length} sem decisão (${semDecisao.map((x) => x.id).join(', ')}).`
          : 'Decida o card [QA] na aba Tarefas antes de aprovar o passo 6.'
      );
    }
    if (n === 6 && !cards.some((x) => x.tipo === 'qa'))
      return vscode.window.showWarningMessage(
        'O Claude ainda não criou o card [QA] com o plano de testes: peça ajuste no passo 6.'
      );
    if (!abertos.has(`${r.id}:${n}:${est?.passos[n]?.hash}`))
      return vscode.window.showWarningMessage('Abra e leia o arquivo antes de aprovar.');
    const ok = await vscode.window.showInformationMessage(
      `Aprovar o passo ${n} (${est.passos[n].titulo})?`,
      { modal: true, detail: 'Depois de aprovado, o Claude pode seguir para o próximo passo.' },
      'Aprovar'
    );
    if (!ok) return;
    const bin = sddState();
    if (!bin)
      return vscode.window.showErrorMessage('Plugin sdd não encontrado (claude plugin install sdd@crafting-local).');
    require('child_process').execFile(
      bin,
      ['aprovar', String(n), '--ref', pasta(r.id), '--por', os.userInfo().username],
      (err, out, errOut) => {
        s.render();
        if (err) return vscode.window.showErrorMessage(String(errOut || err.message).replace(/^sdd-state: /, ''));
        // Aprovado: próximo passo numa execução nova (contexto limpo), se o refinamento estiver rodando.
        vscode.window.setStatusBarMessage(`$(check) ${out.trim()}`, 6000);
        require('../../../pacote').gravar(r.id); // refinamento.md atualizado com o passo aprovado (por quem e quando)
        anexarPacote(s, ticketDe(r.id) || r); // última aprovação: o refinamento.md vai para o ticket
        orq.seguir(ticketDe(r.id));
      }
    );
  }
});

module.exports = { acoes };
