// @ts-check
// Cliques das abas da esteira (data-acao): abrir e aprovar o documento da etapa, pedir ajuste, ⏸/▶, explicação do dev, iniciar e responder à pausa.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../componentes/ao-vivo');
const controle = require('../../infra/controle');
const dossie = require('../../infra/dossie');
const { ETAPAS } = require('../etapas');
const { RESPOSTAS, estado, mudar } = require('../estado');
const { rodarEtapa, proxima, seguir, retomar, pausarManual, responder } = require('../orquestrador');

const dentro = (s, nome) => {
  const t = s.ticketAberto(),
    dir = t && s.pastaAba(t.id),
    f = dir && typeof nome === 'string' && path.resolve(nome);
  return f && (f === dir || f.startsWith(dir + path.sep)) ? f : null;
};

const acoes = (s) => ({
  esteiraAbrir({ id }) {
    const t = s.ticketAberto(),
      n = Number(id),
      et = ETAPAS[n - 1];
    if (!t || !et) return;
    const dir = s.pastaAba(t.id),
      arq = path.join(dir, et.arq),
      vscode = require('vscode');
    if (!fs.existsSync(arq)) return vscode.window.showWarningMessage(`O arquivo ainda não existe: ${arq}`);
    mudar(dir, { aprovacao: { etapa: n, lido: true } });
    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arq));
    s.render();
  },
  async esteiraAprovar() {
    const t = s.ticketAberto(),
      vscode = require('vscode');
    if (!t) return;
    const dir = s.pastaAba(t.id),
      e = estado(dir),
      et = ETAPAS[e.etapa - 1];
    if (e.fase !== 'aguardando' || !et) return;
    if (!e.aprovacao?.lido) return vscode.window.showWarningMessage('Abra e leia o documento antes de aprovar.');
    const ok = await vscode.window.showInformationMessage(
      `Aprovar a etapa ${et.n} (${et.nome})?`,
      {
        modal: true,
        detail:
          et.n === 4
            ? 'Depois de aprovado, a esteira cria a branch de trabalho e altera o código dos repositórios (sem commit nem push).'
            : 'Depois de aprovada, a esteira segue sozinha para a próxima etapa.'
      },
      'Aprovar'
    );
    if (!ok) return;
    aoVivo.anotar(dir, { tipo: 'fim', texto: `Etapa ${et.n} aprovada por você` });
    await proxima(s, t, et.n, controle.nova(dir));
  },
  async esteiraAjuste() {
    const t = s.ticketAberto(),
      vscode = require('vscode');
    if (!t) return;
    const dir = s.pastaAba(t.id),
      e = estado(dir),
      et = ETAPAS[e.etapa - 1];
    if (e.fase !== 'aguardando' || !et) return;
    const texto = await vscode.window.showInputBox({
      title: `Ajuste na etapa ${et.n} (${et.nome})`,
      prompt: 'O que o Claude deve mudar?',
      ignoreFocusOut: true
    });
    if (!texto?.trim()) return;
    fs.appendFileSync(path.join(dir, RESPOSTAS), `## Ajuste pedido na etapa ${et.n} (${et.arq})\n${texto.trim()}\n\n`);
    aoVivo.anotar(dir, { tipo: 'aviso', texto: `Ajuste pedido na etapa ${et.n}: ${texto.trim().slice(0, 120)}` });
    await rodarEtapa(s, t, et.n, controle.nova(dir), true);
  },
  esteiraPausar() {
    const t = s.ticketAberto();
    if (t) pausarManual(s, t);
  },
  async esteiraRetomar() {
    const t = s.ticketAberto();
    if (t) await retomar(s, t);
  },
  // Guarda a explicação do dev ao sair do campo (moldura.js manda o texto no focusout).
  esteiraObs({ texto }) {
    const t = s.ticketAberto();
    if (!t || typeof texto !== 'string') return;
    const f = path.join(s.pastaAba(t.id), dossie.BRIEFING);
    if (texto.trim()) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, texto.trim() + '\n');
    } else fs.rmSync(f, { force: true });
  },
  async esteiraIniciar({ texto }) {
    const t = s.ticketAberto();
    if (!t) return;
    if (typeof texto === 'string' && texto.trim()) {
      const f = path.join(s.pastaAba(t.id), dossie.BRIEFING);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, texto.trim() + '\n');
    }
    await seguir(s, t);
  },
  async esteiraResponder({ op, texto }) {
    const t = s.ticketAberto();
    if (!t) return;
    const p = estado(s.pastaAba(t.id)).pausa;
    await responder(s, t, op !== undefined && op !== '' ? p?.opcoes?.[Number(op)] : texto);
  }
});

module.exports = { acoes, dentro };
