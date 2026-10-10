// @ts-check
const { esc } = require('../ticket')._teste;

// Markdown simples para os handoffs (títulos, listas, código, negrito, código inline).
function markdown(md) {
  const linhas = esc(md).split('\n');
  let html = '', lista = false, codigo = false;
  const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const celulas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (l.startsWith('```')) { html += codigo ? '</pre>' : '<pre>'; codigo = !codigo; continue; }
    if (codigo) { html += l + '\n'; continue; }
    // Tabela: | a | b | seguida de |---|---|
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1] || '')) {
      if (lista) { html += '</ul>'; lista = false; }
      html += `<table><tr>${celulas(l).map((c) => `<th>${c}</th>`).join('')}</tr>`;
      for (i += 2; i < linhas.length && /^\s*\|/.test(linhas[i]); i++) html += `<tr>${celulas(linhas[i]).map((c) => `<td>${c}</td>`).join('')}</tr>`;
      html += '</table>';
      i--;
      continue;
    }
    const item = l.match(/^\s*[-*] (.*)/) || l.match(/^\s*\d+\. (.*)/);
    if (item && !lista) { html += '<ul>'; lista = true; }
    if (!item && lista) { html += '</ul>'; lista = false; }
    const h = l.match(/^(#{1,4}) (.*)/);
    if (h) html += `<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`;
    else if (item) html += `<li>${inline(item[1])}</li>`;
    else if (l.trim()) html += `<p>${inline(l)}</p>`;
  }
  return html + (lista ? '</ul>' : '') + (codigo ? '</pre>' : '');
}

module.exports = { markdown };
