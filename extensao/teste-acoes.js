// node teste-acoes.js
// Rede de segurança do desacoplamento: todo nome de botão/ação usado pela UI precisa ter handler.
const assert = require('assert'), fs = require('fs'), path = require('path');
const lerJs = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name === 'node_modules' || e.name.startsWith('.') ? [] : e.isDirectory() ? lerJs(path.join(d, e.name)) : e.name.endsWith('.js') && !e.name.startsWith('teste') ? [path.join(d, e.name)] : []);
const fontes = lerJs(__dirname).map((f) => fs.readFileSync(f, 'utf8'));

// Nomes usados pela UI (valores dinâmicos com ${ ficam de fora).
const usados = new Set();
for (const s of fontes) {
  for (const m of s.matchAll(/data-(?:acao|painel|tacao)="([\w:-]*)"/g)) if (m[1]) usados.add(m[1]);
  for (const m of s.matchAll(/(?:\$\{acao\}|'data-painel'\})="([\w:-]+)"/g)) usados.add(m[1]); // rodape(): ${acao}="nome"
  for (const m of s.matchAll(/\bacao: '([\w:-]+)'/g)) usados.add(m[1]); // botao({ acao }), enviar({ acao }), postMessage({ acao })
}

// Handlers: chaves de todo `const acoes = { ... }` (fecha em `  };`), em qualquer arquivo; spreads `...x.acoes` vêm do módulo de origem.
// ponytail: regex por indentação (chaves a 4 espaços); módulos novos devem declarar `const acoes = {` com essa forma, ou ajustar aqui.
const handlers = new Set();
for (const s of fontes) {
  const ini = s.search(/^ {2}const acoes = \{/m);
  if (ini < 0) continue;
  const corpo = s.slice(ini).split(/^ {2}\};/m)[0];
  for (const m of corpo.matchAll(/^ {4}(?:async\s+)?([A-Za-z_]\w*)\s*(?:\(|:)/gm)) handlers.add(m[1]);
}

// Módulos: handlers declarados como `const acoes = (s) => ({` (ou `(servicos) => ({`) com chaves a 2 espaços, fechando em `});` na coluna 0.
// Contrato: o módulo exporta `acoes(servicos)` e o painel.js lista o módulo em `modulosAcoes`.
for (const s of fontes) {
  const ini = s.search(/^const acoes = \(\w*\) => \(\{/m);
  if (ini < 0) continue;
  for (const m of s.slice(ini).split(/^\}\);/m)[0].matchAll(/^ {2}(?:async\s+)?([A-Za-z_]\w*)\s*(?:\(|:)/gm)) handlers.add(m[1]);
}

// Exceções legítimas: tratadas fora do `acoes` do painel.js.
const EXCECOES = {
  __painel: 'interna do grupo.js: repassa data-painel à principal como { acao: cmd }',
  __secao: 'interna do grupo.js: troca de seção/aba na moldura',
  cmd: 'placeholder no comentário de grupo.js ([data-painel="cmd"]), não é botão'
};
const prefixos = /^(cofre|comandos|emulador):/; // painel.js repassa a cofre.js / comandos.js / emulador.js (api.acao)

const sem = [...usados].filter((n) => !handlers.has(n) && !prefixos.test(n) && !(n in EXCECOES)).sort();
assert.deepStrictEqual(sem, [], `Sem handler: ${sem.join(', ')}`);
console.log(`ok (${usados.size} nomes, ${handlers.size} handlers)`);
