// @ts-check
// Aba "Permissões" das Configurações: tudo que o Claude já tentou rodar (histórico das sessões), em dois blocos (Leitura e Escrita) →
// módulos (Git, Banco, Shell, MCP, Arquivos, Web, Outras) → comandos, com quantas vezes foi tentado (número discreto antes do check). Marcar o bloco libera tudo dele;
// o módulo, só ele; o comando, só ele. O que fica marcado vira --allowedTools em toda execução em segundo plano (infra/agentes/permissoes/).
// Cliques: permAlternar (data-id = id do bloco/módulo/comando) e permAtualizar (relê o histórico). Módulos abertos ficam abertos (data-dec, moldura.js).
const { esc } = require('../infra/texto');
const { botao } = require('../componentes/botao');
const { card, dica } = require('./card-config');
const perm = require('../infra/agentes/permissoes');

const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} mil` : String(n));

// Contagem + check. herdado = um nível acima já libera (marcado e travado).
const check = (id, n, sel, herdado) => `<span class="perm-n" title="${n} tentativa(s)">${fmt(n)}</span>
  <input type="checkbox" class="perm-c" data-acao="permAlternar" data-id="${esc(id)}"${sel.has(id) || herdado ? ' checked' : ''}${herdado ? ' disabled title="Liberado pelo nível acima"' : ''}>`;

const bloco = (b, sel) => {
  const idB = perm.ids.bloco(b.id),
    bOk = sel.has(idB);
  const mods = b.modulos
    .map((m) => {
      const idM = perm.ids.modulo(b.id, m.nome),
        mOk = bOk || sel.has(idM);
      return `<details class="perm-m" data-dec="perm:${esc(idM)}"><summary><span class="perm-nome">${esc(m.nome)}</span>${check(idM, m.n, sel, bOk)}</summary>
      ${m.comandos.map((c) => `<div class="perm-l"><code class="perm-nome">${esc(c.comando)}</code>${check(perm.ids.comando(b.id, m.nome, c.comando), c.n, sel, mOk)}</div>`).join('')}</details>`;
    })
    .join('');
  return card({ titulo: esc(b.nome), acao: `<span class="perm-cab">${check(idB, b.n, sel, false)}</span>`, corpo: mods });
};

const tela = () => {
  const arv = perm.arvore(),
    sel = perm.marcadas(),
    lendo = perm.lendo();
  const intro = card({
    titulo: 'O que o Claude pode fazer sozinho',
    acao: botao(lendo ? 'Lendo…' : '↻ Reler histórico', { variante: 'contorno', acao: 'permAtualizar', desligado: lendo }),
    corpo: dica('Tudo que o Claude já tentou rodar, contado a partir do histórico das conversas. Marque o bloco inteiro, um módulo ou só um comando: o que estiver marcado é liberado nas execuções em segundo plano da extensão (▶ das esteiras). O que o módulo proíbe (ex.: commit e push na Implementação) continua proibido.')
  });
  if (!arv.length) return intro + card({ titulo: lendo ? 'Lendo o histórico…' : 'Nada no histórico ainda', corpo: dica(lendo ? 'A primeira leitura pode levar alguns segundos.' : 'Quando o Claude rodar algo, aparece aqui.') });
  return intro + arv.map((b) => bloco(b, sel)).join('');
};

const CSS = `
  .perm-cab { margin-left: auto; display: flex; align-items: center; gap: 6px; }
  .perm-m { border-top: 1px solid var(--border); }
  .perm-m summary { display: flex; align-items: center; gap: 6px; padding: 5px 0; cursor: pointer; list-style: none; }
  .perm-m summary::before { content: '▸'; color: var(--text-dim); width: 10px; } .perm-m[open] summary::before { content: '▾'; }
  .perm-l { display: flex; align-items: center; gap: 6px; padding: 2px 0 2px 16px; }
  .perm-nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } code.perm-nome { font-size: 11px; }
  .perm-n { flex: none; font-size: 10px; color: var(--text-dim); opacity: .7; font-variant-numeric: tabular-nums; }
  .perm-c { flex: none; margin: 0; cursor: pointer; } .perm-c:disabled { cursor: default; opacity: .6; }
`;

// Clique no check dentro do <summary> não abre/fecha o módulo; o estado do check vem do redesenho.
const script = () => `document.addEventListener('click', (e) => { if (e.target.matches?.('summary .perm-c')) e.preventDefault(); }, true);`;

module.exports = { tela, CSS, script };
