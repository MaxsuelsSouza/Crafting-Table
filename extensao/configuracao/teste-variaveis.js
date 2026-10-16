// @ts-check
// node configuracao/teste-variaveis.js
// Variáveis do provedor: ler/gravar, migração dos settings antigos, tela da aba e pendências quando falta variável.
const assert = require('assert');
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : load(r, ...a));
const variaveis = require('../infra/provedores/variaveis');
const configuracao = require('./configuracao');

// Setting falsa: guarda o que o código grava e responde os settings antigos.
const fazer = (antigos = {}) => {
  const c = { dados: { ...antigos }, get: (k) => c.dados[k], update: async (k, v) => { c.dados[k] = v; } };
  variaveis._teste.usar(c);
  return c;
};

// Sem nada: tudo pendente, e nenhum valor da empresa aparece.
fazer();
assert.ok(variaveis.todas().every((x) => !x.definida));
assert.strictEqual(variaveis.ler('site'), '');
assert.deepStrictEqual(variaveis.ler('boardPrincipal'), []);
assert.deepStrictEqual(variaveis.ler('etapasQA'), []);
assert.deepStrictEqual(variaveis.definicoes.map((d) => d.chave),
  ['site', 'projeto', 'boardPrincipal', 'etapasExtras', 'tipoIncidente', 'etapasQA', 'labelQA', 'etapasImplementacao', 'tiposQuebrar', 'tiposDesenvolver', 'tiposExecutar']);
assert.ok(variaveis.definicoes.every((d) => d.rotulo && d.descricao && d.usadaEm));

// Migração: settings antigos e globalState.labelQA viram valor (sem apagar nada).
const c = fazer({ jiraSite: 'https://x.atlassian.net/', jiraProjeto: 'ABC', jiraBoard: 'Meu', etapasExtras: ['Pronto p/ Dev'] });
variaveis.vincular({ get: (k) => (k === 'labelQA' ? 'qa-time' : undefined) });
assert.strictEqual(variaveis.ler('site'), 'https://x.atlassian.net');
assert.deepStrictEqual(variaveis.ler('projeto'), ['ABC']); // valor antigo em texto vira lista
assert.deepStrictEqual(variaveis.ler('boardPrincipal'), ['Meu']);
assert.deepStrictEqual(variaveis.ler('etapasExtras'), ['Pronto p/ Dev']);
assert.strictEqual(variaveis.ler('labelQA'), 'qa-time');
const migrada = variaveis.todas().find((x) => x.chave === 'site');
assert.ok(migrada?.definida && migrada.migrada);
assert.strictEqual(c.dados.jiraSite, 'https://x.atlassian.net/'); // settings antigos intactos

(async () => {
  // Gravar/ler: a variável gravada vence a migração; guarda origem, descrição e data.
  await variaveis.gravar('projeto', ' WMS ', 'ia');
  await variaveis.gravar('etapasQA', 'Pronto para QA|Pronto p/ QA, Teste integrado');
  assert.deepStrictEqual(variaveis.ler('projeto'), ['WMS']);
  assert.deepStrictEqual(variaveis.ler('etapasQA'), ['Pronto para QA|Pronto p/ QA', 'Teste integrado']);
  const g = c.dados.variaveis.projeto;
  assert.ok(g.origem === 'ia' && g.descricao && g.atualizado && g.valor[0] === 'WMS');
  const p = variaveis.todas().find((x) => x.chave === 'projeto');
  assert.ok(p?.origem === 'ia' && !p.migrada);
  await assert.rejects(() => variaveis.gravar('inexistente', 'x'));

  // Pendências: faltando variável, o fluxo avisa (nada de valor da empresa).
  const secrets = {};
  require('../infra/provedores/fachada').jira.conectado = async () => true;
  fazer({});
  variaveis.vincular(null);
  assert.deepStrictEqual(await configuracao.pendencias(secrets), ['site', 'projeto', 'board']);
  assert.strictEqual(configuracao.jiraPendencias, configuracao.pendencias); // alias
  await variaveis.gravar('site', 'https://x.atlassian.net'); await variaveis.gravar('projeto', 'ABC'); await variaveis.gravar('boardPrincipal', ['B', 'C']);
  assert.deepStrictEqual(variaveis.ler('boardPrincipal'), ['B', 'C']); // mais de um board
  assert.deepStrictEqual(await configuracao.pendencias(secrets), []);
  assert.deepStrictEqual(await configuracao.pendencias(secrets, 'qa'), ['etapas de qa']);
  assert.deepStrictEqual(await configuracao.pendencias(secrets, 'impl'), ['etapas de implementação']);
  assert.deepStrictEqual(await configuracao.pendencias(secrets, 'incidentes'), ['tipo de incidente']);
  await variaveis.gravar('tipoIncidente', 'Incidente');
  assert.deepStrictEqual(await configuracao.pendencias(secrets, 'incidentes'), []);

  // Aba Variáveis: rótulo, valor, descrição, selo de origem e Editar por data-acao.
  const tela = (estado) => configuracao.tela({ aba: 'variaveis', valores: /** @type {any} */ ({}), estado, reposAuto: [], voltar: '', versao: '1', variaveis: variaveis.todas() });
  const html = tela({ jira: { conectado: true } });
  assert.ok(html.includes('data-acao="cfgAba" data-id="variaveis"') && html.includes('data-acao="varEditar" data-id="etapasQA"'));
  assert.ok(html.includes('falta configurar') && html.includes('manual') && html.includes('Tipo de incidente') && html.includes('Usada em:') && html.includes('O que são as variáveis'));
  // Sem conta: nada é editável (os valores vêm da conta) e a tela diz para conectar.
  const semConta = tela({});
  assert.ok(!semConta.includes('data-acao="varEditar"') && semConta.includes('Conecte a ferramenta'));

  // Sair da conta: limpa tudo e não volta a cair nos settings antigos nem no labelQA do globalState.
  fazer({ jiraSite: 'https://x.atlassian.net', jiraProjeto: 'ABC', jiraBoard: 'Meu' });
  variaveis.vincular({ get: (k) => (k === 'labelQA' ? 'qa-time' : undefined) });
  await variaveis.gravar('tipoIncidente', 'Incidente', 'ia');
  assert.strictEqual(variaveis.ler('site'), 'https://x.atlassian.net');
  await variaveis.limpar();
  assert.ok(variaveis.todas().every((x) => !x.definida && !x.migrada), JSON.stringify(variaveis.todas()));
  await variaveis.gravar('projeto', 'XYZ, ABC');
  assert.deepStrictEqual(variaveis.ler('projeto'), ['XYZ', 'ABC']);
  console.log('ok variaveis');
})();
