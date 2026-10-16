// @ts-check
// ADF (formato de texto do Jira) ↔ Markdown e texto: a descrição e os comentários entram e saem em Markdown para o resto da extensão.

// Texto → documento ADF do Jira (um parágrafo por linha).
const adf = (texto) => ({ type: 'doc', version: 1, content: String(texto || '').split('\n')
  .map((l) => (l.trim() ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })) });

// Markdown → ADF, para a descrição chegar formatada no Jira: títulos, **negrito**, *itálico*, `código`, [link](url),
// listas (- e 1.), tabelas, blocos ``` , citação (>) e régua (---). Quebra de linha simples vira quebra no Jira.
function inlineAdf(texto) {
  const nos = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*([^*\s][^*]*?)\*(?!\w)|(?<!\w)_([^_\s][^_]*?)_(?!\w)/g;
  let ultimo = 0, m;
  const txt = (t, marks) => { if (t) nos.push(marks ? { type: 'text', text: t, marks } : { type: 'text', text: t }); };
  while ((m = re.exec(texto))) {
    txt(texto.slice(ultimo, m.index));
    if (m[1] !== undefined) txt(m[1], [{ type: 'strong' }]);
    else if (m[2] !== undefined) txt(m[2], [{ type: 'code' }]);
    else if (m[3] !== undefined) txt(m[3], [{ type: 'link', attrs: { href: m[4] } }]);
    else txt(m[5] ?? m[6], [{ type: 'em' }]);
    ultimo = re.lastIndex;
  }
  txt(texto.slice(ultimo));
  return nos;
}
const paragrafoAdf = (linhas) => {
  const content = [];
  linhas.forEach((l, i) => { if (i) content.push({ type: 'hardBreak' }); content.push(...inlineAdf(l)); });
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
};
function mdParaAdf(md) {
  const linhas = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const doc = [];
  let i = 0;
  const celulas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }
    const cerca = l.match(/^\s*(```|~~~)\s*(\S*)/);
    if (cerca) {
      const corpo = [];
      for (i++; i < linhas.length && !linhas[i].trim().startsWith(cerca[1]); i++) corpo.push(linhas[i]);
      i++;
      doc.push({ type: 'codeBlock', attrs: cerca[2] ? { language: cerca[2] } : {}, content: corpo.join('\n') ? [{ type: 'text', text: corpo.join('\n') }] : [] });
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { doc.push({ type: 'heading', attrs: { level: h[1].length }, content: inlineAdf(h[2].trim()) }); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { doc.push({ type: 'rule' }); i++; continue; }
    if (/^\s*\|/.test(l) && i + 1 < linhas.length && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1])) {
      const cab = celulas(l);
      const rows = [{ type: 'tableRow', content: cab.map((c) => ({ type: 'tableHeader', attrs: {}, content: [paragrafoAdf([c])] })) }];
      for (i += 2; i < linhas.length && /^\s*\|/.test(linhas[i]); i++) {
        const cs = celulas(linhas[i]);
        rows.push({ type: 'tableRow', content: cab.map((_, k) => ({ type: 'tableCell', attrs: {}, content: [paragrafoAdf([cs[k] || ''])] })) });
      }
      doc.push({ type: 'table', attrs: { isNumberColumnEnabled: false, layout: 'default' }, content: rows });
      continue;
    }
    const item = (x) => x.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/);
    if (item(l)) {
      const ordenada = !!item(l)[2];
      const itens = [];
      for (; i < linhas.length && item(linhas[i]) && !!item(linhas[i])[2] === ordenada; i++) {
        const m = item(linhas[i]);
        const marca = m[3] === undefined ? '' : /x/i.test(m[3]) ? '☑ ' : '☐ ';
        itens.push({ type: 'listItem', content: [paragrafoAdf([marca + m[4]])] });
      }
      doc.push(ordenada ? { type: 'orderedList', attrs: { order: 1 }, content: itens } : { type: 'bulletList', content: itens });
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q = [];
      for (; i < linhas.length && /^\s*>/.test(linhas[i]); i++) q.push(linhas[i].replace(/^\s*>\s?/, ''));
      doc.push({ type: 'blockquote', content: [paragrafoAdf(q)] });
      continue;
    }
    const par = [];
    for (; i < linhas.length && linhas[i].trim() && !/^(#{1,6}\s|\s*```|\s*~~~|\s*>|\s*\|)/.test(linhas[i]) && !item(linhas[i]); i++) par.push(linhas[i].trim());
    if (!par.length) { par.push(l.trim()); i++; }
    doc.push(paragrafoAdf(par));
  }
  return { type: 'doc', version: 1, content: doc.length ? doc : [{ type: 'paragraph' }] };
}

// ADF (descrição do Jira) → markdown, o bastante para o plano de QA: títulos, parágrafos, listas, tabelas, negrito/itálico/código.
function adfMd(n, lista) {
  if (!n) return '';
  const filhos = (sep = '') => (n.content || []).map((c) => adfMd(c, n.type === 'orderedList' || n.type === 'bulletList' ? n.type : lista)).join(sep);
  switch (n.type) {
    case 'text': return (n.marks || []).reduce((t, m) => (m.type === 'strong' ? `**${t}**` : m.type === 'em' ? `*${t}*` : m.type === 'code' ? `\`${t}\``
      : m.type === 'link' ? `[${t}](${m.attrs?.href})` : t), n.text || '');
    case 'hardBreak': return '  \n';
    case 'mention': case 'emoji': return n.attrs?.text || '';
    case 'heading': return `${'#'.repeat(n.attrs?.level || 2)} ${filhos()}\n\n`;
    case 'paragraph': return `${filhos()}\n\n`;
    case 'bulletList': case 'orderedList': return `${filhos()}\n`;
    case 'listItem': return `${lista === 'orderedList' ? '1.' : '-'} ${filhos().trim().replace(/\n+/g, '\n  ')}\n`;
    case 'codeBlock': return `\`\`\`\n${filhos()}\n\`\`\`\n\n`;
    case 'blockquote': return filhos().trim().split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
    case 'rule': return '---\n\n';
    case 'table': {
      const linhas = (n.content || []).map((r) => (r.content || []).map((c) => adfMd({ type: 'doc', content: c.content }).trim().replace(/\n+/g, ' ').replace(/\|/g, '\\|')));
      if (!linhas.length) return '';
      const larg = Math.max(...linhas.map((l) => l.length));
      return [linhas[0], Array(larg).fill('---'), ...linhas.slice(1)].map((l) => `| ${l.join(' | ')} |`).join('\n') + '\n\n';
    }
    default: return filhos();
  }
}

// ADF → texto simples (parágrafos e itens em linhas próprias), para o Claude ler o comentário.
function adfTexto(n) {
  if (!n) return '';
  if (n.type === 'text') return n.text || '';
  if (n.type === 'hardBreak') return '\n';
  if (n.type === 'mention') return n.attrs?.text || '@alguém';
  const filhos = (n.content || []).map(adfTexto).join('');
  return ['paragraph', 'heading', 'listItem', 'tableRow', 'codeBlock', 'blockquote'].includes(n.type) ? `${filhos}\n` : filhos;
}

module.exports = { adf, inlineAdf, paragrafoAdf, mdParaAdf, adfMd, adfTexto };
