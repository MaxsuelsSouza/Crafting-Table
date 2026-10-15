// node teste-escopo.js — sdd-state init com escopo "quebrar": passos 5 e 6 dispensados e a spec fecha no passo 4
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { spawnSync } = require('child_process');
const bin = path.join(__dirname, 'bin/sdd-state');
const sdd = (ref, ...a) => spawnSync('node', [bin, ...a, '--ref', ref], { encoding: 'utf8' });
const mk = (extra) => {
  const ref = fs.mkdtempSync(path.join(os.tmpdir(), 'escopo-ref-')), repo = fs.mkdtempSync(path.join(os.tmpdir(), 'escopo-repo-'));
  fs.writeFileSync(path.join(ref, '.ticket.json'), JSON.stringify({ chave: 'EPI-1', titulo: 'Pagamentos', ...extra }));
  return { ref, repo };
};
const estado = (ref) => {
  const m = JSON.parse(fs.readFileSync(path.join(ref, '.ticket.json'), 'utf8'));
  return JSON.parse(fs.readFileSync(path.join(m.spec.repo, m.spec.dir, 'sdd-state.json'), 'utf8'));
};

// papel gravado pela extensão no .ticket.json
let { ref, repo } = mk({ refinamento: { papel: 'quebrar', filho: 'Feature' } });
let r = sdd(ref, 'init', '--repo', repo);
assert.strictEqual(r.status, 0, r.stderr);
let e = estado(ref);
assert.strictEqual(e.escopo, 'quebrar');
assert.deepStrictEqual(e.passos.map((p) => [p.n, p.status, !!p.dispensado]),
  [[0, 'pendente', false], [1, 'pendente', false], [2, 'pendente', false], [3, 'pendente', false], [4, 'pendente', false], [5, 'aprovado', true], [6, 'aprovado', true]]);
r = sdd(ref, 'status');
assert.strictEqual(r.status, 0, r.stderr);
assert.strictEqual(estado(ref).passos[5].status, 'aprovado', 'o check não desfaz a dispensa');

// --escopo na linha de comando
({ ref, repo } = mk({}));
assert.strictEqual(sdd(ref, 'init', '--repo', repo, '--escopo', 'quebrar').status, 0);
assert.strictEqual(estado(ref).escopo, 'quebrar');

// desenvolvimento: nada muda
({ ref, repo } = mk({ refinamento: { papel: 'desenvolver' } }));
assert.strictEqual(sdd(ref, 'init', '--repo', repo).status, 0);
e = estado(ref);
assert.ok(!e.escopo && e.passos.every((p) => p.status === 'pendente' && !p.dispensado));

// revisão atrás de passo desatualizado também fica desatualizada (senão o refinamento trava esperando aprovar o impossível)
({ ref, repo } = mk({}));
assert.strictEqual(sdd(ref, 'init', '--repo', repo).status, 0);
{
  const m = JSON.parse(fs.readFileSync(path.join(ref, '.ticket.json'), 'utf8'));
  const x = estado(ref);
  x.passos.forEach((p) => { p.status = p.n <= 2 ? 'aprovado' : p.n === 3 || p.n === 4 ? 'desatualizado' : p.n === 5 ? 'aguardando_revisao' : 'pendente'; });
  fs.writeFileSync(path.join(m.spec.repo, m.spec.dir, 'sdd-state.json'), JSON.stringify(x));
}
assert.strictEqual(sdd(ref, 'check').status, 0);
assert.strictEqual(estado(ref).passos[5].status, 'desatualizado');
r = sdd(ref, 'concluir', '5');
assert.notStrictEqual(r.status, 0, 'concluir 5 com 3 e 4 desatualizados deve falhar');
console.log('ok');
