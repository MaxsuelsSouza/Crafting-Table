// @ts-check
// node infra/git/teste-git.js — localizar, padrão de nome e troca de branch com proteção, num repositório git temporário real (origin = clone bare).
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { execFileSync } = require('child_process');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'git-home-'));
const G = require('.');

let dia = 1;
const gx = (cwd, ...a) => execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], {
  encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: `2026-01-${String(dia).padStart(2, '0')}T10:00:00`, GIT_COMMITTER_DATE: `2026-01-${String(dia).padStart(2, '0')}T10:00:00` } }).trim();
const commit = (cwd, msg) => { dia++; fs.writeFileSync(path.join(cwd, `f${dia}.txt`), msg); gx(cwd, 'add', '.'); gx(cwd, 'commit', '-q', '-m', msg); };

// origem: master-md, duas pre-releases com o WMS-1 (cherry-pick), story/WMS-2, merge/WMS-2, homolog/v84 com o WMS-3, WMS-4 já na principal
const semente = fs.mkdtempSync(path.join(os.tmpdir(), 'git-semente-'));
gx(semente, 'init', '-q', '-b', 'master-md');
commit(semente, 'init');
commit(semente, '[WMS-4] já em produção');
gx(semente, 'checkout', '-q', '-b', 'pre-releases/v83.0.0-rc'); commit(semente, '[WMS-1] tela nova');
gx(semente, 'checkout', '-q', '-b', 'pre-releases/v84.0.0-rc', 'master-md'); commit(semente, '[WMS-1] tela nova (cherry picked)');
gx(semente, 'checkout', '-q', '-b', 'story/WMS-2', 'master-md'); commit(semente, 'WMS-2 regra');
gx(semente, 'branch', 'merge/WMS-2');
gx(semente, 'checkout', '-q', '-b', 'homolog/v84', 'master-md'); commit(semente, 'WMS-3 ajuste');
gx(semente, 'checkout', '-q', '-b', 'feature/WMS-50', 'master-md'); commit(semente, 'WMS-50 outra');
gx(semente, 'checkout', '-q', 'master-md');
const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'git-origin-'));
execFileSync('git', ['clone', '-q', '--bare', semente, bare]);
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'git-repo-'));
execFileSync('git', ['clone', '-q', bare, cwd]);
const repo = { caminho: cwd, branchPrincipal: 'master-md' };

// ── localizar ──
let r = G.localizar(repo, ['WMS-1']);
assert.strictEqual(r.aviso, '');
assert.deepStrictEqual(r.achados.map((a) => [a.ref, a.via]), [['origin/pre-releases/v84.0.0-rc', 'candidata'], ['origin/pre-releases/v83.0.0-rc', 'candidata']]);
assert.strictEqual(G.escolher(r.achados).ref, 'origin/pre-releases/v84.0.0-rc'); // mesma família: a mais recente
r = G.localizar(repo, ['WMS-2'], { buscar: false });
assert.deepStrictEqual(r.achados.map((a) => [a.ref, a.via]), [['origin/story/WMS-2', 'chave-no-nome']]); // sem merge/*, sem a local repetida
assert.strictEqual(r.achados[0].commits.length, 1);
r = G.localizar(repo, ['WMS-3'], { buscar: false });
assert.deepStrictEqual(r.achados.map((a) => [a.ref, a.via]), [['origin/homolog/v84', 'outra']]); // fora das candidatas: sugere o padrão
r = G.localizar(repo, ['WMS-4', 'WMS-9'], { buscar: false });
assert.deepStrictEqual([r.achados.map((a) => a.via), r.faltando], [['principal'], ['WMS-9']]);
assert.deepStrictEqual(G.localizar(repo, ['WMS-5'], { buscar: false }).achados, []); // "WMS-5" não casa com "WMS-50"
assert.strictEqual(G.escolher([]), null);
const mix = G.escolher([...G.localizar(repo, ['WMS-1', 'WMS-2'], { buscar: false }).achados]);
assert.ok(Array.isArray(mix) && mix.length === 3); // famílias diferentes: perguntar
assert.ok(G.localizar(repo, ['WMS-1'], { candidatas: ['homolog/*'], buscar: false }).achados.every((a) => a.via !== 'candidata' || a.ref === 'origin/homolog/v84'));

// ── refParaReproduzir ──
const principalSha = gx(cwd, 'rev-parse', 'origin/master-md');
assert.deepStrictEqual(G.refParaReproduzir(repo, ['WMS-1'], { categoria: 'incidente' }), { ref: 'origin/master-md', commit: principalSha, origem: 'principal', motivo: 'incidente reproduz na principal (produção)' });
const h = G.refParaReproduzir(repo, ['WMS-1'], { categoria: 'bug', achadoEmHomologacao: true, buscar: false });
assert.deepStrictEqual([h?.ref, h?.origem], ['origin/pre-releases/v84.0.0-rc', 'candidata']);
assert.strictEqual(G.refParaReproduzir(repo, ['WMS-1'], { categoria: 'outro' }), null);
assert.strictEqual(G.refParaReproduzir(repo, ['WMS-9'], { categoria: 'bug', achadoEmHomologacao: true, buscar: false }), null);

// ── padrão de nome ──
assert.deepStrictEqual(G.nomeSugerido(repo, { chave: 'WMS-7', tipo: 'História' }).nome, 'story/WMS-7'); // story/ 1 x feature/ 1: empate fica no primeiro
gx(semente, 'checkout', '-q', '-b', 'feature/WMS-60', 'master-md'); commit(semente, 'x');
gx(semente, 'checkout', '-q', '-b', 'feature/WMS-61', 'master-md'); commit(semente, 'y');
gx(semente, 'checkout', '-q', 'master-md');
gx(cwd, 'remote', 'set-url', 'origin', semente); gx(cwd, 'fetch', '-q', 'origin');
const ns = G.nomeSugerido(repo, { chave: 'WMS-7', tipo: 'Story' });
assert.deepStrictEqual([ns.nome, ns.prefixo], ['feature/WMS-7', 'feature']);
assert.ok(/feature\/ 3/.test(ns.porque), ns.porque);
assert.strictEqual(G.nomeSugerido(repo, { chave: 'WMS-8', tipo: 'Bug' }).nome, 'bugfix/WMS-8'); // sem histórico: o primeiro
assert.strictEqual(G.nomeSugerido(repo, { chave: 'WMS-8', tipo: 'Tarefa' }).nome, 'feature/WMS-8'); // task/ 0 x feature/ 3
assert.strictEqual(G.nomeSugerido(repo, { chave: 'WMS-8', tipo: 'Incidente' }).nome, 'hotfix/WMS-8');
assert.strictEqual(G.nomeSugerido(repo, { chave: 'WMS-8', tipo: 'outro' }).nome, 'feature/WMS-8');
assert.strictEqual(G.propria(repo, 'WMS-9'), null);
assert.strictEqual(G.propria(repo, 'WMS-5'), null); // feature/WMS-50 não é do WMS-5
assert.deepStrictEqual(G.propria(repo, 'WMS-2'), { nome: 'story/WMS-2', local: false });

// ── trocar / criar / garantirPrincipal ──
const head = () => gx(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
let t = G.trocar(repo, 'story/WMS-2', { chave: 'WMS-2' });
assert.deepStrictEqual([t.ok, t.trocou, head(), gx(cwd, 'rev-parse', '--abbrev-ref', '@{u}')], [true, true, 'story/WMS-2', 'origin/story/WMS-2']);
assert.deepStrictEqual(G.propria(repo, 'WMS-2'), { nome: 'story/WMS-2', local: true });
// a checkout é do ticket: garantirPrincipal não mexe
assert.deepStrictEqual([G.garantirPrincipal(repo, { chave: 'WMS-2' }).doTicket, head()], [true, 'story/WMS-2']);
// sujo: não mexe
fs.appendFileSync(path.join(cwd, 'f2.txt'), 'meu trabalho');
t = G.garantirPrincipal(repo, { chave: 'WMS-7' });
assert.deepStrictEqual([t.ok, t.motivo, head()], [false, 'sujo', 'story/WMS-2']);
gx(cwd, 'checkout', '--', '.');
fs.writeFileSync(path.join(cwd, 'novo-nao-versionado.txt'), 'x'); // arquivo novo não conta como sujo
// dono em memória: outra execução viva bloqueia; morta, libera
G.assumir(cwd, 'WMS-8', () => true);
assert.strictEqual(G.garantirPrincipal(repo, { chave: 'WMS-7' }).motivo, 'dono');
G.assumir(cwd, 'WMS-8', () => false);
t = G.garantirPrincipal(repo, { chave: 'WMS-7', vivo: () => true });
assert.deepStrictEqual([t.ok, t.de, head()], [true, 'story/WMS-2', 'master-md']);
assert.strictEqual(G.donoDe(cwd).chave, 'WMS-7');
G.assumir(cwd, 'WMS-7', () => false);
// criar: fetch + checkout -b --no-track
t = G.criar(repo, 'feature/WMS-7', 'origin/feature/WMS-60', { chave: 'WMS-7' });
assert.deepStrictEqual([t.ok, head(), G.gitOk(cwd, ['rev-parse', '--abbrev-ref', '@{u}'])], [true, 'feature/WMS-7', false]);
assert.strictEqual(G.criar(repo, 'feature/WMS-7', 'origin/master-md', { chave: 'WMS-7', buscar: false }).motivo, 'git'); // já existe
gx(cwd, 'remote', 'set-url', 'origin', path.join(os.tmpdir(), 'nao-existe-origem'));
assert.strictEqual(G.criar(repo, 'feature/WMS-77', 'origin/master-md', { chave: 'WMS-7' }).motivo, 'fetch');
assert.ok(/fetch falhou/.test(G.localizar(repo, ['WMS-1']).aviso)); // fetch que falha vira aviso
assert.strictEqual(G.trocar(repo, 'nao/existe').motivo, 'nao-existe');
// branch presa em outro worktree
const wtSolto = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'git-wt-')), 'wt');
gx(cwd, 'worktree', 'add', '-q', wtSolto, 'story/WMS-2');
assert.strictEqual(G.trocar(repo, 'story/WMS-2', { chave: 'WMS-2' }).motivo, 'presa');
// worktree da esteira de outro ticket: a branch presa nele e a própria pasta
const wtEsteira = path.join(G.raizWorktrees(), 'WMS-6', 'G2', 'repo');
fs.mkdirSync(path.dirname(wtEsteira), { recursive: true });
gx(cwd, 'branch', 'bugfix/WMS-6', 'master-md');
gx(cwd, 'worktree', 'add', '-q', wtEsteira, 'bugfix/WMS-6');
t = G.trocar(repo, 'bugfix/WMS-6', { chave: 'WMS-7' });
assert.deepStrictEqual([t.motivo, /WMS-6/.test(String(t.texto))], ['worktree-esteira', true]);
assert.strictEqual(G.garantirPrincipal({ caminho: wtEsteira, branchPrincipal: 'master-md' }, { chave: 'WMS-7' }).motivo, 'worktree-esteira');
assert.strictEqual(G.garantirPrincipal({ caminho: cwd }, {}).motivo, 'sem-principal');
assert.strictEqual(head(), 'feature/WMS-7'); // nenhuma proteção mexeu na checkout

// ── destacar / voltar (reprodução no commit certo) ──
const alvo = gx(cwd, 'rev-parse', 'origin/pre-releases/v84.0.0-rc');
let dz = G.destacar(repo, alvo, { chave: 'WMS-1' });
assert.deepStrictEqual([dz.ok, dz.de, dz.trocou], [true, 'feature/WMS-7', true]);
assert.strictEqual(gx(cwd, 'rev-parse', 'HEAD'), alvo);
assert.strictEqual(G.destacar(repo, alvo).de, alvo); // já destacado: o "de" seria o sha (por isso quem chama guarda só o primeiro)
assert.ok(G.voltar(repo, dz.de).ok);
assert.strictEqual(head(), 'feature/WMS-7');
fs.appendFileSync(path.join(cwd, 'f2.txt'), 'sujo');
assert.strictEqual(G.destacar(repo, alvo).motivo, 'sujo');
gx(cwd, 'checkout', '--', 'f2.txt');

console.log('OK teste-git');
