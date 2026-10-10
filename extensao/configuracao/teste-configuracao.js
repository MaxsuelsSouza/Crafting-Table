// @ts-check
// node teste-configuracao.js
// Configurações: o menu usa cfgAba, o teste de cada seção vira selo/botão, a lista automática de repositórios não edita, plugins ligam por pluginAlternar.
const assert = require('assert');
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : load(r, ...a));
const cfg = require('./configuracao');
const val = { modelo: '', esforco: '', jiraSite: 's', jiraProjeto: 'WMS', jiraBoard: 'B', etapasExtras: [], specsDir: '/x', specsRemoto: '', repositorios: [], bancoConexao: '', bancoAmbiente: '', bancoSqlcl: '', bancoSensiveis: [] };
const base = { valores: val, estado: { jira: { ok: false, curto: 'sem token', texto: 'falhou' } }, reposAuto: [{ caminho: '/r/api', camada: 'backend' }], voltar: '<i></i>', versao: '1' };
const geral = cfg.tela({ ...base, aba: 'geral' });
assert.ok(geral.includes('data-acao="cfgAba" data-id="plugins"') && geral.includes('data-id="cfgTestar"') === false && geral.includes('data-acao="cfgTestar" data-id="jira"'));
assert.ok(geral.includes('⚠ sem token') && geral.includes('testando…') && geral.includes('Atualizar agora') && geral.includes('✅ em dia'));
assert.ok(!geral.includes('data-acao="cfgRepoEditar"') && geral.includes('Detectados automaticamente')); // lista automática não edita
assert.ok(cfg.tela({ ...base, aba: 'plugins', plugins: [{ id: 'p@m', uso: 'u', skills: [], instalado: true, versao: '1', ligado: true }] }).includes('data-acao="pluginAlternar" data-id="p@m"'));
console.log('ok configuracao');
