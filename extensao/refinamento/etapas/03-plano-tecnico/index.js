// @ts-check
// Passo 3 · Planejamento técnico. Desenvolvimento: duas subetapas, cada uma numa execução nova (3.1 Mapeamento do código → 3.2 Plano
// técnico). Papel "quebrar" (Épico, Feature…): um prompt só, a decomposição do escopo, sem mapeamento de código.
//   subetapas/estado.js          SUBETAPAS3, mapasDe e o estado das subetapas em .ticket.json (refinamento.sub3)
//   subetapas/3.1-mapeamento.js  mapeamento do código (mapa-backend.md / mapa-mobile.md)
//   subetapas/3.2-plano.js       plano técnico (plan.md) a partir dos mapas
const { etapa } = require('../../orquestrador/etapa');
const { pedirMemoria } = require('../../orquestrador/memoria');
const { conferir } = require('../../orquestrador/conferir');
const { mapasDe, sub3De, subetapas3 } = require('./subetapas/estado');
const mapeamento = require('./subetapas/3.1-mapeamento');
const plano = require('./subetapas/3.2-plano');

const seguirPlano = (t, titulo, extra) => {
  const sub = sub3De(t.chave),
    mapas = mapasDe(t);
  if (sub.mapa !== 'concluida') return mapeamento.rodar(t, titulo, extra, sub);
  return plano.rodar(t, titulo, extra, mapas);
};

// Papel "quebrar": a decomposição do escopo em itens do nível abaixo (grava o plan.md com "## Decomposição").
const decompor = (t, extra) => {
  return etapa(
    t,
    `Siga a skill sdd, protocolo de retomada, sem perguntar: rode status e trabalhe só o passo 3 (decomposição do escopo, sem mapeamento de código): ` +
      `grave o plan.md com "## Decomposição" e rode concluir 3.` +
      extra +
      pedirMemoria(t, 3, false),
    false,
    undefined,
    'Passo 3 · Decomposição',
    () => conferir(t, 3)
  );
};

module.exports = { seguirPlano, decompor, subetapas3, mapasDe };
