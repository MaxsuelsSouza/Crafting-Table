// @ts-check
// Card do cenário: Pedir ajuste / Excluir / Não testável e ↻ Refazer (um ou em lote).
const vscode = require('vscode');
const qa = require('../../motor');

// Pedir ajuste / Excluir (card do cenário): pede o motivo, marca "não executado por decisão do usuário" e registra na aba Decisões.
// Pedir ajuste só marca e guarda o motivo (não aciona o Claude; para ele aplicar a mudança use "Pedir ajuste" do planejamento, qaPlanoMudar).
async function dispensarCenario(s, id, tipo) {
  const t = s.ticketAberto();
  if (!t || typeof id !== 'string') return;
  const ajuste = tipo === 'ajuste',
    naoTestavel = tipo === 'nao-testavel',
    dir = s.pastaAba(t.id);
  const motivo = await vscode.window.showInputBox({
    title: `${ajuste ? 'Pedir ajuste do' : naoTestavel ? 'Marcar como não testável o' : 'Excluir o'} cenário ${id}`,
    prompt: 'Motivo (obrigatório): o cenário deixa de ser executado por decisão sua',
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim() ? null : 'Informe o motivo')
  });
  if (!motivo?.trim() || !qa.dispensar(dir, id, motivo, tipo)) return;
  qa.registrarDecisao(
    dir,
    `${ajuste ? 'Ajuste pedido' : naoTestavel ? 'Cenário não testável' : 'Cenário excluído'}: ${id} não será executado`,
    { ticket: t.chave, motivo: motivo.trim() }
  );
  s.render();
}
const acoes = (s) => require('.').acoes(s); // ciclo: o index junta este arquivo

const cenarios = (s) => ({
  // Pedir ajuste / Excluir (card do cenário): pede o motivo, marca "não executado por decisão do usuário" e registra na aba Decisões.
  // Pedir ajuste só marca e guarda o motivo (não aciona o Claude; para ele aplicar a mudança use "Pedir ajuste" do planejamento, qaPlanoMudar).
  qaCenarioAjuste({ id }) {
    return dispensarCenario(s, id, 'ajuste');
  },
  qaCenarioExcluir({ id }) {
    return dispensarCenario(s, id, 'excluir');
  },
  qaCenarioNaoTestavel({ id }) {
    return dispensarCenario(s, id, 'nao-testavel');
  },
  // ↻ Refazer (lote): abre a fila de perguntas dos cenários que falharam/bloquearam; cada resposta devolve o cenário à fila (▶ executa).
  qaRefazerLote() {
    const t = s.ticketAberto();
    if (!t) return;
    const n = qa.iniciarRefazerLote(s.pastaAba(t.id));
    if (!n) vscode.window.showInformationMessage('Nenhum cenário falhou ou ficou bloqueado (ou o QA está rodando).');
    s.render();
  },
  async qaRefazerResponder({ op } = {}) {
    const t = s.ticketAberto();
    if (!t) return;
    const dir = s.pastaAba(t.id),
      l = qa.loteRefazer(dir);
    if (!l) return;
    const r =
      op !== undefined && op !== 'outra' && op !== ''
        ? l.opcoes[Number(op)]
        : await vscode.window.showInputBox({
            title: `Como refazer ${l.cenario.id}?`,
            prompt: l.cenario.titulo,
            ignoreFocusOut: true
          });
    if (!r?.trim()) return;
    const x = qa.responderRefazer(dir, r);
    if (x)
      qa.registrarDecisao(dir, `Usuário instruiu como refazer ${x.id}`, {
        ticket: t.chave,
        cenario: x.id,
        resposta: r.trim()
      });
    s.render();
  },
  qaRefazerCancelar() {
    const t = s.ticketAberto();
    if (t) {
      qa.cancelarRefazerLote(s.pastaAba(t.id));
      s.render();
    }
  },
  qaRefazer({ id }) {
    const t = s.ticketAberto();
    if (t && typeof id === 'string') qa.refazer(s.pastaAba(t.id), id);
  }
});

module.exports = { cenarios };
