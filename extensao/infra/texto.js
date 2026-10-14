// @ts-check
// Escapa texto para dentro do HTML das telas.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

module.exports = { esc };
