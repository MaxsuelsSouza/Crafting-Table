// @ts-check
// node janelas/qa/testes/teste-codigo-qa.js — onde está o código do ticket (03-ambiente/subetapas/codigo.js) e a volta para a principal na
// entrada (orquestrador/principal.js), num repositório git temporário real (origin = clone bare). Cobre 0/1/vários achados, resposta e sujo.
const assert = require('assert');
const fs = require('fs'),
  os = require('os'),
  path = require('path');
const { execFileSync } = require('child_process');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-codigo-home-'));
const { localizarCodigo, responderCodigo, PRINCIPAL } = require('../etapas/03-ambiente/subetapas/codigo');
const { garantirPrincipal, SEGUIR, TENTAR } = require('../orquestrador/principal');
const { responder } = require('../orquestrador/responder');
const { citarCodigo } = require('../orquestrador/prompt-comum');
const { estado, mudar } = require('../estado');

let dia = 1;
const gx = (cwd, ...a) => {
  const data = `2026-01-${String(dia).padStart(2, '0')}T10:00:00`;
  return execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...a], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: data, GIT_COMMITTER_DATE: data }
  }).trim();
};
const commit = (cwd, msg) => {
  dia++;
  fs.writeFileSync(path.join(cwd, `f${dia}.txt`), msg);
  gx(cwd, 'add', '.');
  gx(cwd, 'commit', '-q', '-m', msg);
};
// origem: master-md; WMS-1 numa pre-release; WMS-2 numa pre-release e numa story (famílias diferentes = empate)
const semente = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-codigo-semente-'));
gx(semente, 'init', '-q', '-b', 'master-md');
commit(semente, 'init');
gx(semente, 'checkout', '-q', '-b', 'pre-releases/v83.0.0-rc');
commit(semente, '[WMS-1] tela nova');
commit(semente, '[WMS-11] subtarefa');
commit(semente, '[WMS-2] regra');
gx(semente, 'checkout', '-q', '-b', 'story/WMS-2', 'master-md');
commit(semente, 'WMS-2 regra');
gx(semente, 'checkout', '-q', 'master-md');
const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-codigo-origin-'));
execFileSync('git', ['clone', '-q', '--bare', semente, bare]);
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-codigo-repo-'));
execFileSync('git', ['clone', '-q', bare, cwd]);
const repos = [{ camada: 'backend', caminho: cwd, branchPrincipal: 'master-md' }];
const novaPasta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qa-codigo-dir-'));

(async () => {
  // ── 1 achado (com subtarefa): usa, grava e cita no prompt
  let dir = novaPasta();
  const filhos = async () => [{ key: 'WMS-11' }, { key: 'WMS-12' }];
  assert.strictEqual(await localizarCodigo(dir, { chave: 'WMS-1', repos, filhos }), true);
  const c = estado(dir).codigo.backend;
  assert.deepStrictEqual([c.ref, c.via, c.commits], ['origin/pre-releases/v83.0.0-rc', 'candidata', 2]);
  assert.ok(!estado(dir).pausa);
  assert.ok(
    /Código do ticket \(backend\) em `origin\/pre-releases\/v83\.0\.0-rc`.*mapa-git .* show .*sem checkout/.test(
      citarCodigo(dir)
    )
  );
  assert.strictEqual(citarCodigo(novaPasta()), ''); // sem código localizado, sem linha

  // ── 0 achados: pausa com Seguir na principal; texto livre vira a ref e fica fixa
  dir = novaPasta();
  assert.strictEqual(await localizarCodigo(dir, { chave: 'WMS-9', repos, candidatas: ['pre-releases/*'] }), false);
  let p = estado(dir).pausa;
  assert.strictEqual(p.motivo, 'codigo');
  assert.ok(/não achei código de WMS-9 em pre-releases\/\* nem na principal/.test(p.pergunta));
  assert.deepStrictEqual(p.opcoes, [PRINCIPAL]);
  assert.strictEqual(responder(dir, 'origin/homolog/v84'), true);
  assert.deepStrictEqual(
    [estado(dir).pausa, estado(dir).codigo.backend.ref, estado(dir).codigo.backend.via],
    [null, 'origin/homolog/v84', 'informado']
  );
  assert.ok(!fs.existsSync(path.join(dir, '.respostas.md'))); // pausa da extensão: não vai para as respostas do Claude
  assert.strictEqual(await localizarCodigo(dir, { chave: 'WMS-9', repos }), true); // fixa: não busca nem pausa de novo
  // "Seguir na principal"
  dir = novaPasta();
  await localizarCodigo(dir, { chave: 'WMS-9', repos });
  assert.strictEqual(responderCodigo(dir, estado(dir).pausa, PRINCIPAL), true);
  assert.strictEqual(estado(dir).codigo.backend.ref, 'origin/master-md');

  // ── vários (famílias diferentes): pausa com as refs; escolher uma
  dir = novaPasta();
  assert.strictEqual(await localizarCodigo(dir, { chave: 'WMS-2', repos }), false);
  p = estado(dir).pausa;
  assert.deepStrictEqual(
    [...p.opcoes].sort(),
    ['origin/pre-releases/v83.0.0-rc', 'origin/story/WMS-2', PRINCIPAL].sort()
  );
  responder(dir, 'origin/story/WMS-2');
  assert.deepStrictEqual(
    [estado(dir).codigo.backend.ref, estado(dir).codigo.backend.via],
    ['origin/story/WMS-2', 'chave-no-nome']
  );

  // ── sem repositórios: segue sem nada
  assert.strictEqual(await localizarCodigo(novaPasta(), { chave: 'WMS-1' }), true);

  // ── garantirPrincipal: volta se limpo; pausa se sujo; Seguir assim libera
  gx(cwd, 'checkout', '-q', '-b', 'outra');
  dir = novaPasta();
  assert.strictEqual(garantirPrincipal(dir, { chave: 'WMS-1', repos }), true);
  assert.strictEqual(gx(cwd, 'rev-parse', '--abbrev-ref', 'HEAD'), 'master-md');
  gx(cwd, 'checkout', '-q', 'outra');
  fs.writeFileSync(path.join(cwd, 'f2.txt'), 'mexido'); // arquivo versionado alterado
  assert.strictEqual(garantirPrincipal(dir, { chave: 'WMS-1', repos }), false);
  p = estado(dir).pausa;
  assert.deepStrictEqual([p.motivo, p.opcoes], ['principal', [TENTAR, SEGUIR]]);
  assert.strictEqual(estado(dir).execucao, 'pausado');
  assert.strictEqual(gx(cwd, 'rev-parse', '--abbrev-ref', 'HEAD'), 'outra'); // nada foi mexido
  responder(dir, TENTAR);
  assert.strictEqual(estado(dir).pausa, null);
  assert.strictEqual(garantirPrincipal(dir, { chave: 'WMS-1', repos }), false); // continua sujo: pausa de novo
  responder(dir, SEGUIR);
  assert.strictEqual(garantirPrincipal(dir, { chave: 'WMS-1', repos }), true);
  mudar(dir, { principalOk: false });
  gx(cwd, 'checkout', '-q', '--', 'f2.txt');
  gx(cwd, 'checkout', '-q', '-b', 'story/WMS-1');
  assert.strictEqual(garantirPrincipal(dir, { chave: 'WMS-1', repos }), true); // branch do ticket fica
  assert.strictEqual(gx(cwd, 'rev-parse', '--abbrev-ref', 'HEAD'), 'story/WMS-1');

  // ── skill: --ref do backend e --ref-mobile (só se o script conhecer), sem o origin/
  const { prepararPelaSkill } = require('../etapas/03-ambiente/subetapas/skill');
  const backend = novaPasta(),
    script = path.join(backend, 'testes-funcionais', 'preparar-ambiente.py');
  fs.mkdirSync(path.dirname(script));
  const eco = 'import json, sys\nprint(json.dumps({"argv": sys.argv[1:], "itens": []}))\n';
  fs.writeFileSync(script, `# --ref-mobile\n${eco}`);
  dir = novaPasta();
  mudar(dir, { codigo: { backend: { ref: 'origin/pre-releases/v83.0.0-rc' }, mobile: { ref: 'origin/story/WMS-1' } } });
  let amb = await prepararPelaSkill(dir, 'WMS-1', backend);
  assert.deepStrictEqual(amb.argv.slice(3, 7), ['--ref', 'pre-releases/v83.0.0-rc', '--ref-mobile', 'story/WMS-1']);
  fs.writeFileSync(script, eco); // cópia antiga, sem --ref-mobile
  amb = await prepararPelaSkill(dir, 'WMS-1', backend);
  assert.ok(amb.argv.includes('--ref') && !amb.argv.includes('--ref-mobile'));

  console.log('teste-codigo-qa: ok');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
