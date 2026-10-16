// node teste-vigia.js: o observador global pergunta depois de BUSCA_MS só procurando e depois de mais de 3 cliques no ▶
process.env.CRAFTING_VIGIA_BUSCA_MS = '1000';
const assert = require('assert');
const vigia = require('../infra/agentes/vigia');
let t = 0; const perguntas = [];
vigia.configurar({ agora: () => t, perguntar: async (p) => { perguntas.push(p); return null; }, render: () => {} });
(async () => {
  vigia.iniciar('/x');
  t = 500; vigia.atividade('/x', 'Read', 'Lendo a.md'); vigia.vigiar();
  assert.strictEqual(perguntas.length, 0);
  t = 1100; vigia.atividade('/x', 'Grep', 'Buscando x'); vigia.vigiar();
  await new Promise((ok) => setImmediate(ok));
  assert.strictEqual(perguntas.length, 1);
  assert.strictEqual(perguntas[0].tipo, 'busca'); assert.strictEqual(perguntas[0].opcoes.length, 3);
  assert.ok(/Lendo a\.md/.test(perguntas[0].detalhe));
  // gravar/executar é progresso: zera o relógio
  t = 5000; vigia.atividade('/x', 'Write', 'Escrevendo b'); t = 5900; vigia.vigiar(); await new Promise((ok) => setImmediate(ok));
  assert.strictEqual(perguntas.length, 1);
  vigia.encerrar('/x');
  // cliques: o 4º dispara; Ao vivo andando zera
  vigia.registrarPlay('qaPlay');
  vigia.iniciar('/y');
  t = 10000;
  assert(!vigia.clique('qaPlay', '/y') && !vigia.clique('qaPlay', '/y') && !vigia.clique('qaPlay', '/y'));
  assert(!vigia.clique('naoEPlay', '/y'));
  assert(vigia.clique('qaPlay', '/y'));
  await new Promise((ok) => setImmediate(ok));
  assert.strictEqual(perguntas.at(-1).tipo, 'cliques');
  vigia.atividade('/y', 'Bash', 'x'); vigia.clique('qaPlay', '/y'); vigia.clique('qaPlay', '/y'); vigia.clique('qaPlay', '/y');
  assert.strictEqual(perguntas.length, 2);
  vigia.encerrar('/y');
  console.log('ok');
})();
