// @ts-check
// node componentes/teste-fluxo-passos.js
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const fx = require('./fluxo-passos');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxo-'));

assert.strictEqual(fx.html(dir), ''); // sem plano: nada na tela
assert.throws(() => fx.plano(dir, []));
fx.plano(dir, [{ titulo: 'Abrir Separação', texto: 'abrir o módulo' }, { titulo: 'Finalizar incompleto', texto: 'tentar finalizar' }, { titulo: 'Ver o erro' }]);
assert.deepStrictEqual(fx.ler(dir).passos.map((p) => [p.id, p.status]), [['P01', 'pendente'], ['P02', 'pendente'], ['P03', 'pendente']]);
assert.throws(() => fx.plano(dir, [{ titulo: 'x' }]), /já existe/); // retomada não replaneja

// passo 1 completo, com ação e evidência
fx.iniciar(dir, 'P01'); fx.acao(dir, 'P01', 'maestro test abrir.yaml');
const png = path.join(dir, 'x.png'); fs.writeFileSync(png, 'x');
assert.ok(fx.evidencia(dir, 'P01', [png])[0].includes(path.join('evidencias', 'P01')));
fx.concluir(dir, 'P01', 'passou', 'ok');
// passo 2 em andamento quando o usuário pausa: volta para a fila; o 1 continua feito
fx.iniciar(dir, 'P02');
assert.throws(() => fx.concluir(dir, 'P03', 'passou'), /não está em execução/);
fx.descartarEmAndamento(dir);
assert.deepStrictEqual(fx.ler(dir).passos.map((p) => p.status), ['passou', 'pendente', 'pendente']);
assert.strictEqual(fx.ler(dir).passos[1].execucoes[0].status, 'descartado');
// retomada: o prompt traz os feitos com a ação e o que falta
const p = fx.estadoParaPrompt(dir);
assert.ok(p.includes('P01 [passou]') && p.includes('maestro test abrir.yaml') && p.includes('P02 [pendente]'));
// card: reusa o do QA com as ações do fluxo; mostra progresso 1/3 e a miniatura do print
const h = fx.html(dir, (f) => `vscode://${f}`);
assert.ok(h.includes('1/3 passos') && h.includes('data-cen="P01"') && h.includes('data-acao="fluxoAbrir"') && h.includes('x.png') && h.includes('Ação: maestro test abrir.yaml'));
assert.ok(!h.includes('qaRefazer') && h.includes('data-acao="fluxoRefazer"')); // P01 passou: Refazer é do fluxo, não do QA
assert.ok(fx.refazer(dir, 'P01') && fx.ler(dir).passos[0].status === 'pendente');
console.log('ok');
