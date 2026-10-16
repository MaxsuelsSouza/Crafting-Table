// @ts-check
// node configuracao/teste-conexao.js
// Conexão e mapeamento por IA: provedores "em breve" derivados do registro, validação da saída da IA, prompt sem token.
const assert = require('assert');
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : load(r, ...a));
const conexao = require('./conexao');
const cfg = require('./configuracao');
const variaveis = require('../infra/provedores/variaveis');
const { listaProvedores, montarEntrada, montarPrompt, validarSaida, filtrarValores, semSegredos } = conexao._teste;

// Provedores: "disponível" vem do registro, não de uma lista fixa.
const real = listaProvedores();
assert.deepStrictEqual(real.filter((p) => p.disponivel).map((p) => p.id), ['jira']);
assert.deepStrictEqual(real.filter((p) => !p.disponivel).map((p) => p.id).sort(), ['azure', 'clickup', 'linear', 'monday', 'notion']);
assert.ok(!real.some((p) => /slack/i.test(p.id)));
const comMonday = listaProvedores({ jira: () => ({}), monday: () => ({}) });
assert.deepStrictEqual(comMonday.filter((p) => p.disponivel).map((p) => p.id).sort(), ['jira', 'monday']);
assert.ok(listaProvedores({}).every((p) => !p.disponivel));

// Tela: sem conexão lista os provedores (os "em breve" desabilitados); conectado mostra conta e botões.
const val = { modelo: '', esforco: '', jiraSite: 'https://x.atlassian.net', jiraProjeto: '', jiraBoard: '', etapasExtras: [], specsDir: '/x', specsRemoto: '', repositorios: [], bancoConexao: '', bancoAmbiente: '', bancoSqlcl: '', bancoSensiveis: [] };
const base = { aba: 'geral', valores: val, reposAuto: [], voltar: '<i></i>', versao: '1' };
const sem = cfg.tela({ ...base, estado: { jira: { ok: false, conectado: false } } });
assert.ok(sem.includes('Ferramenta de gestão de trabalho') && sem.includes('data-acao="provedorEscolher" data-id="jira"'));
assert.ok(!sem.includes('data-acao="provedorEscolher" data-id="monday"') && sem.includes('em breve') && !/Slack/.test(sem) && !sem.includes('data-acao="provedorSair"'));
const com = cfg.tela({ ...base, conexao: { ativo: { id: 'jira', nome: 'Jira' } }, estado: { jira: { ok: true, conectado: true, conta: 'Maria' } } });
assert.ok(['provedorTrocar', 'provedorSair', 'provedorMapear'].every((a) => com.includes(`data-acao="${a}"`)) && com.includes('Maria') && com.includes('https://x.atlassian.net'));

// Descoberta de exemplo e definições reais.
const descoberta = { site: 'https://x.atlassian.net', projetos: [{ chave: 'ABC', nome: 'Projeto' }],
  boards: [{ id: 1, nome: 'Time Azul', projeto: 'ABC', etapas: [{ nome: 'A fazer', ids: ['1'] }, { nome: 'Em teste', ids: ['2'] }] }],
  status: ['A fazer', 'Em teste', 'Pronto para QA', 'Buffer'], tiposItem: [{ nome: 'História' }, { nome: 'Bug' }, { nome: 'Incidente' }], labels: ['qa-time', 'infra'] };
const defs = conexao._teste.MAPEAVEIS(variaveis.definicoes);
assert.ok(!defs.some((d) => d.chave === 'projeto' || d.chave === 'site')); // projetos e site: a pessoa escolhe, a IA não mexe
assert.match(validarSaida({ projeto: { valor: ['ABC'], justificativa: '' } }, descoberta, defs).rejeitadas[0].motivo, /desconhecida/);
const ok = validarSaida({
  boardPrincipal: { valor: ['time azul'], justificativa: 'caixa errada' },
  etapasExtras: { valor: ['Buffer'], justificativa: 'extra' }, etapasQA: { valor: ['Pronto para QA|Pronto p/ QA'], justificativa: 'alternativa' },
  tipoIncidente: { valor: 'Incidente', justificativa: 'x' }, labelQA: { valor: 'qa-time', justificativa: 'x' } }, descoberta, defs);
assert.strictEqual(ok.rejeitadas.length, 1, JSON.stringify(ok.rejeitadas)); // etapasQA: "Pronto p/ QA" não existe na conta
assert.strictEqual(ok.rejeitadas[0].chave, 'etapasQA');
assert.deepStrictEqual(ok.aceitas.find((a) => a.chave === 'boardPrincipal').valor, ['Time Azul']); // nome exato da conta
assert.deepStrictEqual(ok.aceitas.find((a) => a.chave === 'etapasExtras').valor, ['Buffer']);

// Rejeições: chave desconhecida, valor fora da descoberta, tipo errado, vazio, formato.
const motivo = (saida, chave) => validarSaida(saida, descoberta, defs).rejeitadas.find((r) => r.chave === chave)?.motivo || '';
assert.match(motivo({ inventada: { valor: 'x', justificativa: '' } }, 'inventada'), /desconhecida/);
assert.match(motivo({ tipoIncidente: { valor: 'ZZZ', justificativa: '' } }, 'tipoIncidente'), /fora da conta/);
assert.match(motivo({ etapasQA: { valor: ['Inexistente'], justificativa: '' } }, 'etapasQA'), /fora da conta/);
assert.match(motivo({ tipoIncidente: { valor: ['Bug'], justificativa: '' } }, 'tipoIncidente'), /tipo errado/);
assert.match(motivo({ etapasExtras: { valor: 'Buffer', justificativa: '' } }, 'etapasExtras'), /tipo errado/);
assert.match(motivo({ etapasExtras: { valor: [], justificativa: '' } }, 'etapasExtras'), /vazio/);
assert.match(motivo({ tipoIncidente: 'Bug' }, 'tipoIncidente'), /faltou/);
assert.strictEqual(validarSaida([], descoberta, defs).aceitas.length, 0);
assert.strictEqual(validarSaida(null, descoberta, defs).rejeitadas.length, 1);
assert.deepStrictEqual(filtrarValores(['a', 'b'], new Map([['a', 'a']])), { validos: ['a'], invalidos: ['b'] });

// Prompt e entrada nunca levam o token.
const TOKEN = 'ATATT3xFfGF0-segredo-123';
const entrada = JSON.stringify(montarEntrada('jira', { ...descoberta, token: TOKEN, auth: { password: TOKEN, ok: 1 } }, defs, { projeto: 'ABC' }));
assert.ok(!entrada.includes(TOKEN) && entrada.includes('boardPrincipal'));
assert.ok(!JSON.stringify(semSegredos({ a: { Authorization: TOKEN, b: 1 } })).includes(TOKEN));
const prompt = montarPrompt('/home/u/.claude/crafting-table/mapeamento');
assert.ok(!prompt.includes(TOKEN) && !/ATATT|Basic /.test(prompt) && prompt.includes('entrada.json') && prompt.includes('saida.json'));
console.log('ok conexao');
