// @ts-check
// Mudança vinda de comentário: quem depende de quem, nível do impacto, pendentes e o que cada mudança pendente atinge.
// Quem depende de quem (mesma tabela do sdd-state: DEPENDENTES).
const DEPENDENTES = { 0: [3, 4, 5, 6], 1: [2, 3, 4, 5, 6], 2: [3, 4, 5, 6], 3: [4, 5, 6], 4: [5, 6], 5: [6], 6: [] };

// Rótulo e cor de cada nível de impacto (aviso do orquestrador e caixas da aba Spec).
const NIVEL = {
  alto: ['ALTO', 'var(--danger)'],
  medio: ['MÉDIO', 'var(--warn)'],
  baixo: ['BAIXO', 'var(--ok)'],
  nenhum: ['SEM IMPACTO', 'var(--text-dim)']
};

const pendentes = (l) => l.filter((i) => i.status === 'aguardando_decisao');

// Passos que a mudança pode atingir: o primeiro afetado e todos que dependem dele.
const passosAfetados = (l) =>
  new Set(
    pendentes(l).flatMap((i) =>
      Number.isInteger(i.passo) && DEPENDENTES[i.passo] ? [i.passo, ...DEPENDENTES[i.passo]] : []
    )
  );
const cardsAfetados = (l) => new Set(pendentes(l).flatMap((i) => i.cards || []));

module.exports = { DEPENDENTES, NIVEL, pendentes, passosAfetados, cardsAfetados };
