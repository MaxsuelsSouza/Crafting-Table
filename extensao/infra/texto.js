// @ts-check
// Escapa texto para dentro do HTML das telas.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// HTML do provedor (descrição/comentários) → texto puro para a IA ler.
const html2txt = (h) => String(h || '').replace(/<(br|\/p|\/li|\/tr|\/h\d)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

module.exports = { esc, html2txt };
