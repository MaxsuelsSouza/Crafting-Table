// @ts-check
// Cliques das abas da esteira (data-acao): abrir e aprovar o documento da etapa, pedir ajuste, ⏸/▶, explicação do dev, iniciar e responder à pausa.
// Ticket com subtarefas: data-key = grupo (o cartão daquele grupo); sem data-key, o pai. alvo() devolve os serviços, o ticket e a pasta certos.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const controle = require('../../../infra/controle');
const dossie = require('../../../infra/dossie');
const { etapa } = require('../etapas');
const { RESPOSTAS, estado, mudar } = require('../estado');
const { rodarEtapa, proxima, seguir, retomar, pausarManual, responder } = require('../orquestrador');

const dentro = (s, nome) => {
  const t = s.ticketAberto(),
    dir = t && s.pastaAba(t.id),
    f = dir && typeof nome === 'string' && path.resolve(nome);
  return f && (f === dir || f.startsWith(dir + path.sep)) ? f : null;
};

// { s, t, dir } do pai ou do grupo `key` (orquestrador/grupos/contexto.js).
const alvo = (s, key) => {
  const t = s.ticketAberto();
  if (!t) return null;
  if (!key) return { s, t, dir: s.pastaAba(t.id) };
  return require('../orquestrador/grupos').contexto(s, t, key);
};

const acoes = (s) => ({
  esteiraAbrir({ id, key }) {
    const a = alvo(s, key),
      n = Number(id),
      et = etapa(n);
    if (!a || !et) return;
    const dir = a.dir,
      arq = path.join(dir, et.arq),
      vscode = require('vscode');
    if (!fs.existsSync(arq)) return vscode.window.showWarningMessage(`O arquivo ainda não existe: ${arq}`);
    mudar(dir, { aprovacao: { etapa: n, lido: true } });
    vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(arq));
    s.render();
  },
  async esteiraAprovar({ key } = {}) {
    const a = alvo(s, key),
      vscode = require('vscode');
    if (!a) return;
    const dir = a.dir,
      e = estado(dir),
      et = etapa(e.etapa);
    if (e.fase !== 'aguardando' || !et) return;
    if (!e.aprovacao?.lido) return vscode.window.showWarningMessage('Abra e leia o documento antes de aprovar.');
    const ok = await vscode.window.showInformationMessage(
      `Aprovar a etapa ${et.n} (${et.nome})?`,
      {
        modal: true,
        detail:
          et.n === 4
            ? 'Depois de aprovado, a esteira cria a branch de trabalho e altera o código dos repositórios (sem commit nem push).'
            : et.n === 0
              ? 'Depois de aprovado, a esteira cria a branch do ticket (feature/, bugfix/ ou hotfix/<CHAVE>) e começa os grupos de subtarefas (no máximo 2 agentes ao mesmo tempo).'
              : 'Depois de aprovada, a esteira segue sozinha para a próxima etapa.'
      },
      'Aprovar'
    );
    if (!ok) return;
    aoVivo.anotar(dir, { tipo: 'fim', texto: `Etapa ${et.n} aprovada por você` });
    await proxima(a.s, a.t, et.n, controle.nova(dir));
  },
  async esteiraAjuste({ key } = {}) {
    const a = alvo(s, key),
      vscode = require('vscode');
    if (!a) return;
    const dir = a.dir,
      e = estado(dir),
      et = etapa(e.etapa);
    if (e.fase !== 'aguardando' || !et) return;
    const texto = await vscode.window.showInputBox({
      title: `Ajuste na etapa ${et.n} (${et.nome})`,
      prompt: 'O que o Claude deve mudar?',
      ignoreFocusOut: true
    });
    if (!texto?.trim()) return;
    fs.appendFileSync(path.join(dir, RESPOSTAS), `## Ajuste pedido na etapa ${et.n} (${et.arq})\n${texto.trim()}\n\n`);
    aoVivo.anotar(dir, { tipo: 'aviso', texto: `Ajuste pedido na etapa ${et.n}: ${texto.trim().slice(0, 120)}` });
    await rodarEtapa(a.s, a.t, et.n, controle.nova(dir), true);
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
  async esteiraResponder({ op, texto, key }) {
    const a = alvo(s, key);
    if (!a) return;
    const p = estado(a.dir).pausa;
    await responder(a.s, a.t, op !== undefined && op !== '' ? p?.opcoes?.[Number(op)] : texto);
  },
  // Aba Dossiê do ticket com subtarefas: de quem é o dossiê mostrado (Pai, G1, G2).
  esteiraDossieDe({ key }) {
    const t = s.ticketAberto();
    if (!t) return;
    require('./dossie-subtarefas').escolher(s.pastaAba(t.id), key);
    s.render();
  }
});

module.exports = { acoes, dentro, alvo };
