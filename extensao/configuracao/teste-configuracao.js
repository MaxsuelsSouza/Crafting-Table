// @ts-check
// node teste-configuracao.js
// Configurações: o menu usa cfgAba, o teste de cada seção vira selo/botão, a lista automática de repositórios não edita, plugins ligam por pluginAlternar.
const assert = require('assert');
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : load(r, ...a));
const cfg = require('./configuracao');
const val = { modelo: '', esforco: '', jiraSite: 's', jiraProjeto: 'WMS', jiraBoard: 'B', etapasExtras: [], specsDir: '/x', specsRemoto: '', repositorios: [], bancoConexao: '', bancoAmbiente: '', bancoSqlcl: '', bancoSensiveis: [] };
const base = { valores: val, estado: { jira: { ok: false, conectado: true, curto: 'sem token', texto: 'falhou' } }, reposAuto: [{ caminho: '/r/api', camada: 'backend' }], voltar: '<i></i>', versao: '1' };
const geral = cfg.tela({ ...base, aba: 'geral' });
assert.ok(geral.includes('data-acao="cfgAba" data-id="plugins"') && geral.includes('data-id="cfgTestar"') === false && geral.includes('data-acao="cfgTestar" data-id="jira"'));
assert.ok(geral.includes('⚠ sem token') && geral.includes('testando…') && geral.includes('Atualizar agora') && geral.includes('✅ em dia'));
assert.ok(!geral.includes('data-acao="cfgRepoEditar"') && geral.includes('Detectados automaticamente')); // lista automática não edita
// Plugins: marketplaces de qualquer origem, um card por módulo com as etapas e o Editar de cada vaga; verificação pronta mostra o que falta e o Usar.
const plug = { marketplaces: [{ nome: 'meu-mkt', origem: 'dono/repo' }], instalados: { 'sdd@crafting-local': { versao: '1', ligado: false } }, nova: {}, auto: true,
  verif: { 'qa.execucao': { estado: 'pronto', candidato: { tipo: 'skill', id: 'x', nome: 'outra-skill', origem: 'skill' }, resultado: { veredito: 'parcial', resumo: 'quase', falta: ['qa-state'], observacoes: '' } } } };
const pl = cfg.tela({ ...base, aba: 'plugins', plug, agente: 'Claude Code' });
assert.ok(pl.includes('meu-mkt') && pl.includes('data-acao="mktRemover" data-id="meu-mkt"') && pl.includes('data-acao="mktAdicionar"') && !pl.includes('Ferreira Costa'));
assert.ok(['Refinamento', 'Implementação', 'QA', 'Incidentes'].every((m) => pl.includes(`<b>${m}</b>`)));
assert.ok(pl.includes('data-acao="plugEditar" data-id="refinamento.sdd"') && pl.includes('data-acao="pluginAlternar" data-id="sdd@crafting-local"'));
assert.ok(pl.includes('⚠ atende em parte') && pl.includes('<li>qa-state</li>') && pl.includes('data-acao="plugUsar" data-id="qa.execucao"') && pl.includes('Usar mesmo assim'));
assert.strictEqual((pl.match(/data-acao="plugUsar"/g) || []).length, 1); // vaga em duas etapas: a verificação aparece uma vez
assert.ok(pl.includes('<span class="cfg-etp-num">Etapa 1</span><span class="cfg-etp-nome">Planejamento</span>') && pl.includes('sem plugin · método embutido na extensão'));
assert.ok(pl.includes('<span class="cfg-etp-num cfg-etp-todas">Todas as etapas</span>'));
// Etapa com subetapas: a mãe mostra "Etapa 4" sem plugin; 4.1 e 4.2 abaixo, cada uma com o plugin e o Editar da sua vaga.
const i4 = pl.indexOf('<span class="cfg-etp-num">Etapa 4</span>'), i41 = pl.indexOf('<span class="cfg-etp-num">4.1</span>'), i42 = pl.indexOf('<span class="cfg-etp-num">4.2</span>');
assert.ok(i4 > 0 && i41 > i4 && i42 > i41 && pl.indexOf('<span class="cfg-etp-num">Etapa 5</span>') > i42);
assert.ok(pl.slice(i41, i42).includes('Mapeamento do código') && pl.slice(i41, i42).includes('data-acao="plugEditar" data-id="refinamento.mapa"'));
assert.ok(pl.slice(i42, pl.indexOf('<span class="cfg-etp-num">Etapa 5</span>')).includes('data-acao="plugEditar" data-id="refinamento.sdd"'));
// Agente sem plugins: a aba some do menu e não abre.
const sem = cfg.tela({ ...base, aba: 'plugins', comPlugins: false });
assert.ok(!sem.includes('data-id="plugins"') && !sem.includes('plugEditar'));
console.log('ok configuracao');
