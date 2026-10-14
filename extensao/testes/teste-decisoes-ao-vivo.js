// node teste-decisoes-ao-vivo.js: decisões do Claude no Ao vivo vão também para a aba Decisões (padrão do componente)
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const Module = require('module'), carregar = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : carregar(r, ...a));
const { falas, linhas, DECISOES_DE_TESTE } = require('../painel/maestro')._teste;
const aoVivo = require('../componentes/ao-vivo');

// parser: a linha DECISÃO vira linha 'decisao'; o resto continua fala
const l = falas('Vou ler o ticket.\n**DECISÃO:** Usar a tabela LOG_TAREFA | A outra não tem registros recentes; descartei LOG_OS.\nSegue o trabalho.');
assert.deepStrictEqual(l.map((x) => x.tipo), ['fala', 'decisao']);
assert.strictEqual(l[1].texto, 'Usar a tabela LOG_TAREFA');
assert.ok(l[1].detalhe.includes('descartei LOG_OS'));
assert.deepStrictEqual(falas('Só uma fala.').map((x) => x.tipo), ['fala']);
assert.deepStrictEqual(falas('decisao: sem motivo').map((x) => [x.tipo, x.texto]), [['decisao', 'sem motivo']]);

// modo de teste: Read e Bash viram decisão (com o caminho/comando completo); outras ferramentas seguem como ação
assert.ok(DECISOES_DE_TESTE);
const ev = (nome, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', name: nome, input }] } });
assert.deepStrictEqual(linhas(ev('Read', { file_path: '/a/b/1-triagem.md' })).map((x) => [x.tipo, x.detalhe]), [['decisao', '/a/b/1-triagem.md']]);
assert.deepStrictEqual(linhas(ev('Bash', { command: 'ls -la /tmp && rm x' })).map((x) => [x.tipo, x.detalhe]), [['decisao', 'ls -la /tmp && rm x']]);
assert.strictEqual(linhas(ev('Grep', { pattern: 'x' }))[0].tipo, 'acao');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivo-'));
  aoVivo.anotar(dir, { tipo: 'fala', texto: 'oi' });
  aoVivo.anotar(dir, { tipo: 'decisao', texto: 'Escolhi A', detalhe: 'porque B falha' });
  await new Promise((r) => setTimeout(r, 1300)); // a fila escoa uma linha a cada 0,5 s
  const dec = JSON.parse(fs.readFileSync(path.join(dir, '.decisoes.json'), 'utf8'));
  assert.deepStrictEqual(dec.map((d) => [d.origem, d.titulo, d.resumo]), [['claude', 'Escolhi A', 'porque B falha']]);
  assert.ok(dec[0].id && dec[0].data);
  // aba Decisões mostra a origem Claude (o painel ordena por data via decisoesDe)
  const h = require('../componentes/aba-decisoes').corpoAba({ decisoes: dec });
  assert.ok(h.includes('o-claude') && h.includes('>Claude<') && h.includes('Escolhi A'));
  // ao vivo mostra a linha com ícone próprio
  assert.ok(aoVivo.caixa(dir, false, 'qa').includes('v-decisao'));
  console.log('ok');
})();
