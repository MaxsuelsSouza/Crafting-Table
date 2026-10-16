// @ts-check
// node infra/teste-dossie.js — o dossiê lê o disco do ticket e decide prontidão e modo, sem rede e sem IA.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dossie-home-'));
const tickets = require('./tickets');
const dossie = require('./dossie');

const novo = (chave, extras = {}) => tickets.gravar({ idProvedor: chave, chave, provedor: 'jira', site: 'https://x', link: 'https://x/' + chave, titulo: 'Titulo', status: '', conversas: [], ...extras });
const escrever = (arq, txt) => { fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, typeof txt === 'string' ? txt : JSON.stringify(txt)); };
const REPOS = [{ caminho: '/r/backend', camada: 'backend', branchPrincipal: 'master-md' }, { caminho: '/r/mobile', camada: 'mobile', branchPrincipal: 'main' }];
const BANCO = { conexao: 'qas', ambiente: 'qas' };

// 1. só título: perguntar, prontidão baixa, aprovação do Entendimento exigida
let t = novo('T-1');
let d = dossie.montar(t, { j: { descricao: '', comentarios: [] }, banco: {}, repos: REPOS });
assert.deepStrictEqual([d.modo, d.prontidao, d.niveis.alvo, d.exigeAprovacaoEntendimento], ['perguntar', 'baixa', 'ausente', true]);
assert.ok(d.lacunas.some((l) => /só o título/.test(l)));
assert.strictEqual(d.capacidades.banco, 'nenhum');
assert.ok(d.lacunas.some((l) => /Sem acesso ao banco/.test(l)));

// 2. briefing verbal: entender
escrever(path.join(tickets.pasta('T-1', 'impl'), dossie.BRIEFING), 'Cancelar a nota quando o pedido for estornado.');
d = dossie.montar(t, { j: {}, banco: BANCO, repos: REPOS });
assert.deepStrictEqual([d.modo, d.niveis.alvo, d.capacidades.banco], ['entender', 'verbal', 'leitura']);

// 3. descrição sem refinar: entender, alvo bruto
t = novo('T-2');
d = dossie.montar(t, { j: { descricao: '<p>Ao finalizar a tarefa sem completar todos os cards o app deve avisar o operador e não fechar.</p>', comentarios: [] }, repos: REPOS });
assert.deepStrictEqual([d.modo, d.niveis.alvo, d.prontidao], ['entender', 'bruto', 'media']);

// 4. produção nunca é leitura
assert.strictEqual(dossie.montar(t, { banco: { conexao: 'x', ambiente: 'producao' }, repos: REPOS }).capacidades.banco, 'nenhum');

// 5. ticket por documento
const orig = path.join(os.tmpdir(), `req-${Date.now()}.md`); fs.writeFileSync(orig, '# Req');
t = novo('DOC-1', { provedor: 'documento', site: 'documento:local', documento: { arquivo: 'req.md', nome: 'req.md', tipo: 'md' } });
fs.copyFileSync(orig, path.join(tickets.pasta('DOC-1'), 'req.md'));
d = dossie.montar(t, { j: { descricao: '', comentarios: [] }, repos: REPOS });
assert.deepStrictEqual([d.modo, d.niveis.alvo], ['entender', 'bruto']);
assert.ok(d.eixos.alvo[0].arquivo.endsWith('req.md'));

// 6. spec aprovada + tarefas aprovadas: executar, prontidão alta, sem portão no Entendimento
const repoSpecs = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-'));
t = novo('T-3', { spec: { repo: repoSpecs, dir: 'T-3-feature' } });
const dsp = path.join(repoSpecs, 'T-3-feature');
escrever(path.join(dsp, 'spec.md'), '# Spec\nRF01 …');
escrever(path.join(dsp, 'plan.md'), '# Plano');
escrever(path.join(dsp, 'tasks.md'), '# Tarefas');
escrever(path.join(dsp, 'sdd-state.json'), { passos: [{ n: 1, status: 'aprovado' }, { n: 2, status: 'aprovado' }, { n: 3, status: 'aprovado' }, { n: 4, status: 'aprovado' }] });
escrever(path.join(tickets.pasta('T-3'), '.tarefas.json'), [{ id: 't01', status: 'aprovada', titulo: 'a' }, { id: 'qa', status: 'aprovada', tipo: 'qa' }]);
d = dossie.montar(t, { j: {}, repos: REPOS });
assert.deepStrictEqual([d.modo, d.prontidao, d.niveis.alvo, d.niveis.pronto, d.niveis.onde, d.exigeAprovacaoEntendimento], ['executar', 'alta', 'aprovado', 'aprovado', 'aprovado', false]);
assert.ok(d.eixos.onde.some((i) => /1\/1 aprovadas/.test(i.rotulo)));

// 7. spec ainda não aprovada: gerado, entender (não executar)
escrever(path.join(dsp, 'sdd-state.json'), { passos: [{ n: 1, status: 'aguardando_revisao' }] });
fs.rmSync(path.join(tickets.pasta('T-3'), '.tarefas.json'));
d = dossie.montar(t, { j: {}, repos: REPOS });
assert.deepStrictEqual([d.modo, d.niveis.alvo], ['entender', 'gerado']);

// 8. incidente diagnosticado, sem massa: corrigir; reprodução vira critério de pronto
t = novo('T-4');
const inc = tickets.pasta('T-4', 'incidentes');
escrever(path.join(inc, '4-diagnostico.md'), '# Diagnóstico\nAção: finalizar sem cards.');
escrever(path.join(inc, '.mergulho.json'), { etapa: 5 });
escrever(path.join(inc, 'reproducao.json'), { ok: true, midias: [] });
d = dossie.montar(t, { j: { descricao: '', comentarios: [] }, repos: REPOS });
assert.deepStrictEqual([d.modo, d.niveis.alvo, d.niveis.pronto, d.prontidao, d.exigeAprovacaoEntendimento], ['corrigir', 'aprovado', 'gerado', 'alta', false]);
assert.strictEqual(d.fontes.incidente.massaReal, false);

// 9. incidente sem diagnóstico nem descrição: perguntar
t = novo('T-5');
escrever(path.join(tickets.pasta('T-5', 'incidentes'), '.mergulho.json'), { etapa: 2 });
assert.strictEqual(dossie.montar(t, { j: {}, repos: REPOS }).modo, 'perguntar');

// 10. spec + incidente somam fontes; QA entra como critério de pronto
t = novo('T-6', { spec: { repo: repoSpecs, dir: 'T-3-feature' } });
escrever(path.join(dsp, 'sdd-state.json'), { passos: [{ n: 2, status: 'aprovado' }, { n: 4, status: 'aprovado' }] });
escrever(path.join(tickets.pasta('T-6', 'incidentes'), '4-diagnostico.md'), 'x');
escrever(path.join(tickets.pasta('T-6', 'qa'), '.cenarios.json'), { cenarios: [{ id: 'CT01', status: 'passou' }, { id: 'CT02', arquivado: true }] });
escrever(path.join(tickets.pasta('T-6', 'qa'), '.qa.json'), { fase: 'plano_aprovado' });
d = dossie.montar(t, { j: {}, repos: REPOS });
assert.ok(['spec', 'incidente'].every((f) => d.eixos.alvo.some((i) => i.fonte === f)));
assert.ok(d.eixos.pronto.some((i) => i.fonte === 'qa' && i.confianca === 'aprovado' && /\(1\)/.test(i.rotulo)));
assert.strictEqual(d.modo, 'executar');

// 11. repositório sem branch principal vira lacuna; sem repositórios também
d = dossie.montar(t, { j: {}, repos: [{ caminho: '/r/backend', camada: 'backend' }] });
assert.deepStrictEqual(d.capacidades.semBranch, ['/r/backend']);
assert.ok(d.lacunas.some((l) => /Sem branch principal/.test(l)));
assert.ok(dossie.montar(t, { j: {}, repos: [] }).lacunas.some((l) => /Nenhum repositório/.test(l)));

// 12. markdown e gravação
const dir = tickets.pasta('T-6', 'impl');
dossie.gravar(dir, d);
const md = fs.readFileSync(path.join(dir, 'dossie.md'), 'utf8');
assert.ok(md.includes('# Dossiê · T-6') && md.includes('## Lacunas') && md.includes('Executar'));
assert.deepStrictEqual(dossie.lerGravado(dir).modo, 'executar');

// 13. Trabalho já feito por alguém (git real): branch com a chave no nome, só no remoto, commit solto, integrado e não commitado
{
  const { execFileSync } = require('child_process');
  const g = (cwd, ...a) => execFileSync('git', ['-C', cwd, '-c', 'user.email=ana@x', '-c', 'user.name=Ana', ...a], { encoding: 'utf8' }).trim();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'trab-'));
  g(repo, 'init', '-q', '-b', 'main');
  const commit = (arq, txt, msg) => { fs.writeFileSync(path.join(repo, arq), txt); g(repo, 'add', '.'); g(repo, 'commit', '-q', '-m', msg); };
  commit('a.txt', '1', 'base');
  commit('integrado.txt', 'x', 'KAN-5: ajuste pequeno já integrado');          // na principal: aparece como integrado
  g(repo, 'checkout', '-q', '-b', 'feature/KAN-5-filtro-transportadora');
  commit('Filtro.cs', 'class Filtro {}', 'KAN-5 filtro por transportadora (parcial)'); commit('Filtro.cs', 'class Filtro { int x; }', 'KAN-5 wip');
  g(repo, 'checkout', '-q', 'main');
  g(repo, 'checkout', '-q', '-b', 'feature/KAN-50-outra-coisa'); commit('outra.txt', 'y', 'KAN-50: outra coisa'); g(repo, 'checkout', '-q', 'main'); // não casa com KAN-5
  g(repo, 'checkout', '-q', '-b', 'wip-ana'); commit('solto.txt', 'z', 'KAN-5 teste solto sem branch com a chave'); g(repo, 'checkout', '-q', 'main');
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'trab-origin-')); execFileSync('git', ['clone', '-q', '--bare', repo, bare]);
  g(repo, 'remote', 'add', 'origin', bare); g(repo, 'fetch', '-q', 'origin');
  g(repo, 'checkout', '-q', '-b', 'KAN-12-so-remoto'); commit('r.txt', 'r', 'KAN-12 endpoint'); g(repo, 'push', '-q', 'origin', 'KAN-12-so-remoto'); g(repo, 'checkout', '-q', 'main'); g(repo, 'branch', '-q', '-D', 'KAN-12-so-remoto'); g(repo, 'fetch', '-q', 'origin');
  const t = novo('KAN-5', { titulo: 'Conferir por transportadora' });
  const rp = [{ caminho: repo, camada: 'backend', branchPrincipal: 'main' }];
  const j = { descricao: 'x'.repeat(60), comentarios: [], subtarefas: [{ key: 'KAN-12', resumo: 'Endpoint' }] };
  const d = dossie.montar(t, { j, repos: rp });
  assert.strictEqual(d.trabalho.length, 1);
  const w = d.trabalho[0], nomes = w.branches.map((b) => b.nome).sort();
  assert.deepStrictEqual(nomes, ['KAN-12-so-remoto', 'feature/KAN-5-filtro-transportadora']); // KAN-50 fora; subtarefa KAN-12 dentro
  const fil = w.branches.find((b) => b.nome.includes('KAN-5-'));
  assert.deepStrictEqual([fil.adiante, fil.local, fil.remoto, fil.arquivos, fil.commits.length], [2, true, true, ['Filtro.cs'], 2]); // existe local e no origin (o clone levou)
  const rem = w.branches.find((b) => b.nome === 'KAN-12-so-remoto');
  assert.deepStrictEqual([rem.local, rem.remoto, rem.adiante], [false, true, 1]);
  assert.ok(w.integrados.some((c) => /já integrado/.test(c.assunto)) && !w.integrados.some((c) => /KAN-50/.test(c.assunto)));
  assert.ok(w.foraDeBranch.some((c) => /solto/.test(c.assunto) && c.branches.includes('wip-ana')));
  assert.ok(!w.foraDeBranch.some((c) => /KAN-50/.test(c.assunto)));
  assert.strictEqual(w.atual.branch, 'main');
  assert.deepStrictEqual(w.atual.alteracoes, []); // main não é do ticket: alterações dela não contam
  // entra no eixo "onde" e nas lacunas; o arquivo é gravado com os comandos para ver o código
  assert.ok(d.eixos.onde.some((i) => i.fonte === 'trabalho') && d.lacunas.some((l) => /Já existe trabalho/.test(l)));
  assert.ok(!d.lacunas.some((l) => /Sem indicação de onde mexer/.test(l)));
  const dir = tickets.pasta('KAN-5', 'impl');
  dossie.gravar(dir, d);
  const md = fs.readFileSync(path.join(dir, 'trabalho-existente.md'), 'utf8');
  assert.ok(md.includes('feature/KAN-5-filtro-transportadora') && md.includes('Filtro.cs') && md.includes('só no remoto') && md.includes('local e remota') && md.includes(`mapa-git ${repo} log -p main..feature/KAN-5-filtro-transportadora`) && !md.includes('KAN-50'));
  assert.ok(fs.readFileSync(path.join(dir, 'dossie.md'), 'utf8').includes('## Trabalho já feito'));
  // alteração não commitada só conta na branch do ticket
  g(repo, 'checkout', '-q', 'feature/KAN-5-filtro-transportadora'); fs.writeFileSync(path.join(repo, 'Filtro.cs'), 'mudou'); fs.writeFileSync(path.join(repo, 'novo.cs'), 'n');
  const d2 = dossie.montar(t, { j, repos: rp });
  assert.deepStrictEqual(d2.trabalho[0].atual.alteracoes.map((x) => x.trim().split(/\s+/).pop()).sort(), ['Filtro.cs', 'novo.cs']);
  // sem branch principal: ainda lista as branches do ticket, sem comparação; sem trabalho some o arquivo velho
  const d3 = dossie.montar(t, { j: {}, repos: [{ caminho: repo, camada: 'backend' }] });
  assert.ok(d3.trabalho[0].branches.some((b) => b.nome.includes('KAN-5-')) && d3.trabalho[0].integrados.length === 0);
  const limpo = novo('KAN-77'), dl = tickets.pasta('KAN-77', 'impl');
  fs.mkdirSync(dl, { recursive: true }); fs.writeFileSync(path.join(dl, 'trabalho-existente.md'), 'velho');
  const d4 = dossie.montar(limpo, { j: {}, repos: rp });
  assert.deepStrictEqual(d4.trabalho, []); dossie.gravar(dl, d4);
  assert.ok(!fs.existsSync(path.join(dl, 'trabalho-existente.md')));
  // repositório que não é git ou que falha não derruba o dossiê
  assert.deepStrictEqual(dossie.trabalhoExistente([{ caminho: '/nao/existe', camada: 'x' }], ['KAN-5']), []);
  assert.deepStrictEqual(dossie.trabalhoExistente(rp, ['KAN-5'], () => { throw new Error('boom'); }), []);
  // regex de chave: KAN-5 casa com "KAN-5-x" e "feature/KAN-5", não com KAN-50 nem XKAN-5
  const re = dossie._teste.reChave(['KAN-5']);
  assert.deepStrictEqual(['KAN-5-x', 'feature/KAN-5', 'kan-5', 'KAN-5'].map((x) => re.test(x)), [true, true, true, true]);
  assert.deepStrictEqual(['KAN-50', 'XKAN-5', 'KAN-55'].map((x) => re.test(x)), [false, false, false]);
}

console.log('ok');
