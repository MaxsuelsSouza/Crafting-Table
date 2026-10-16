// @ts-check
// Respostas às pausas do início do refinamento: a explicação do dev (ticket só com título) e o papel do tipo de ticket.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { refinoDe, gravarRefino, BRIEFING } = require('../../../locais');
const hierarquia = require('../../../hierarquia');
const { pasta } = require('../comum');

const acoes = (s) => ({
  // Resposta do dev ao ticket pobre: vira o briefing do refinamento e a spec começa.
  refinoBriefing({ texto }) {
    const t = s.ticketAberto();
    const r = String(texto || '').trim();
    if (!t) return;
    if (r.length < 20)
      return vscode.window.showWarningMessage(
        'Explique um pouco mais (o que precisa mudar e como saber que ficou certo).'
      );
    fs.mkdirSync(pasta(t.chave), { recursive: true });
    fs.appendFileSync(path.join(pasta(t.chave), BRIEFING), `${r}\n\n`);
    gravarRefino(pasta(t.chave), { pausa: null });
    return require('.').acoes(s).refinar(); // refinar mora em iniciar.js
  },
  // Resposta à pergunta de tipo: grava nas variáveis (hierarquia) e começa o refinamento. Quebra: pergunta também o que o tipo gera.
  async refinoTipo({ id }) {
    const t = s.ticketAberto();
    const tipo = t && refinoDe(pasta(t.chave)).pausa?.tipo;
    if (!tipo || !['quebrar', 'desenvolver', 'executar'].includes(id)) return;
    let filho;
    if (id === 'quebrar') {
      const OUTRO = 'Outro tipo…',
        cands = hierarquia.conhecidos().filter((x) => x.toLowerCase() !== tipo.toLowerCase());
      let escolhido = cands.length
        ? await vscode.window.showQuickPick([...cands, OUTRO], {
            title: `Refinar um ${tipo} gera itens de qual tipo?`,
            placeHolder: 'O nível logo abaixo na hierarquia'
          })
        : OUTRO;
      if (!escolhido) return;
      if (escolhido === OUTRO)
        escolhido = (
          await vscode.window.showInputBox({
            title: `Refinar um ${tipo} gera itens de qual tipo?`,
            prompt: 'Nome do tipo no Jira (ex.: Feature, Story)',
            ignoreFocusOut: true
          })
        )?.trim();
      if (!escolhido) return;
      filho = escolhido;
      if (!hierarquia.papelDe(filho)) await hierarquia.registrar(filho, 'desenvolver'); // filho desconhecido: assume desenvolvimento (editável nas variáveis)
    }
    await hierarquia.registrar(tipo, id, filho);
    gravarRefino(pasta(t.chave), { pausa: null });
    return require('.').acoes(s).refinar(); // refinar mora em iniciar.js
  }
});

module.exports = { acoes };
