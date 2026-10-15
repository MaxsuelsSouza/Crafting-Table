// @ts-check
// Etapa 5 do Mergulho (ambiente, massa de teste, emulador, captura) e fecho da etapa 6 (resumo.md). Contrato: incidentes/CONTRATO.md.
// Prova preservada: só INSERT em linhas novas (Massa de Teste); a trava recusa DML que cite chave da Massa Real.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../componentes/ao-vivo');
const controle = require('./controle');
const fluxo = require('./fluxo');
const maestro = require('../painel/maestro');
const banco = require('../plugins/mapa/lib/banco');

const MERG = '.mergulho.json', EVID = 'evidencias', CLAUDE_JSON = '.reproducao-claude.json';
// ~/.claude é bloqueada para Write/Edit no claude -p: os arquivos do incidente são gravados por mergulho-gravar.
const GRAVAR = path.join(__dirname, 'mergulho-gravar');
const FLUXO = path.join(__dirname, 'mergulho-fluxo');
// Ferramentas por prefixo (nada de Bash livre): só os bins do incidente, o banco por mapa-db (leitura), adb e maestro para o emulador e leitura de arquivos.
const FERRAMENTAS = (mapa = '', adb = 'adb') => ['Read', 'Glob', 'Grep', 'Skill', `Bash(${GRAVAR}:*)`, `Bash(${FLUXO}:*)`, ...(mapa ? [`Bash(${mapa}/bin/mapa-db:*)`] : []),
  'Bash(adb:*)', ...(adb !== 'adb' ? [`Bash(${adb}:*)`] : []), 'Bash(maestro:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(grep:*)'];
const ESCRITA = ` ESCRITA: Write/Edit são bloqueados na pasta do incidente; grave por ${GRAVAR} NOME <<'FIM' … FIM (só o nome do arquivo, texto pela entrada padrão) ou ${GRAVAR} evidencias/NOME.png --de /tmp/arquivo.png.`;
const REGRAS = 'Modo não interativo: não pergunte, registre e siga. Proibido: INSERT/UPDATE/DELETE/DDL no banco, alterar qualquer registro da Massa Real, '
  + 'publicar na ferramenta de tickets, commit, push, merge e rebase. Consultas ao banco só de leitura, por mapa-db. Não invente: o que não consta nas fontes vira "não identificado".' + ESCRITA;

const TENTAR = 'Tentar de novo', ACEITAR = 'Aceitar como não reproduzido';
const lerTxt = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const lerJson = (f, pad) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return pad; } };

// Mescla em .mergulho.json sem apagar campos do Agente A.
function mudar(dir, parte) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MERG), JSON.stringify({ ...lerJson(path.join(dir, MERG), {}), ...parte, ...(parte.fase === 'rodando' ? { host: process.pid } : {}), atualizado: new Date().toISOString() }, null, 2));
}

// ── Trava de prova: chaves da Massa Real = números de 4+ dígitos e códigos (strings com dígito, 4+ chars) do massa-real.sql.
// ponytail: heurística por literal; chave curta (id de 1 a 3 dígitos) escapa. Troque por parse das colunas-chave se virar problema.
const chavesReais = (sql) => {
  const k = new Set(), semCom = String(sql).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
  const resto = semCom.replace(/'((?:[^']|'')*)'/g, (_, v) => { if (v.length >= 4 && /\d/.test(v)) k.add(v.toLowerCase()); return ' '; });
  for (const m of resto.matchAll(/\b\d{4,}\b/g)) k.add(m[0]);
  return k;
};
const citaChave = (stmt, chaves) => {
  const t = stmt.toLowerCase();
  return [...chaves].find((c) => (/^\d+$/.test(c) ? new RegExp(`(^|[^\\d.])${c}([^\\d]|$)`).test(t) : t.includes(`'${c}'`)));
};
// Devolve { ok, erro? }. Só INSERT/UPDATE/DELETE; nenhum pode citar chave real; DDL, MERGE e PL/SQL recusados.
function travaDml(sqlTeste, sqlReal) {
  const chaves = chavesReais(sqlReal), stmts = banco.dividir(sqlTeste);
  if (!stmts.length) return { ok: false, erro: 'massa-teste.sql vazio' };
  for (const s of stmts) {
    const verbo = s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').trim().match(/^\w+/)?.[0]?.toLowerCase();
    if (!['insert', 'update', 'delete'].includes(verbo)) return { ok: false, erro: `comando "${verbo}" não é permitido na Massa de Teste (só INSERT/UPDATE/DELETE em linhas novas)` };
    if (verbo !== 'insert' && !/\bwhere\b/i.test(s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').replace(/'(?:[^']|'')*'/g, "''"))) return { ok: false, erro: `${verbo.toUpperCase()} sem WHERE mexeria em linhas que não são suas: ${s.slice(0, 80)}` };
    const c = citaChave(s, chaves);
    if (c) return { ok: false, erro: `o comando mexe na chave ${c} da Massa Real (prova preservada): ${s.slice(0, 80)}` };
  }
  return { ok: true };
}

// ── Comandos das Configurações: papel pelo nome do botão (vale mais) ou pelo comando.
const PAPEIS = {
  api: { nome: 'API', porta: 5111, espera: 240, nomeRe: /\bapi\b|backend/i, cmdRe: /dotnet\s+(run|watch)|5111/i },
  metro: { nome: 'Metro', porta: 8081, espera: 120, nomeRe: /\bmetro\b|bundler/i, cmdRe: /react-native\s+start|\bmetro\b|8081/i },
  start: { nome: 'Start', espera: 600, nomeRe: /\bstart\b|\bandroid\b|\bapp\b/i, cmdRe: /(yarn|npm)\s+(run\s+)?(android|start)|run-android/i }
};
const acharComando = (lista, p) => lista.map((b) => [b, (p.nomeRe.test(b.nome) ? 2 : 0) + (p.cmdRe.test(b.comando || '') ? 1 : 0)])
  .filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1])[0]?.[0] || null;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperarPadrao(teste, segundos) {
  for (const fim = Date.now() + segundos * 1000; Date.now() < fim; await dormir(3000)) if (await teste()) return true;
  return teste();
}

// Dependências reais (VS Code). Os testes injetam as suas; qualquer chave passada por `d` vence.
function depsPadrao(s, t, dir) {
  const vscode = require('vscode'), { cfg } = require('../configuracao/configuracao'), emu = require('../modulos/emulador');
  const { execFileSync } = require('child_process'), adb = path.join(emu.SDK, 'platform-tools', 'adb');
  const adbOut = (a) => { try { return execFileSync(adb, a, { timeout: 15000 }).toString(); } catch { return ''; } };
  const cmds = () => require('../modulos/comandos').api;
  return {
    comandos: { lista: () => cmds()?.lista() || [], rodar: (nome) => { const b = cmds()?.lista().find((x) => x.nome === nome); if (b && !b.rodando) cmds().alternar({ id: b.id }); } },
    emulador: { aparelhos: () => emu.dispositivos(), ligar: () => emu.ligar(cfg().get('avdPadrao')), pronto: () => adbOut(['shell', 'getprop', 'sys.boot_completed']).trim() === '1' },
    portaAberta: (n) => new Promise((ok) => { const sk = require('net').connect(n, '127.0.0.1'); const fim = (v) => { sk.destroy(); ok(v); }; sk.setTimeout(1500); sk.on('connect', () => fim(true)); sk.on('error', () => fim(false)); sk.on('timeout', () => fim(false)); }),
    // Metro de pé = /status responde packager-status:running (porta aberta sozinha não prova).
    metroStatus: async () => { try { return (await (await fetch('http://127.0.0.1:8081/status')).text()).includes('packager-status:running'); } catch { return false; } },
    appInstalado: () => /package:br\.com\.ferreiracosta\.wms/.test(adbOut(['shell', 'pm', 'list', 'packages'])),
    esperar: esperarPadrao,
    banco: { conexao: cfg().get('bancoConexao') || '', ambiente: cfg().get('bancoAmbiente') || '', sqlcl: cfg().get('bancoSqlcl') },
    executarSql: async (sql) => {
      const b = cfg(), conexao = String(b.get('bancoConexao') || '').replace(/[^\w .-]/g, ''), sqlcl = banco.acharSqlcl(b.get('bancoSqlcl'));
      if (!conexao || !sqlcl) return { ok: false, saida: 'banco não configurado (Configurações → Banco de dados)' };
      const r = await banco.rodarSqlcl(sqlcl, [`connect -name ${conexao}`, 'set feedback on', 'whenever sqlerror exit failure rollback', sql.trim().replace(/;*\s*$/, ';'), 'commit;', 'exit', ''].join('\n'), 120000);
      const saida = `${r.out}\n${r.erro || ''}`.trim();
      return { ok: !r.estourou && !/ORA-\d|SP2-\d/.test(saida), saida };
    },
    claude: (opts) => new Promise((ok) => {
      const mapa = vagas.raiz('incidentes.mapa') || '';
      const extras = ['--settings', JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }), '--add-dir', dir, ...(cfg().get('modelo') ? ['--model', cfg().get('modelo')] : [])];
      const foi = maestro.rodar(dir, { ferramentas: FERRAMENTAS(mapa, adb), extras: [...extras, ...vagas.pluginDirs('incidentes.mapa')], ...opts,
        env: { MERGULHO_DIR: dir, MAPA_DB_CONEXAO: cfg().get('bancoConexao') || '', MAPA_DB_AMBIENTE: cfg().get('bancoAmbiente') || '', MAPA_DB_SQLCL: cfg().get('bancoSqlcl') || '',
          MAPA_DB_SENSIVEIS: (cfg().get('bancoColunasSensiveis') || []).join(','), MAPA_DB_LOG: path.join(dir, '.mapa-db.jsonl'), ...(opts.env || {}) }, aoMudar: () => { s.render?.(); if (!maestro.rodando(dir)) ok(true); } });
      if (!foi) ok(false);
    }),
    gravarTela: (destino) => { if (emu.emuladorRodando()) require('../modulos/evidencias').gravar?.({ destino, chave: t.chave, continuo: true }); },
    pararTela: () => require('../modulos/evidencias').pararGravacao?.(),
    adb
  };
}

// ── Prompts
// Skill da reprodução (Configurações > Plugins, agentes/etapas.js; padrão: ~/.claude/skills/testes-funcionais).
const vagas = require('../agentes/etapas');
const SKILL = () => vagas.pastaSkill('incidentes.reproducao') || '';
const lista = (dir) => ['1-triagem.md', '2-artefatos.md', '3-dados-logs.md', '4-diagnostico.md'].map((f) => path.join(dir, f)).join(', ');
const promptMassa = (chave, dir) => `[segundo plano · Crafting Table · Incidente ${chave}] Prepare a MASSA DE TESTE do incidente. ${fs.existsSync(path.join(dir, '.respostas.md')) ? `Aplique também os pedidos do usuário em ${path.join(dir, '.respostas.md')} (a última entrada vale). ` : ''}Leia ${lista(dir)}, ${path.join(dir, 'fluxo.json')} (o fluxo já planejado: a massa tem de dar ao fluxo tudo o que ele precisa em cada passo) e ${path.join(dir, 'massa-real.sql')} (a Massa Real: prova, intocável). `
  + `Consulte a cópia de produção (só leitura, por mapa-db; skill testes-funcionais: ${SKILL()}/SKILL.md) e escreva em ${path.join(dir, 'massa-teste.sql')} os comandos INSERT que criam registros NOVOS e DISTINTOS `
  + '(ids e códigos diferentes dos reais, copiando a estrutura) deixando o banco no estado ANTERIOR ao erro, pronto para repetir a ação do diagnóstico. '
  + `Um comando por instrução, terminado em ";". NÃO execute o arquivo: a extensão confere e executa. ${REGRAS}${vagas.aviso('incidentes.reproducao')}`;
const promptPlano = (chave, dir) => `[segundo plano · Crafting Table · Incidente ${chave}] Monte o FLUXO da reprodução: todos os passos que serão necessários para replicar NO EMULADOR a ação do diagnóstico com a Massa de Teste. `
  + `Leia ${lista(dir)} e ${path.join(dir, 'massa-real.sql')} (a massa de teste ainda NÃO existe: ela será montada depois, a partir deste fluxo), e a documentação do app (skill testes-funcionais: ${SKILL()}/SKILL.md e references/jornada-mobile-maestro.md; código do mobile). `
  + 'Do estado do app recém-aberto até o resultado a verificar: login/seleção de usuário, navegação até o módulo e a tela, escolha do registro (descreva o registro de que o passo precisa, sem ids: a Massa de Teste é montada depois), a ação do incidente e a conferência do erro. De 5 a 12 passos curtos e verificáveis; cada um com "titulo" e "texto" (o que fazer e o que esperar ver). '
  + `Registre com: ${FLUXO} plano <<'FIM' [{"titulo":"...","texto":"..."}, ...] FIM . NÃO execute nada no emulador agora: só o plano. ${REGRAS}${vagas.aviso('incidentes.reproducao')}`;
const promptReproduzir = (chave, dir) => `[segundo plano · Crafting Table · Incidente ${chave}] Ambiente pronto (API 5111, Metro 8081, emulador e app). Leia ${path.join(dir, '4-diagnostico.md')} e ${path.join(dir, 'massa-teste.sql')}. `
  + `Reproduza NO EMULADOR a ação exata do diagnóstico usando SÓ a Massa de Teste (jornada pelo Maestro/adb, skill testes-funcionais: ${SKILL()}/references/jornada-mobile-maestro.md). A tela já está sendo gravada em vídeo pela extensão. `
  + `O FLUXO já está planejado e o andamento é registrado por ${FLUXO} (estado atual abaixo). Para cada passo, na ordem: ${FLUXO} iniciar Pnn; execute; registre a ação EXATA que repete o passo (comando maestro/adb) com ${FLUXO} acao Pnn "<comando>"; `
  + `tire um print (adb exec-out screencap -p > /tmp/mergulho-Pnn.png) e guarde com ${FLUXO} evidencia Pnn /tmp/mergulho-Pnn.png; feche com ${FLUXO} concluir Pnn passou|falhou|bloqueado --nota "o que viu". `
  + 'RETOMADA: passos já "passou" são REFEITOS RÁPIDO só para levar o app ao ponto onde parou: rode a "ação" registrada de cada um em sequência, sem reanalisar, sem novo print e sem novo iniciar/concluir; confira apenas que a tela esperada apareceu e siga do primeiro passo pendente. '
  + `Estado do fluxo:\n${fluxo.estadoParaPrompt(dir)}\n`
  + `Ao final salve também um print do resultado: ${GRAVAR} evidencias/NN-resultado.png --de /tmp/resultado.png. Grave ${path.join(dir, CLAUDE_JSON)} (com ${GRAVAR} ${CLAUDE_JSON}): {"ok": true se o erro do diagnóstico se repetiu (ou false), "acao": "o que foi feito e o que apareceu", "prints": [{"arquivo": "NN-resultado.png", "legenda": "..."}]}. ${REGRAS}${vagas.aviso('incidentes.reproducao')}`;
const promptResumo = (chave, dir) => `[segundo plano · Crafting Table · Incidente ${chave}] Escreva em ${path.join(dir, 'resumo.md')} o Resumo Analítico do incidente, em português, texto corrido e objetivo para o PO. `
  + `Leia ${lista(dir)}, ${path.join(dir, 'reproducao.json')} e as observações do PO em ${path.join(dir, MERG)} (campo obsPO). Consolide: descrição do ticket, etapa do fluxo onde falhou, a tentativa do usuário, o que os logs mostram, os comentários/observações do PO e o resultado da reprodução no emulador. `
  + 'Adapte ao caso (ex.: "Após analisar as evidências e os logs, identificamos que em [data] às [hora], ao tentar [ação] no registro [ID], a etapa [etapa] do fluxo [fluxo] falhou porque…"), sem formulário fixo. Não invente: o que não consta nos arquivos vira "não identificado". '
  + `${REGRAS}`;

// Resumo mínimo, se o Claude não gravar o resumo.md.
const resumoBasico = (dir, t) => {
  const r = lerJson(path.join(dir, 'reproducao.json'), {}), diag = lerTxt(path.join(dir, '4-diagnostico.md')).trim(), tri = lerTxt(path.join(dir, '1-triagem.md')).trim();
  return `# Resumo analítico · ${t.chave}\n\n${tri ? `${tri}\n\n` : ''}${diag ? `## Diagnóstico\n\n${diag}\n\n` : ''}## Reprodução no emulador\n\n${r.ok ? 'O problema foi reproduzido.' : 'O problema não foi reproduzido.'} ${r.acao || ''}\n`;
};

// reproducao.json: midias montadas de evidencias/ (png = print, mp4/webm/gif = vídeo) + o que o Claude registrou.
function gravarReproducao(dir, ok, acao) {
  const c = lerJson(path.join(dir, CLAUDE_JSON), null), leg = new Map((c?.prints || []).map((p) => [p.arquivo, p.legenda]));
  let arqs = []; try { arqs = fs.readdirSync(path.join(dir, EVID)).sort(); } catch {}
  const midias = arqs.flatMap((a) => /\.png$/i.test(a) ? [{ tipo: 'print', arquivo: `${EVID}/${a}`, legenda: leg.get(a) || a.replace(/\.png$/i, '') }]
    : /\.(mp4|webm|gif)$/i.test(a) ? [{ tipo: 'video', arquivo: `${EVID}/${a}`, legenda: 'Gravação da tela do emulador' }] : []);
  const j = { ok: !!(c ? c.ok : ok), acao: c?.acao || acao || '', quando: c ? new Date().toISOString() : null, midias };
  fs.writeFileSync(path.join(dir, 'reproducao.json'), JSON.stringify(j, null, 2));
  return j;
}

// ── Subetapas da etapa 5, na ordem em que rodam. Cada uma deixa um artefato e a próxima só começa com ele presente.
// Estado guardado em .mergulho.json (sub: { id: 'rodando' | 'concluida' | 'erro' }); concluída só vale com o artefato em disco. A retomada
// recomeça da primeira que não está concluída.
const SUBETAPAS = [
  { id: 'plano', n: '5.1', nome: 'Planejar o fluxo', arq: 'fluxo.json' },
  { id: 'massa', n: '5.2', nome: 'Massa de teste', arq: 'massa-teste.sql' },
  { id: 'ambiente', n: '5.3', nome: 'Subir o ambiente', arq: '.ambiente.ok' },
  { id: 'reproducao', n: '5.4', nome: 'Reproduzir', arq: 'reproducao.json' }
];
const ARTEFATO = {
  plano: (dir) => fluxo.ler(dir).passos.length > 0,
  massa: (dir) => !!lerTxt(path.join(dir, 'massa-teste.sql')).trim() && fs.existsSync(path.join(dir, '.massa-teste.ok')),
  ambiente: (dir) => fs.existsSync(path.join(dir, '.ambiente.ok')),
  reproducao: (dir) => fs.existsSync(path.join(dir, 'reproducao.json'))
};
const marcarSub = (dir, id, st) => mudar(dir, { sub: { ...(lerJson(path.join(dir, MERG), {}).sub || {}), [id]: st } });
// Estado gravado, já conferido com o artefato: 'concluida' sem artefato volta a pendente.
const estadoSubs = (dir) => {
  const g = lerJson(path.join(dir, MERG), {}).sub || {};
  return Object.fromEntries(SUBETAPAS.map((x) => [x.id, g[x.id] === 'concluida' && !ARTEFATO[x.id](dir) ? 'pendente' : g[x.id] || 'pendente']));
};
// Primeira subetapa não concluída (retomada); null se as quatro estão prontas.
const proximaSub = (dir) => { const e = estadoSubs(dir); return SUBETAPAS.find((x) => e[x.id] !== 'concluida') || null; };
// A próxima só começa com o artefato da anterior: erro claro (vai para o Ao vivo) se faltar.
const exigir = (dir, x) => {
  const ant = SUBETAPAS[SUBETAPAS.indexOf(x) - 1];
  if (ant && !ARTEFATO[ant.id](dir)) throw new Error(`${x.n} ${x.nome} precisa de ${ant.arq}, que a ${ant.n} ${ant.nome} ainda não deixou na pasta do incidente`);
  if (!ant && !lerTxt(path.join(dir, '4-diagnostico.md')).trim()) throw new Error(`${x.n} ${x.nome} precisa de 4-diagnostico.md (etapa 4 aprovada)`);
};

// Aprovação da massa de teste: .massa-aprovada guarda o hash do SQL aprovado; editar o arquivo depois exige aprovar de novo.
const hashSql = (sql) => require('crypto').createHash('sha1').update(String(sql).trim()).digest('hex');
const massaAprovada = (dir, sql) => lerTxt(path.join(dir, '.massa-aprovada')).trim() === hashSql(sql);
const aprovarMassa = (dir) => fs.writeFileSync(path.join(dir, '.massa-aprovada'), hashSql(lerTxt(path.join(dir, 'massa-teste.sql'))));
// "Aceitar como não reproduzido": o dev decide seguir sem resultado do Claude; fica registrado como tal, nunca como resultado dele.
const aceitarSemResultado = (dir) => { gravarReproducao(dir, false, 'Aceito pelo dev sem resultado registrado: o Claude não registrou o resultado da reprodução.'); marcarSub(dir, 'reproducao', 'concluida'); };

// Pausa: o A mostra motivo/pergunta/opções; a retomada chama executar de novo.
function pausar(dir, motivo, pergunta, opcoes = ['Tentar de novo']) {
  aoVivo.anotar(dir, { tipo: 'aviso', texto: `${motivo}. ${pergunta}` });
  mudar(dir, { etapa: 5, fase: 'pausado', pausa: { motivo, pergunta, opcoes } });
}

// Sobe tudo na ordem estrita. Devolve null (pronto) ou { motivo, pergunta } da primeira falha.
async function subirAmbiente(dir, d) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const cmds = d.comandos.lista(), esp = d.esperar;
  const faltam = ['api', 'metro', 'start'].filter((k) => !acharComando(cmds, PAPEIS[k]));
  if (faltam.length) return { motivo: `Falta comando em Configurações → Comandos para ${faltam.map((k) => PAPEIS[k].nome).join(', ')}`, pergunta: 'Cadastre o(s) comando(s) e tente de novo.' };
  // 1. Emulador
  vivo('etapa', 'Ambiente · 1. Emulador');
  if (!(await d.emulador.aparelhos()).length) { vivo('acao', 'Ligando o emulador'); d.emulador.ligar(); } else vivo('acao', 'Emulador já ligado');
  if (!(await esp(async () => (await d.emulador.aparelhos()).length > 0 && await d.emulador.pronto(), 300))) return { motivo: 'O emulador não terminou de ligar em 5 min', pergunta: 'Ligue o emulador à mão ou tente de novo?' };
  // 2. API
  vivo('etapa', 'Ambiente · 2. API');
  const rodarPapel = async (k, pronto) => {
    const p = PAPEIS[k], b = acharComando(cmds, p);
    if (await pronto()) vivo('acao', `${p.nome} já está de pé`); else { vivo('acao', `Rodando “${b.nome}”`); d.comandos.rodar(b.nome); }
    if (!(await esp(pronto, p.espera))) return { motivo: `${p.nome} não ficou pronto em ${p.espera}s (veja o terminal “${b.nome}”)`, pergunta: 'Corrija o terminal e tente de novo?' };
    vivo('acao', `${p.nome} pronto`);
    return null;
  };
  let f = await rodarPapel('api', () => d.portaAberta(PAPEIS.api.porta));
  if (f) return f;
  // 3. Metro (aguarda de fato estar de pé: status running)
  vivo('etapa', 'Ambiente · 3. Metro');
  f = await rodarPapel('metro', async () => (await d.portaAberta(PAPEIS.metro.porta)) && (await d.metroStatus()));
  if (f) return f;
  // 4. Start: só depois do Metro pronto
  vivo('etapa', 'Ambiente · 4. Start');
  return rodarPapel('start', async () => d.appInstalado());
}

// d: dependências injetáveis (testes). Etapa 5 + resumo; fecha com etapa 6/concluido ou pausa/erro.
async function executar(s, t, d = {}) {
  const dir = s.pastaAba(t.id), vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  d = { ...(d.semPadrao ? {} : depsPadrao(s, t, dir)), ...d };
  // Pausar (⏸): a rodada deixa de valer; confere entre os passos e dentro das esperas, e para sem marcar erro.
  /** @type {any} */ let atualSub = null; // subetapa em andamento (vira "erro" se a execução cair)
  const ponto = () => { if (!controle.valida(dir, d.rodada)) throw new Error(controle.CANCELADO); };
  const esperarOrig = d.esperar;
  d = { ...d, esperar: (teste, seg) => esperarOrig(async () => { ponto(); return teste(); }, seg) };
  try {
    mudar(dir, { etapa: 5, fase: 'rodando', pausa: null });
    const comecar = (x) => { exigir(dir, x); atualSub = x; marcarSub(dir, x.id, 'rodando'); vivo('etapa', `Incidente · ${x.n} ${x.nome}`); };
    const concluirSub = (x) => { marcarSub(dir, x.id, 'concluida'); atualSub = null; };
    const [S1, S2, S3, S4] = SUBETAPAS;
    // 5.1 Planejar o fluxo: só lê 1-4 e massa-real.sql (a massa de teste vem depois, do fluxo). Retomada reaproveita o fluxo já planejado.
    comecar(S1);
    if (!ARTEFATO.plano(dir)) {
      await d.claude({ prompt: promptPlano(t.chave, dir), titulo: 'Incidente · Planejando o fluxo da reprodução' });
      ponto();
      if (!ARTEFATO.plano(dir)) return pausar(dir, 'O Claude não montou o fluxo da reprodução', 'Tente de novo?');
    }
    concluirSub(S1);
    // 5.2 Massa de teste: o Claude monta a partir do fluxo.json; a extensão confere a trava e executa.
    ponto(); comecar(S2);
    // Preservação de prova: ambiente do banco tem de estar definido e não ser produção.
    const b = d.banco || {};
    if (b.ambiente === 'producao') return pausar(dir, 'A conexão do banco está marcada como PRODUÇÃO', 'Troque para a cópia de produção em Configurações → Banco de dados e tente de novo.');
    if (!b.ambiente) return pausar(dir, 'O ambiente do banco não está definido', 'Defina em Configurações → Banco de dados se a conexão é QAS ou cópia de produção, e tente de novo.');
    const arqTeste = path.join(dir, 'massa-teste.sql'), real = lerTxt(path.join(dir, 'massa-real.sql'));
    if (!lerTxt(arqTeste).trim()) { vivo('acao', 'Claude monta a massa de teste (registros novos, estado anterior ao erro, o que o fluxo precisa)'); await d.claude({ prompt: promptMassa(t.chave, dir), titulo: 'Incidente · Preparando a massa de teste' }); }
    ponto();
    const sqlTeste = lerTxt(arqTeste), trava = travaDml(sqlTeste, real);
    if (!trava.ok) return pausar(dir, `Massa de Teste recusada: ${trava.erro}`, 'Ajuste o massa-teste.sql (só registros novos) e tente de novo.');
    if (!fs.existsSync(path.join(dir, '.massa-teste.ok'))) {
      if (!massaAprovada(dir, sqlTeste)) { // única ação irreversível do Mergulho (INSERT + commit): abrir e ler antes de aprovar
        mudar(dir, { etapa: 5, fase: 'aguardando', pausa: null, aprovacao: { etapa: 5, lido: false, arq: 'massa-teste.sql', nome: 'Massa de teste (executa no banco)' } });
        vivo('fim', 'Massa de teste pronta (massa-teste.sql): aguardando sua aprovação antes de executar no banco');
        return;
      }
      vivo('acao', 'Executando massa-teste.sql no banco (só linhas novas)');
      const r = await d.executarSql(sqlTeste);
      if (!r.ok) return pausar(dir, 'O banco recusou a massa de teste', `${String(r.saida).slice(0, 200)}. Corrigir e tentar de novo?`);
      fs.writeFileSync(path.join(dir, '.massa-teste.ok'), new Date().toISOString());
    }
    concluirSub(S2);
    if (estadoSubs(dir).reproducao !== 'concluida') { // já concluída (ex.: aceita sem resultado): não sobe nem reproduz de novo
      // 5.3 Subir o ambiente (idempotente: o que já está de pé segue). Na retomada roda de novo, pois o ambiente pode ter caído.
      ponto(); comecar(S3);
      const falha = await subirAmbiente(dir, d);
      if (falha) return pausar(dir, falha.motivo, falha.pergunta);
      fs.writeFileSync(path.join(dir, '.ambiente.ok'), new Date().toISOString());
      concluirSub(S3);
      // 5.4 Reproduzir
      ponto(); comecar(S4);
      fluxo.descartarEmAndamento(dir); // passo cortado por pausa/queda volta para a fila
      fs.mkdirSync(path.join(dir, EVID), { recursive: true });
      fs.rmSync(path.join(dir, CLAUDE_JSON), { force: true });
      d.gravarTela(path.join(dir, EVID));
      const registrou = () => lerJson(path.join(dir, CLAUDE_JSON), null) !== null;
      let rodou = await d.claude({ prompt: promptReproduzir(t.chave, dir), titulo: 'Incidente · Reproduzindo no emulador' });
      if (rodou && !registrou() && controle.valida(dir, d.rodada)) { // uma segunda tentativa: os passos feitos são refeitos rápido pela ação registrada
        vivo('aviso', 'O Claude terminou a reprodução sem registrar o resultado: tentando mais uma vez');
        rodou = await d.claude({ prompt: promptReproduzir(t.chave, dir), titulo: 'Incidente · Reproduzindo no emulador (nova tentativa)' });
      }
      d.pararTela();
      ponto();
      if (!rodou) return pausar(dir, 'Já há um Claude em segundo plano nesta pasta', 'Aguarde ele terminar e tente de novo.');
      await d.esperar(async () => true, 0);
      if (!registrou()) return pausar(dir, 'O Claude não registrou o resultado da reprodução', 'Não sei dizer se o problema foi reproduzido: veja o Ao vivo e os passos do fluxo. Tentar de novo ou aceitar como não reproduzido?', [TENTAR, ACEITAR]);
      const rep = gravarReproducao(dir, false, '');
      vivo(rep.ok ? 'fim' : 'aviso', rep.ok ? 'Problema reproduzido no emulador' : 'O problema não foi reproduzido (resultado registrado pelo Claude)');
      concluirSub(S4);
    }

    vivo('etapa', 'Incidente · 6. Resumo analítico');
    ponto();
    await d.claude({ prompt: promptResumo(t.chave, dir), titulo: 'Incidente · Escrevendo o resumo analítico' });
    if (!lerTxt(path.join(dir, 'resumo.md')).trim()) {
      fs.writeFileSync(path.join(dir, 'resumo.md'), `> Resumo montado pela extensão, sem IA: o Claude não gravou o resumo.md. Revise antes de usar.\n\n${resumoBasico(dir, t)}`);
      vivo('aviso', 'O Claude não gravou o resumo.md: a extensão montou um resumo básico (revise)');
    }
    mudar(dir, { etapa: 6, fase: 'concluido', pausa: null });
    vivo('fim', 'Mergulho concluído: veja a aba Evidências');
  } catch (e) {
    if (e.message === controle.CANCELADO) return; // pausado por você: o mergulho.js já guardou a pausa
    vivo('erro', `Reprodução parou: ${e.message}`);
    if (atualSub) marcarSub(dir, atualSub.id, 'erro');
    mudar(dir, { etapa: 5, fase: 'erro', pausa: null });
  } finally { s.render?.(); }
}

module.exports = { executar, SUBETAPAS, estadoSubs, proximaSub, aprovarMassa, aceitarSemResultado, ACEITAR, _teste: { massaAprovada, hashSql, FERRAMENTAS, ARTEFATO, exigir, marcarSub, travaDml, chavesReais, subirAmbiente, gravarReproducao, acharComando, PAPEIS, promptPlano, promptReproduzir } };
