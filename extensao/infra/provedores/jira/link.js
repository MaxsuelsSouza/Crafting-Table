// @ts-check
// Link do ticket no Jira ↔ chave: lerLink (link colado), chaveDaBranch (nome de branch) e linkDo (abrir no navegador).

// Aceita .../browse/WMS-123 e ...?selectedIssue=WMS-123
function lerLink(link) {
  const url = new URL(link.trim());
  const key = (url.searchParams.get('selectedIssue') || url.pathname.match(/browse\/([A-Z][A-Z0-9]+-\d+)/i)?.[1] || '').toUpperCase();
  if (!key) throw new Error('Link sem chave do ticket (ex.: .../browse/WMS-123)');
  return { id: key, chave: key, projeto: key.split('-')[0], site: url.origin };
}

// Chave do Jira dentro de um texto (nome de branch: feature/WMS-13429-x → WMS-13429); null se não houver.
const chaveDaBranch = (texto) => String(texto || '').match(/[A-Z][A-Z0-9]+-\d+/i)?.[0].toUpperCase() || null;

// Link do ticket para abrir no navegador.
const linkDo = (site, key) => `${site}/browse/${key}`;

module.exports = { lerLink, chaveDaBranch, linkDo };
