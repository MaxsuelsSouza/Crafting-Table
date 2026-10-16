// @ts-check
// ▶ do QA, Dar início/Retomar, ⏸ e ↻ Refazer massa.
const vscode = require('vscode');
const qa = require('../../motor');
const sessao = require('../../../../infra/ticket/sessao');
const { EVID, filhosDe, depsQa } = require('./dependencias');
const { gerarPlano } = require('./gerar-plano');
const acoes = (s) => require('.').acoes(s); // ciclo: o index junta este arquivo

const execucao = (s) => ({
  // ▶ do QA: abre Evidências (Ao vivo) e confere o planejamento no Jira (etapas/01-planejamento). Sem plano, o cartão bloqueia e oferece criar.
  // ▶ do QA: só procura o planejamento (Ao vivo em Evidências). Executar é o Dar início do cartão.
  async qaPlay() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    s.pedirSecao(EVID);
    if (qa.estado(s.pastaAba(t.id)).fase === 'plano_aprovado') return acoes(s).qaIniciar(); // plano já aprovado: ▶ continua/retoma, igual ao botão do cartão
    const dir = s.pastaAba(t.id);
    await qa.verificarPlano(dir, t.chave, filhosDe(s, t));
    const e = qa.estado(dir);
    if (e.fase === 'sem_plano' && e.fontes?.length && !e.pausa && !qa.rodando(dir)) {
      // há texto de QA fora do padrão: o Claude interpreta
      await gerarPlano(s, t, dir, {
        prompt: (rasc) => qa.promptInterpretar(dir, rasc),
        titulo: `QA · Interpretando o planejamento (${e.fontes.join(', ')})`
      });
    }
    s.render();
  },
  // Dar início / Retomar: sobe o ambiente, confere a massa e executa os cenários da fila: roteiro do Claude, jornada da extensão (qa.executar).
  async qaIniciar() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    qa.registrarDecisao(
      s.pastaAba(t.id),
      qa.estado(s.pastaAba(t.id)).execucao === 'pausado' ? 'Usuário retomou os testes' : 'Usuário iniciou os testes',
      { ticket: t.chave }
    );
    await qa.executar(s.pastaAba(t.id), depsQa(s, t));
    s.render();
  },
  // Etapa 5 (Massa de dados) concluída: ↻ ao passar o mouse apaga a aba Massa e a IA levanta massa nova para todos os cenários.
  async qaMassaRefazer() {
    const t = s.ticketAberto();
    if (!t || sessao.focoLista() !== 'qa') return;
    const dir = s.pastaAba(t.id);
    if (qa.rodando(dir))
      return vscode.window.showInformationMessage('O QA está rodando: pause antes de refazer a massa.');
    const ok = await vscode.window.showWarningMessage(
      'Mover a massa da aba Massa para "Massas mortas" e levantar massa nova para todos os cenários?',
      {
        modal: true,
        detail: 'Os itens atuais vão para a área Massas mortas da aba Massa. O SQL já aplicado no banco não é desfeito.'
      },
      'Refazer massa'
    );
    if (!ok) return;
    qa.registrarDecisao(dir, 'Usuário pediu para refazer a massa de dados', { ticket: t.chave });
    s.pedirSecao(EVID);
    await qa.executar(dir, depsQa(s, t), { soMassa: true });
    s.render();
  },
  qaParar() {
    const t = s.ticketAberto();
    if (t) {
      qa.registrarDecisao(s.pastaAba(t.id), 'Usuário pausou os testes', { ticket: t.chave });
      qa.pausar(s.pastaAba(t.id));
      s.render();
    }
  }
});

module.exports = { execucao };
