// @ts-check
// node implementacoes/teste-dossie.js — o dossiê lê o disco do ticket e decide prontidão e modo, sem rede e sem IA.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dossie-home-'));
const tickets = require('../infra/tickets');
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

console.log('ok');
