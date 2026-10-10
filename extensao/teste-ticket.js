// @ts-check
// node teste-ticket.js
const Module = /** @type {any} */ (require('module')); const load = Module._load;
Module._load = (r, ...a) => (r === 'vscode' ? {} : load(r, ...a));
const assert = require('assert');
const { lerLink, esc } = require('./ticket')._teste;
assert.deepStrictEqual(lerLink('https://ferreiracosta.atlassian.net/browse/WMS-123'), { key: 'WMS-123', site: 'https://ferreiracosta.atlassian.net' });
assert.strictEqual(lerLink(' https://x.atlassian.net/jira/software/projects/WMS/boards/1?selectedIssue=wms-9 ').key, 'WMS-9');
assert.throws(() => lerLink('https://x.atlassian.net/jira'));
assert.strictEqual(esc('<b>"x"</b>'), '&#60;b&#62;&#34;x&#34;&#60;/b&#62;');
console.log('ok');

// Abas: o mesmo ticket em Tickets, Implementações e QA, cada uma com a sua pasta e as suas conversas.
process.env.HOME = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'ct-'));
const tk = require('./tickets'), path = require('path');
tk.criar('https://x.atlassian.net/browse/WMS-7', { listas: ['tickets', 'qa'] });
assert.strictEqual(tk.pasta('WMS-7'), path.join(tk.RAIZ, 'WMS-7'));
assert.strictEqual(tk.pasta('WMS-7', 'qa'), path.join(tk.RAIZ, 'WMS-7', 'qa'));
assert.strictEqual(tk.pasta('WMS-7', '../x'), path.join(tk.RAIZ, 'WMS-7')); // aba desconhecida não sai da pasta
tk.vincular('s1', 'WMS-7'); tk.vincular('s2', 'WMS-7', 'qa');
assert.deepStrictEqual([tk.ticketDa('s2'), tk.listaDa('s2'), tk.listaDa('s1')], ['WMS-7', 'qa', 'tickets']);
assert.deepStrictEqual(tk.listasDe({ lista: 'impl' }), ['impl']); // formato antigo
assert.deepStrictEqual(tk.listasDe({ implementacao: true }), ['impl']);
console.log('ok abas');

// Menu de abas: aba ligada, contador, separador e o alvo do clique dentro da página x na moldura de outra seção.
const { menu } = require('./componentes/menu-abas');
const itens = [{ id: 'docs', nome: 'Docs' }, { id: 'duvidas', nome: 'Dúvidas', badge: 2, dica: '2 em aberto' }, '|', { secao: 'outra', nome: 'Outra' }];
const dentro = menu(itens, { aba: 'docs', secao: 'principal', principal: 'principal', dentro: true });
assert.ok(dentro.includes('<button data-acao="aba" data-id="docs" class="is-on">Docs</button>'));
assert.ok(dentro.includes('data-id="duvidas">Dúvidas <span class="ct-badge" title="2 em aberto">2</span>'));
assert.ok(dentro.includes('<span class="ct-sep"></span><button data-secao="outra">Outra</button>'));
const fora = menu(itens, { aba: 'docs', secao: 'outra', principal: 'principal', dentro: false });
assert.ok(fora.includes('<button data-secao="principal" data-aba="docs">Docs</button>'), 'na moldura a aba não fica ligada e troca de seção');
assert.ok(fora.includes('<button data-secao="outra" class="is-on">Outra</button>'));
assert.ok(!menu([{ id: 'x', nome: 'X', badge: 0 }], { principal: 'p' }).includes('ct-badge'), 'contador zero some');
console.log('ok menu');

// Aba Docs: anexo já baixado (id no .origem.json) sai de "Encontrados no ticket"; lista vazia mostra o aviso.
const abaDocs = require('./componentes/aba-docs');
assert.deepStrictEqual(abaDocs.pendentes([{ id: '1' }, { id: '2' }], { 'a.pdf': { origem: 'jira', id: '1' } }).map((a) => a.id), ['2']);
assert.deepStrictEqual(abaDocs.pendentes(undefined, undefined), []);
assert.strictEqual(abaDocs._teste.kb(2 * 1048576), '2.0 MB');
assert.strictEqual(abaDocs._teste.kb(10), '1 KB');
const htmlDocs = abaDocs.corpo({ docs: [{ nome: 'a.pdf', full: '/x/a.pdf' }], origens: { 'a.pdf': { origem: 'jira', id: '1' } },
  jira: { anexos: [{ id: '1', nome: 'a.pdf' }, { id: '2', nome: 'b.png', tamanho: 2048 }, { id: '3', nome: 'c' }] }, baixando: new Set(['3']), dir: '/x' }, false);
assert.ok(htmlDocs.includes('data-acao="docAbrir" data-id="a.pdf"') && htmlDocs.includes('↓ Jira'));
assert.ok(htmlDocs.includes('data-acao="anexoTodos"') && htmlDocs.includes('data-acao="anexoBaixar" data-id="2"') && !htmlDocs.includes('data-id="1" '));
assert.ok(htmlDocs.includes('<span class="sigla">ARQ</span>') && htmlDocs.includes('Baixando…'));
assert.ok(abaDocs.corpo({ docs: [], origens: {}, baixando: new Set(), dir: null }, true).includes('Nenhuma conversa do Claude aberta ainda.'));
console.log('ok aba docs');

// Vinculados: filtro de status por módulo (sem acento/caixa, nomes alternativos), texto do vazio e itens fora da lista/ocultos.
const vinc = require('./componentes/vinculados');
const its = ['Em andamento', 'In progress', 'Não iniciado', 'Done', ''].map((status, i) => ({ key: `W-${i}`, status }));
assert.deepStrictEqual(vinc.filtrar(its, ['Buffer', 'Não iniciado', 'Em andamento|In progress']).map((i) => i.key), ['W-0', 'W-1', 'W-2']);
assert.strictEqual(vinc.filtrar(its, undefined).length, 5, 'sem status no módulo: todos');
assert.deepStrictEqual(vinc.filtrar([{ status: 'Pronto p/ QA' }], ['Pronto para QA|Pronto p/ QA']).length, 1);
assert.strictEqual(vinc._teste.emStatus(['A|a', 'B', 'C']), ' em A, B ou C');
const caixa = vinc.caixa({ itens: [{ key: 'W-1', resumo: 'x', status: 'Done' }, { key: 'W-2' }, { key: 'W-3' }], ocultos: ['W-3'] }, [{ chave: 'W-1' }], { titulo: 'T', status: ['Buffer'] });
assert.ok(caixa.includes('data-id="W-2"') && !caixa.includes('data-id="W-1"') && !caixa.includes('data-id="W-3"') && caixa.includes('1 removido'));
assert.ok(vinc.caixa({ itens: [] }, [], { titulo: 'T', status: ['Buffer'] }).includes('vinculado a você em Buffer'));
assert.ok(vinc.caixa({ itens: [], label: '' }, [], { titulo: 'T', seletor: 'label' }).includes('Escolha a label'));
console.log('ok vinculados');

// Lista de tickets: barra sempre presente (mesmo vazia), Sem ticket por último, pills e conversas no card.
const lista = require('./componentes/lista-tickets');
const vazia = lista.corpo([], {}, { modo: 'qa', vinculados: { titulo: 'T' } });
assert.ok(vazia.includes('id="filtroT"') && vazia.includes('id="ordemT"') && vazia.includes('data-acao="novo"') && vazia.includes('Nenhum ticket ainda'));
assert.ok(vazia.includes('class="rotulo is-on" data-acao="listaModo" data-id="qa"'));
const cheia = lista.corpo([{ chave: 'W-1', titulo: 'Oi', status: 'Em andamento', conversas: [1], refinando: true }], {}, { modo: 'tickets', vinculados: { titulo: 'T' } });
assert.ok(cheia.includes('1 conversa<') && cheia.includes('st-andando') && cheia.includes('● refinando') && cheia.indexOf('data-id="W-1"') < cheia.indexOf('class="sem-ticket"'));
console.log('ok lista');

// Botão, card de comando e Configurações: variante vira classe, o clique vai por data-*, o escape vale, o menu das Configurações usa cfgAba.
const { botao, mini } = require('./componentes/botao');
const b = botao('X', { variante: 'contorno', perigo: true, acao: 'matar', id: 'a"b', dados: { pid: 7 }, desligado: true });
assert.ok(b.startsWith('<button class="bt bt-contorno bt-perigo" data-acao="matar" data-id="a&#34;b" data-pid="7"') && b.includes(' disabled>'));
assert.ok(!botao('X').includes('data-') && mini('x') === '<span class="bt-mini">x</span>');
const { comando, procs } = require('./componentes/card-comando');
const cmd = { id: 'i1', nome: 'Metro <x>', comando: 'yarn start', pasta: '/a/b' };
assert.ok(comando(cmd, false).includes('data-acao="rodar"') && comando(cmd, true).includes('class="bt bt-parar"') && comando(cmd, true).includes('rodando'));
assert.ok(comando(cmd, true, [{ pid: 1, args: 'node' }]).includes('Matar todos (1)') && procs([], 'i1').includes('Nenhum processo'));
assert.ok(!comando(cmd, false).includes('<x>') && !comando(cmd, false).includes('class="procs"'));
const cfg = require('./configuracao');
const val = { modelo: '', esforco: '', jiraSite: 's', jiraProjeto: 'WMS', jiraBoard: 'B', etapasExtras: [], specsDir: '/x', specsRemoto: '', repositorios: [], bancoConexao: '', bancoAmbiente: '', bancoSqlcl: '', bancoSensiveis: [] };
const base = { valores: val, estado: { jira: { ok: false, curto: 'sem token', texto: 'falhou' } }, reposAuto: [{ caminho: '/r/api', camada: 'backend' }], voltar: '<i></i>', versao: '1' };
const geral = cfg.tela({ ...base, aba: 'geral' });
assert.ok(geral.includes('data-acao="cfgAba" data-id="plugins"') && geral.includes('data-id="cfgTestar"') === false && geral.includes('data-acao="cfgTestar" data-id="jira"'));
assert.ok(geral.includes('⚠ sem token') && geral.includes('testando…') && geral.includes('Atualizar agora') && geral.includes('✅ em dia'));
assert.ok(!geral.includes('data-acao="cfgRepoEditar"') && geral.includes('Detectados automaticamente')); // lista automática não edita
assert.ok(cfg.tela({ ...base, aba: 'plugins', plugins: [{ id: 'p@m', uso: 'u', skills: [], instalado: true, versao: '1', ligado: true }] }).includes('data-acao="pluginAlternar" data-id="p@m"'));
console.log('ok botao/cards/configuracao');
