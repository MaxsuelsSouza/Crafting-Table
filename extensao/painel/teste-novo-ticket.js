// @ts-check
// node painel/teste-novo-ticket.js
// "Novo ticket": o campo é o link (padrão, placeholder genérico); "Anexar documento" fica embaixo e é sempre opcional.
const assert = require('assert');
const { pedir, ANEXAR } = require('./novo-ticket');

// vscode falso: um QuickPick que o teste controla (digitar, aceitar, escolher o item, fechar).
const fabrica = () => {
  const q = { items: [], activeItems: [{}], selectedItems: [], value: '', disposed: false, shown: false, h: {} };
  Object.assign(q, { show() { q.shown = true; }, dispose() { q.disposed = true; },
    onDidChangeValue: (f) => { q.h.valor = f; }, onDidAccept: (f) => { q.h.aceitar = f; }, onDidHide: (f) => { q.h.fechar = f; } });
  return { q, vscode: { window: { createQuickPick: () => q } } };
};

(async () => {
  // 1. link digitado + Enter → { link }; o campo não cita ferramenta e o item de baixo é opcional e sempre visível.
  let { q, vscode } = fabrica();
  let p = pedir(vscode);
  assert.ok(q.shown && q.title === 'Novo ticket' && !/jira/i.test(q.placeholder) && /link/i.test(q.placeholder));
  assert.strictEqual(q.items.length, 1);
  assert.ok(q.items[0].label === ANEXAR && q.items[0].alwaysShow === true && /opcional/.test(q.items[0].description));
  assert.deepStrictEqual(q.activeItems, []); // Enter sem item ativo usa o digitado
  q.value = ' https://exemplo.atlassian.net/browse/ABC-1 '; q.activeItems = [q.items[0]]; q.h.valor(q.value); // a lista reativa o 1º item ao digitar
  assert.deepStrictEqual(q.activeItems, []);
  q.h.aceitar();
  assert.deepStrictEqual(await p, { link: 'https://exemplo.atlassian.net/browse/ABC-1' });
  assert.ok(q.disposed);

  // 2. escolher "Anexar documento" → { documento: true } mesmo com texto no campo
  ({ q, vscode } = fabrica());
  p = pedir(vscode);
  q.value = 'abc'; q.selectedItems = [q.items[0]]; q.h.aceitar();
  assert.deepStrictEqual(await p, { documento: true });

  // 3. Enter com o campo vazio e nada escolhido não fecha; fechar a caixa → null
  ({ q, vscode } = fabrica());
  p = pedir(vscode);
  q.value = '   '; q.h.aceitar();
  assert.ok(!q.disposed);
  q.h.fechar();
  assert.strictEqual(await p, null);

  // 4. depois de resolvido, fechar de novo não muda o resultado
  ({ q, vscode } = fabrica());
  p = pedir(vscode);
  q.value = 'x'; q.h.aceitar(); q.h.fechar();
  assert.deepStrictEqual(await p, { link: 'x' });
  console.log('ok novo-ticket');
})().catch((e) => { console.error(e); process.exit(1); });
