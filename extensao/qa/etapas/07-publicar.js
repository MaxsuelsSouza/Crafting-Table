// @ts-check
// Etapa 7 · Publicar: o resultado só vai ao provedor com todos os cenários em "passou" (ação qaPublicar em abas/acoes/publicar.js).

// Publicar só com todos os cenários não arquivados em 'passou' (e ao menos um).
function podePublicar(lista) {
  const a = lista.filter((c) => !c.arquivado && c.status !== 'dispensado');
  return a.length > 0 && a.every((c) => c.status === 'passou');
}

module.exports = { n: 7, podePublicar };
