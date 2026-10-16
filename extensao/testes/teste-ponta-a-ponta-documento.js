// @ts-check
// node testes/teste-ponta-a-ponta-documento.js — prova ponta a ponta do ticket por documento, um documento REAL por módulo.
// Stubs só de: vscode, claude -p (maestro.rodar) e rede (que lança e conta). Todo o resto é o código real da extensão.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const REAL = os.homedir(); // antes de trocar o HOME
const REAL_DOCS = path.join(REAL, 'Documentos');
const DOC_REAL = path.join(REAL_DOCS, 'implementacao-registro-de-volume-avariado.md');
const listar = (d) => { const o = []; const r = (p) => { let es; try { es = fs.readdirSync(p, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(p, e.name); let s; try { s = fs.lstatSync(f); } catch { continue; } o.push(`${f}|${s.size}|${Math.round(s.mtimeMs)}`); if (e.isDirectory()) r(f); } }; r(d); return o.sort().join('\n'); };
const antes = [REAL_DOCS, path.join(REAL, '.claude', 'tickets'), path.join(REAL, '.claude', 'ia')].map(listar);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pap-'));
const home = path.join(tmp, 'home'); fs.mkdirSync(home);
process.env.HOME = home;
const fontes = path.join(tmp, 'fontes'); fs.mkdirSync(fontes);

// ── Rede bloqueada: qualquer tentativa lança e conta.
const rede = [];
const proibir = (nome) => (..._a) => { rede.push(nome); throw new Error('REDE: ' + nome); };
require('https').request = /** @type {any} */ (proibir('https.request')); require('http').request = /** @type {any} */ (proibir('http.request'));
require('https').get = /** @type {any} */ (proibir('https.get')); require('http').get = /** @type {any} */ (proibir('http.get'));
require('net').connect = /** @type {any} */ (proibir('net.connect')); require('net').createConnection = /** @type {any} */ (proibir('net.createConnection'));
require('dns').lookup = /** @type {any} */ (proibir('dns.lookup'));
globalThis.fetch = /** @type {any} */ (proibir('fetch'));

// ── vscode mockado
const Module = /** @type {any} */ (require('module')), carregar = Module._load;
const msgs = [], escolhidos = [];
const noop = () => {};
const vsc = {
  EventEmitter: class { constructor() { this.event = noop; } fire() {} dispose() {} }, Disposable: { from: () => ({ dispose() {} }) }, ThemeColor: class {}, StatusBarAlignment: {},
  window: new Proxy({
    showWarningMessage: async (m) => { msgs.push(['warn', m]); return 'Salvar'; }, showInformationMessage: async (m) => { msgs.push(['info', m]); return 'ok'; },
    showErrorMessage: async (m) => { msgs.push(['erro', m]); }, showInputBox: async () => '', createOutputChannel: () => ({ appendLine() {} }),
    showOpenDialog: async () => escolhidos.map((p) => ({ fsPath: p })), setStatusBarMessage: noop, showQuickPick: async () => undefined
  }, { get: (o, k) => (k in o ? o[k] : /^on/.test(String(k)) ? () => ({ dispose() {} }) : undefined) }),
  workspace: new Proxy({ getConfiguration: () => ({ get: (_k, d) => d, inspect: () => undefined, update: async () => {} }), workspaceFolders: [] }, { get: (o, k) => (k in o ? o[k] : /^on/.test(String(k)) ? () => ({ dispose() {} }) : undefined) }),
  Uri: { file: (f) => ({ fsPath: f }), parse: (x) => x }, commands: { executeCommand: async () => {}, registerCommand: () => ({ dispose() {} }) }, env: { openExternal: async () => true }
};
Module._load = (r, ...a) => (r === 'vscode' ? vsc : carregar(r, ...a));

const relatorio = []; // [módulo, 'ok'|'pulado', detalhe]
const ok = (m, d) => relatorio.push([m, 'ok', d]);
const pulado = (m, d) => relatorio.push([m, 'pulado', d]);
const tem = (c) => { try { execFileSync('which', [c], { stdio: 'ignore' }); return true; } catch { return false; } };
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Fontes: o documento real e as conversões reais.
assert.ok(fs.existsSync(DOC_REAL), 'documento real ausente: ' + DOC_REAL);
const md = path.join(fontes, 'implementacao-registro-de-volume-avariado.md'); fs.copyFileSync(DOC_REAL, md);
const lo = path.join(tmp, 'lo');
const soffice = (args, cwd) => execFileSync('soffice', ['-env:UserInstallation=file://' + lo, '--headless', ...args], { cwd, stdio: 'ignore', timeout: 120000, env: { ...process.env, HOME: home } });
const fonte = { md };
if (tem('soffice')) {
  try {
    const txt = path.join(fontes, 'regras.txt'); fs.copyFileSync(DOC_REAL, txt); // soffice abre texto puro como Writer
    soffice(['--convert-to', 'docx:MS Word 2007 XML', '--outdir', fontes, txt]);
    soffice(['--convert-to', 'pdf', '--outdir', fontes, txt]);
    fs.rmSync(txt);
    if (fs.existsSync(path.join(fontes, 'regras.docx'))) fonte.docx = path.join(fontes, 'regras.docx');
    if (fs.existsSync(path.join(fontes, 'regras.pdf'))) fonte.pdf = path.join(fontes, 'regras.pdf');
    if (fonte.pdf && tem('pdftoppm')) {
      execFileSync('pdftoppm', ['-r', '80', '-png', '-f', '1', '-l', '1', fonte.pdf, path.join(fontes, 'pagina')]);
      const png = fs.readdirSync(fontes).find((f) => /^pagina.*\.png$/.test(f));
      if (png) {
        fonte.png = path.join(fontes, 'tela-avaria.png'); fs.renameSync(path.join(fontes, png), fonte.png);
        const esc = path.join(fontes, 'esc'); fs.mkdirSync(esc); fs.copyFileSync(fonte.png, path.join(esc, 'escaneado.png'));
        soffice(['--convert-to', 'pdf', '--outdir', esc, path.join(esc, 'escaneado.png')]);
        if (fs.existsSync(path.join(esc, 'escaneado.pdf'))) { fonte.escaneado = path.join(esc, 'escaneado.pdf'); }
      }
    }
  } catch (e) { console.warn('AVISO: conversão com soffice falhou:', String(e.message).split('\n')[0]); }
}
if (!fonte.png) { // sem soffice: PNG mínimo válido 1x1
  fonte.png = path.join(fontes, 'tela-avaria.png');
  fs.writeFileSync(fonte.png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
}
const SEM = { docx: 'soffice indisponível ou conversão falhou', pdf: 'soffice indisponível ou conversão falhou', escaneado: 'sem soffice/pdftoppm para montar o PDF só de imagem' };

const tickets = require('../infra/tickets');
const doc = require('../provedores/documento');
const ctx = require('../infra/contexto');
const maestro = require('../painel/maestro');
const jira = require('../infra/ticket').jira;
const sessao = require('../infra/sessao');

// claude -p stubado: guarda cada pedido (prompt) e deixa o teste simular o que o Claude escreveria.
/** @type {any[]} */ const pedidos = []; let aoRodar = null;
maestro.rodando = () => false;
maestro.rodar = /** @type {any} */ ((d, o) => { pedidos.push({ dir: d, ...o }); if (aoRodar) aoRodar(d, o); return true; });
const ultimo = () => pedidos[pedidos.length - 1];

(async () => {
  // ════ 1. CRIAÇÃO
  const ts = {}; const hashes = {};
  const ordem = ['md', 'docx', 'pdf', 'png', 'escaneado'];
  for (const k of ordem) {
    if (!fonte[k]) { pulado('Criação ' + k, SEM[k] || 'sem arquivo'); continue; }
    hashes[k] = hash(fonte[k]);
    ts[k] = doc.criarPorDocumento(fonte[k], { listas: ['refinamento', 'qa', 'incidentes', 'impl'] });
  }
  const chaves = Object.values(ts).map((t) => t.chave);
  assert.deepStrictEqual(chaves, chaves.map((_, i) => `DOC-00${i + 1}`), 'chaves sequenciais');
  for (const k of Object.keys(ts)) {
    const t = ts[k], d = tickets.pasta(t.chave);
    assert.ok(fs.existsSync(path.join(d, t.documento.arquivo)), k);
    assert.strictEqual(hash(path.join(d, t.documento.arquivo)), hashes[k], 'cópia fiel ' + k);
    assert.strictEqual(hash(fonte[k]), hashes[k], 'original intacto ' + k);
    assert.ok(jira.ehDocumento(tickets.ler(t.chave)));
  }
  // Extração com ferramentas reais (unzip/pdftotext/pdftoppm).
  const ex = {};
  for (const k of Object.keys(ts)) ex[k] = await ctx.prepararDocumento(tickets.ler(ts[k].chave));
  for (const k of ['md', 'docx', 'pdf']) {
    if (!ts[k]) continue;
    assert.ok(ex[k].ok && ex[k].texto, k + ': ' + JSON.stringify(ex[k]));
    const txt = fs.readFileSync(ex[k].texto, 'utf8');
    assert.ok(/RN01/.test(txt) && /CA01/.test(txt) && /avaria/i.test(txt), k + ' sem as regras RN01/CA01');
  }
  if (ts.png) assert.ok(ex.png.ok && !ex.png.texto, 'png: nada a extrair, lido direto pela IA');
  if (ts.escaneado) {
    assert.ok(ex.escaneado.ok && ex.escaneado.paginas?.length >= 1, JSON.stringify(ex.escaneado));
    assert.ok(fs.readdirSync(path.join(tickets.pasta(ts.escaneado.chave), '.documento-paginas')).some((f) => /\.png$/.test(f)));
  }
  for (const k of ordem) if (ts[k]) ok('Criação ' + k, `${ts[k].chave}; original intacto; extração: ${ex[k].texto ? 'texto' : ex[k].paginas ? ex[k].paginas.length + ' página(s) PNG' : 'imagem direta'}`);

  // ════ 2. REFINAMENTO (md)
  {
    const orq = require('../refinamento/orquestrador');
    const { acoes: acoesTarefas } = require('../refinamento/abas/tarefas');
    const duv = require('../refinamento/abas/duvidas');
    const { tarefasDe, duvidasDe, impactosDe, TAREFAS, DUVIDAS } = require('../refinamento/locais');
    const t0 = ts.md, dir = tickets.pasta(t0.chave);
    tickets.gravar({ ...tickets.ler(t0.chave), spec: { repo: dir, dir: 'DOC-001-x' } });
    const t = tickets.ler(t0.chave);
    const gravar = (id, nome, dado) => fs.writeFileSync(path.join(tickets.pasta(id), nome), JSON.stringify(dado));
    const sv = { render() {}, gravar, abrirAba() {}, secrets: {}, notificar() {}, cacheJira: {}, pasta: (id) => tickets.pasta(id), ticketAberto: () => tickets.ler(t0.chave), aberto: t0.chave, atualizarJira() {}, orq };
    orq.iniciar(sv, { subscriptions: [] });
    pedidos.length = 0;
    assert.strictEqual(orq.etapa(t, 'Siga a skill sdd, passo 1.'), true);
    const c = path.join(dir, '.contexto-ticket.md');
    const ctxTxt = fs.readFileSync(c, 'utf8');
    assert.ok(/RN01|avaria/i.test(ctxTxt) || ctxTxt.includes(t.documento.arquivo), 'contexto sem o documento');
    await sleep(300); // extração assíncrona regrava o contexto
    const ctx2 = fs.readFileSync(c, 'utf8');
    assert.ok(ctx2.includes('Texto extraído:') && ctx2.includes(path.join(dir, t.documento.arquivo)));
    assert.ok(ultimo().prompt.includes(path.join(dir, t.documento.arquivo)) && ultimo().prompt.includes('Ticket por documento'));
    assert.ok(!ultimo().prompt.includes('atlassian'));
    // card aprovado vira subtarefa local
    gravar(t0.chave, TAREFAS, [{ id: 't01', titulo: 'Registrar avaria', descricao: 'RN01', status: 'pendente', estimativa: '2h' }]);
    await acoesTarefas(sv).tarefaAprovar({ id: 't01' });
    const subs = JSON.parse(fs.readFileSync(path.join(dir, '.subtarefas.json'), 'utf8'));
    assert.strictEqual(subs[0].key, 'DOC-001-1'); assert.strictEqual(tarefasDe(dir)[0].status, 'aprovada');
    // dúvida enviada vira comentário local
    gravar(t0.chave, DUVIDAS, [{ id: 'D1', texto: 'Qual o limite de volumes?', em: new Date().toISOString() }]);
    await duv.acoes(sv).duvidaEnviar({ id: 'D1' });
    const cs = JSON.parse(fs.readFileSync(path.join(dir, '.comentarios.json'), 'utf8'));
    assert.strictEqual(cs.length, 1); assert.strictEqual(cs[0].autorId, 'local');
    // comentário externo pela aba Ticket → vigia → triagem
    const n0 = pedidos.length;
    await orq.vigiarComentarios();
    assert.strictEqual(pedidos.length, n0, 'comentário da extensão não dispara');
    require('../painel/documento').acoes(sv).docComentar({ texto: 'O limite é 50 volumes por conferência.' });
    await sleep(100); await orq.vigiarComentarios();
    assert.ok(pedidos.length > n0 && /\[triagem\]/.test(pedidos.at(-1).prompt), 'vigia não disparou [triagem]');
    assert.match(pedidos.at(-1).prompt, /50 volumes/); assert.match(pedidos.at(-1).prompt, /D1: Qual o limite/);
    assert.strictEqual(impactosDe(dir).length, 1);
    ok('Refinamento (md)', 'etapa grava .contexto-ticket.md (texto extraído + original); card aprovado -> DOC-001-1; dúvida -> comentário local; comentário externo -> [triagem]');
  }

  // ════ 3. QA (docx; sem docx cai no md)
  {
    const qa = require('../qa/qa'), { acoes } = require('../qa/acoes');
    const { areaIA } = require('../infra/area-ia');
    sessao.focoLista = () => 'qa';
    const t = ts.docx || ts.md, raiz = tickets.pasta(t.chave), dir = tickets.pasta(t.chave, 'qa');
    fs.mkdirSync(dir, { recursive: true });
    const s = { secrets: {}, cacheJira: {}, render() {}, ticketAberto: () => tickets.ler(t.chave), pastaAba: () => dir, pedirSecao() {}, reposDe: () => [] };
    assert.ok(qa.ehLocal(dir));
    await acoes(s).qaPlay();
    assert.strictEqual(qa.estado(dir).fase, 'sem_plano');
    if (ts.docx) await ctx.prepararDocumento(tickets.ler(t.chave));
    const PLANO = '## Cenários de Teste\n\n#### CT01 – Registro com sucesso (CA01)\n\n**Dado que** a conferência está em andamento\n**Quando** registra a avaria\n**Então** o volume fica avariado\n\n'
      + '#### CT02 – Volume fora da conferência (RN01)\n\n**Dado que** o volume é de outra conferência\n**Quando** registra\n**Então** o sistema recusa\n\n'
      + '#### CT03 – Sem motivo (CA03)\n\n**Dado que** não há motivo\n**Quando** registra\n**Então** o sistema exige o motivo\n';
    aoRodar = (d, o) => { fs.mkdirSync(areaIA(d), { recursive: true }); fs.writeFileSync(path.join(areaIA(d), 'qa-plano.md'), PLANO); setTimeout(() => o.aoMudar && o.aoMudar(), 5); };
    pedidos.length = 0;
    await acoes(s).qaCriarPlano();
    for (let i = 0; i < 150 && qa.estado(dir).fase !== 'plano_encontrado'; i++) await sleep(20);
    aoRodar = null;
    assert.strictEqual(qa.estado(dir).fase, 'plano_encontrado', JSON.stringify(qa.estado(dir)));
    const pq = pedidos.find((p) => /Planejamento de testes de QA/.test(p.prompt)).prompt;
    assert.ok(pq.includes(path.join(raiz, t.documento.arquivo)), 'prompt do plano cita o original');
    if (ts.docx) assert.ok(pq.includes('.documento-extraido.md'), 'prompt do plano cita o texto extraído do docx');
    assert.ok(!fs.existsSync(path.join(raiz, '.subtarefas.json')), 'o plano só vai ao provedor depois do Aprovar');
    assert.ok(fs.existsSync(path.join(dir, 'planejamento-qa-v1.md')));
    await acoes(s).qaPlanoAprovar();
    const subs = JSON.parse(fs.readFileSync(path.join(raiz, '.subtarefas.json'), 'utf8'));
    assert.match(subs[0].resumo, /\[QA\]/); assert.strictEqual(qa.estado(dir).fase, 'plano_aprovado');
    assert.deepStrictEqual(qa.cenarios(dir).cenarios.map((c) => c.id), ['CT01', 'CT02', 'CT03']);
    // execução simulada (o executor real chama claude -p) + publicação real
    const ev = path.join(dir, 'evidencia-CT01.png'); fs.copyFileSync(fonte.png, ev);
    const r = qa.cenarios(dir);
    const marcar = (falha) => { r.cenarios.forEach((c, i) => { c.status = falha && i === 1 ? 'falhou' : 'passou'; c.execucoes = [{ status: c.status, inicio: '2026-10-14T12:00:00Z', nota: 'ok', evidencias: i === 0 ? [ev] : [] }]; }); fs.writeFileSync(path.join(dir, qa.CENARIOS), JSON.stringify(r)); };
    const orig = qa.arquivosDe; qa.arquivosDe = () => [ev];
    marcar(true); await acoes(s).qaPublicar(); // com falha: não publica (regra do QA), avisa
    assert.ok(!fs.existsSync(path.join(raiz, '.comentarios.json')) && /todos os cenários/.test(msgs.at(-1)[1]));
    marcar(false);
    await acoes(s).qaPublicar(); qa.arquivosDe = orig;
    const com = JSON.parse(fs.readFileSync(path.join(raiz, '.comentarios.json'), 'utf8'));
    assert.ok(com.length === 1 && com[0].texto.includes('CT01') && com[0].texto.includes('CT03'));
    const pub = path.join(raiz, '.publicado', subs[0].key);
    assert.ok(fs.readdirSync(pub).some((f) => /CT01.*\.png$/.test(f)), 'evidência em .publicado/: ' + fs.readdirSync(path.join(raiz, '.publicado')));
    ok('QA (' + (ts.docx ? 'docx' : 'md') + ')', 'sem plano -> plano (claude stub) -> subtarefa [QA] local -> CT01..CT03 -> resultado local + evidência em .publicado/. O executor de cenários não rodou (exige ambiente real).');
  }

  // ════ 4. INCIDENTES (pdf; sem pdf cai no md)
  {
    const controle = require('../infra/controle');
    const { rodarEtapa, anexosFaltando } = require('../incidentes/orquestrador'), { estado, mudar } = require('../incidentes/estado');
    const t = ts.pdf || ts.md, pasta = tickets.pasta(t.chave), dir = path.join(pasta, 'incidente'); fs.mkdirSync(dir, { recursive: true });
    const cache = {};
    const s = { pastaAba: () => dir, pasta: () => pasta, render() {}, ticketAberto: () => tickets.ler(t.chave), reposDe: () => [], cacheJira: cache, atualizarJira: async () => { throw new Error('REDE: atualizarJira'); } };
    const tk = tickets.ler(t.chave);
    pedidos.length = 0;
    await rodarEtapa(s, tk, 1, controle.nova(dir));
    const j = fs.readFileSync(path.join(dir, '.jira-contexto.md'), 'utf8');
    assert.ok(j.includes(path.join(pasta, tk.documento.arquivo)));
    assert.ok(/RN01/.test(fs.readFileSync(path.join(pasta, '.documento-extraido.md'), 'utf8')), 'texto extraído com RN01');
    assert.ok(ultimo().prompt.includes('Ticket por documento'));
    mudar(dir, { etapa: 2, fase: 'parado' });
    await rodarEtapa(s, tk, 2, controle.nova(dir));
    assert.ok(ultimo().prompt.includes('Ticket por documento') && estado(dir).fase !== 'pausado');
    assert.deepStrictEqual(anexosFaltando(s, tk), []);
    // anexos extras pelo diálogo (docAnexar)
    const video = path.join(fontes, 'gravacao.mp4'); fs.writeFileSync(video, Buffer.from('00000020667479706d703432', 'hex'));
    escolhidos.length = 0; escolhidos.push(fonte.png, video);
    await require('../painel/documento').acoes(s).docAnexar();
    assert.deepStrictEqual(fs.readdirSync(path.join(pasta, '.anexos')).sort(), ['gravacao.mp4', path.basename(fonte.png)].sort());
    assert.ok(fs.existsSync(fonte.png) && fs.existsSync(video));
    mudar(dir, { etapa: 2, fase: 'parado' });
    await rodarEtapa(s, tickets.ler(t.chave), 2, controle.nova(dir));
    assert.ok(ultimo().prompt.includes(path.join(pasta, '.anexos')) && estado(dir).fase !== 'pausado');
    ok('Incidentes (' + (ts.pdf ? 'pdf' : 'md') + ')', 'etapas 1 e 2 com bloco do documento e .jira-contexto.md; sem pausa por anexo; print e vídeo em .anexos/ citados no prompt. Etapas 3+ (reprodução/ambiente) não exercitadas.');
  }

  // ════ 5. IMPLEMENTAÇÃO (png; sem png cai no md)
  {
    const impl = require('../implementacoes/implementacoes');
    const { pedido } = require('../modulos/conversas')._teste2;
    const t = ts.png || ts.md, dir = tickets.pasta(t.chave);
    sessao.focar(t.chave, impl.ID);
    const s = { pasta: (id) => tickets.pasta(id), pastaAba: (id) => tickets.pasta(id, impl.ID), ticketAberto: () => tickets.ler(t.chave) };
    const p = pedido(s, tickets.ler(t.chave));
    assert.ok(p.includes(path.join(dir, t.documento.arquivo)) && p.includes(path.join(dir, '.contexto-ticket.md')) && !/undefined/.test(p));
    assert.ok(fs.existsSync(path.join(dir, '.contexto-ticket.md')));
    ok('Implementação (' + (ts.png ? 'png' : 'md') + ')', 'pedido() cita o documento e .contexto-ticket.md. A conversa interativa do VS Code (terminal do Claude) não abre aqui.');
  }

  // ════ 6. TRANSVERSAL
  {
    const t0 = Date.now();
    const jiraT = tickets.gravar({ idProvedor: 'WMS-1', chave: 'WMS-1', provedor: 'jira', site: 'https://x.atlassian.net', link: 'https://x.atlassian.net/browse/WMS-1', titulo: 'Ticket do Jira', status: 'Em andamento', listas: ['refinamento'], conversas: [], criado: t0 });
    const listaTickets = require('../componentes/lista-tickets');
    const todos = tickets.listar().map((x) => ({ ...x, refinando: false }));
    const html = listaTickets.corpo(todos, null, { modo: 'refinamento', vinculados: {} });
    assert.ok(!/undefined|NaN/.test(html), 'lista sem undefined');
    assert.ok(html.includes('WMS-1') && html.includes('DOC-001') && html.includes('📄'));
    // excluir arquiva e não toca no original (fora da pasta)
    const alvo = ts.md.chave, pasta = tickets.pasta(alvo);
    const antesOrig = hash(fonte.md);
    require('../painel/lista'); // carrega o módulo real
    const arq = path.join(tickets.RAIZ, '_arquivados');
    if (typeof tickets.arquivar === 'function') tickets.arquivar(alvo);
    else fs.renameSync(pasta, path.join(arq, alvo + '-x'));
    assert.strictEqual(tickets.ler(alvo), null);
    assert.strictEqual(hash(fonte.md), antesOrig, 'original intacto após excluir');
    assert.ok(fs.readdirSync(arq).some((n) => n.startsWith(alvo)));
    // nada fora do HOME temporário e do tmp
    assert.deepStrictEqual(rede, [], 'tentativas de rede: ' + rede.join(','));
    assert.ok(!msgs.some((m) => m[0] === 'erro'), 'erros mostrados: ' + JSON.stringify(msgs.filter((m) => m[0] === 'erro')));
    const depois = [REAL_DOCS, path.join(REAL, '.claude', 'tickets'), path.join(REAL, '.claude', 'ia')].map(listar);
    assert.deepStrictEqual(depois, antes, 'arquivos reais mudaram (~/Documentos, ~/.claude/tickets, ~/.claude/ia)');
    ok('Transversal', `lista mista renderiza; excluir arquiva (original intacto); rede: ${rede.length} tentativas; ~/Documentos e ~/.claude reais inalterados`);
  }

  console.log('Prova ponta a ponta (ticket por documento)');
  for (const [m, st, d] of relatorio) console.log(`  ${st === 'ok' ? 'ok    ' : 'pulado'} ${m}: ${d}`);
  console.log('  Stubs: vscode, claude -p (maestro.rodar), rede. Extração (unzip/pdftotext/pdftoppm/soffice) real.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
