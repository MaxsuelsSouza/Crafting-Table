// @ts-check
const { estadoSpec } = require('../locais');
const { etapa } = require('./etapa');
const { promptAjuste, promptRespostas } = require('./memoria');
const { conferir } = require('./conferir');

// Ajuste e respostas: execução nova (continuar=false), tudo o que precisa vai no prompt.
const ajustar = (t, n, texto) =>
  etapa(
    t,
    promptAjuste(t, n, texto),
    false,
    undefined,
    `Ajuste no passo ${n} · ${estadoSpec(t)?.passos[n]?.titulo || ''}`,
    () => conferir(t, n)
  );
const aplicarRespostas = (t, n, lista) =>
  etapa(t, promptRespostas(t, n, lista), false, undefined, `Aplicando suas respostas · passo ${n}`, () =>
    conferir(t, n)
  );

module.exports = { ajustar, aplicarRespostas };
