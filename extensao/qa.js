const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const maestro = require('./maestro');

// Módulo QA (lista QA do painel). O ▶ roda tudo em ordem (executar): planejamento → mapa de cenários → ambiente → massa → um
// `claude -p` por cenário. Estado em arquivos da pasta qa/ do ticket, então pausar/retomar é só parar entre execuções.
// Fase 1: planejamento.
// A extensão acha o planejamento sozinha (1 chamada ao Jira, sem Claude): subtarefa de QA do ticket com cenários na descrição
// (convenção do fcx-qa-test-planning:jira-qa-planner: "[QA] Planejamento dos Casos de Testes" / "[QA] Teste de Qualidade", CT01…).
// Cada versão diferente da descrição vira planejamento-qa-vN.md na pasta qa/ do ticket (aba Docs); o índice fica em .planejamento.json.
// Sem planejamento, o QA fica bloqueado até o Claude criar um (jira-qa-planner em segundo plano, o clique vale como OK).
const INDICE = '.planejamento.json';
// { fase: procurando | sem_plano | criando | erro | plano_encontrado (espera aprovação) | alterando | plano_aprovado, execucao: rodando | pausado | parado }
const ESTADO = '.qa.json';
const lerJson = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const gravarJson = (arq, v) => { fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(arq, JSON.stringify(v, null, 2)); };

// "QA", "qa", "[QA]", "Q.A." como palavra (não pega "quadro", "aqa").
const ehQA = (resumo) => /(^|[^a-z0-9])q\.?a([^a-z0-9]|$)/i.test(resumo || '');
const NOMES = /^\[qa\]\s*(planejamento dos casos de testes|teste de qualidade)\s*$/i;
const PLANO = /planej|plano|planning|casos? de testes?|cen[aá]rio/i;
// Prioridade: nome da skill > QA de planejamento > qualquer QA.
const nota = (s) => (NOMES.test(s.resumo.trim()) ? 0 : PLANO.test(s.resumo) ? 1 : 2);
const candidatas = (subs) => subs.filter((s) => ehQA(s.resumo)).sort((a, b) => nota(a) - nota(b));
// Tem plano: cenários (CT01, CT-01) ou Gherkin. A descrição padrão de subtarefa recém-criada não conta.
const temPlano = (texto) => /\bCT-?\d+|\bdado que\b/i.test(texto || '');

// ADF (descrição do Jira) → markdown, o bastante para o plano: títulos, parágrafos, listas, tabelas, negrito/itálico/código.
function adfMd(n, lista) {
  if (!n) return '';
  const filhos = (sep = '') => (n.content || []).map((c) => adfMd(c, n.type === 'orderedList' || n.type === 'bulletList' ? n.type : lista)).join(sep);
  switch (n.type) {
    case 'text': return (n.marks || []).reduce((t, m) => (m.type === 'strong' ? `**${t}**` : m.type === 'em' ? `*${t}*` : m.type === 'code' ? `\`${t}\``
      : m.type === 'link' ? `[${t}](${m.attrs?.href})` : t), n.text || '');
    case 'hardBreak': return '  \n';
    case 'mention': case 'emoji': return n.attrs?.text || '';
    case 'heading': return `${'#'.repeat(n.attrs?.level || 2)} ${filhos()}\n\n`;
    case 'paragraph': return `${filhos()}\n\n`;
    case 'bulletList': case 'orderedList': return `${filhos()}\n`;
    case 'listItem': return `${lista === 'orderedList' ? '1.' : '-'} ${filhos().trim().replace(/\n+/g, '\n  ')}\n`;
    case 'codeBlock': return `\`\`\`\n${filhos()}\n\`\`\`\n\n`;
    case 'blockquote': return filhos().trim().split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
    case 'rule': return '---\n\n';
    case 'table': {
      const linhas = (n.content || []).map((r) => (r.content || []).map((c) => adfMd({ type: 'doc', content: c.content }).trim().replace(/\n+/g, ' ').replace(/\|/g, '\\|')));
      if (!linhas.length) return '';
      const larg = Math.max(...linhas.map((l) => l.length));
      return [linhas[0], Array(larg).fill('---'), ...linhas.slice(1)].map((l) => `| ${l.join(' | ')} |`).join('\n') + '\n\n';
    }
    default: return filhos();
  }
}

// Subtarefas (filhos) do ticket com descrição: uma chamada só. api = (rota) => Promise<json> (ticket.js: api já autenticada).
async function procurar(api, chave) {
  const r = await api(`search/jql?jql=${encodeURIComponent(`parent = ${chave} ORDER BY created ASC`)}&fields=summary,description,updated,status&maxResults=100`);
  const subs = (r.issues || []).map((i) => ({ key: i.key, resumo: i.fields.summary || '', updated: i.fields.updated, status: i.fields.status?.name,
    md: adfMd(i.fields.description).replace(/\n{3,}/g, '\n\n').trim() }));
  const qa = candidatas(subs);
  return { plano: qa.find((s) => temPlano(s.md)) || null, qa };
}

// Grava a versão nova do plano se a descrição mudou. Devolve { v, arquivo, nova }.
function versionar(dir, s) {
  const ind = lerJson(path.join(dir, INDICE), { versoes: [] });
  const hash = crypto.createHash('sha1').update(s.md).digest('hex').slice(0, 12);
  const ult = ind.versoes.at(-1);
  if (ult && ult.hash === hash && ult.subtarefa === s.key) return { ...ult, nova: false };
  const v = (ult?.v || 0) + 1, arquivo = `planejamento-qa-v${v}.md`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, arquivo), `# Planejamento de QA · v${v}\n\nFonte: ${s.key} · ${s.resumo} · atualizado no Jira em ${s.updated}\n\n---\n\n${s.md}\n`);
  const nova = { v, arquivo, hash, subtarefa: s.key, resumo: s.resumo, jiraUpdated: s.updated, em: new Date().toISOString() };
  gravarJson(path.join(dir, INDICE), { ...ind, versoes: [...ind.versoes, nova] });
  return { ...nova, nova: true };
}

// ── Mapa de cenários (.cenarios.json): um item por CT do plano, com status e histórico de execuções.
// Plano novo: texto mudou → desatualizado (se já rodou) ; CT novo → pendente ; CT que saiu → arquivado (mantém o histórico).
const CENARIOS = '.cenarios.json';
const STATUS = { pendente: 'Pendente', executando: 'Executando', passou: 'Passou', falhou: 'Falhou', bloqueado: 'Bloqueado', desatualizado: 'Plano mudou' };
const hashDe = (t) => crypto.createHash('sha1').update(t.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12);
// Início de cenário: título (#### CT01 – Validar …) ou linha só em negrito (**Cenário 1: …**, **Exploratório 2: …**).
// CT n / Cenário n / Caso de teste n → CTnn; Exploratório n → EXnn (fica no fim da fila, como no plano).
const INICIO = /^(?:(#{1,6})\s*|\*\*\s*)(?:\*\*)?\s*(CT-?\s*|cen[aá]rio\s+|caso\s+de\s+teste\s+|explorat[oó]rio\s+)(\d+)\b\s*[-–—:.]?\s*(.*?)\s*(?:\*\*)?\s*$/i;
function cenariosDo(md) {
  const linhas = md.split('\n'), achados = [];
  linhas.forEach((l, i) => {
    const m = l.match(INICIO);
    if (m && (m[1] || l.trim().endsWith('**'))) achados.push({ i, nivel: m[1]?.length || 0, id: `${/^explorat/i.test(m[2]) ? 'EX' : 'CT'}${m[3].padStart(2, '0')}`, titulo: m[4].replace(/\*\*$/, '').trim() });
  });
  return achados.map((a, k) => {
    // Corpo até o próximo cenário; título: até o próximo título de nível igual ou maior; negrito: até qualquer título ou ---.
    let fim = achados[k + 1]?.i ?? linhas.length;
    for (let j = a.i + 1; j < fim; j++) {
      const h = linhas[j].match(/^(#{1,6})\s/);
      if ((h && (!a.nivel || h[1].length <= a.nivel)) || (!a.nivel && /^\s*---+\s*$/.test(linhas[j]))) { fim = j; break; }
    }
    const corpo = linhas.slice(a.i + 1, fim).join('\n').trim();
    const gherkin = corpo.split('\n').map((l) => l.replace(/[*_`]/g, '').replace(/^\s*[-•]\s*/, '').trim()).filter((l) => /^(dado|quando|então|entao|e)\b/i.test(l));
    return { id: a.id, titulo: a.titulo, resumo: gherkin.join(' · ').slice(0, 400), texto: corpo, hash: hashDe(a.titulo + corpo) };
  }).filter((c, k, l) => l.findIndex((x) => x.id === c.id) === k);
}
const cenarios = (dir) => lerJson(path.join(dir, CENARIOS), { planoVersao: 0, cenarios: [] });
function sincronizar(dir, md, versao) {
  const atual = cenarios(dir), novos = cenariosDo(md), velhos = new Map(atual.cenarios.map((c) => [c.id, c]));
  const lista = novos.map((n) => {
    const c = velhos.get(n.id);
    if (!c) return { ...n, status: 'pendente', execucoes: [] };
    const mudou = c.hash !== n.hash, rodou = (c.execucoes || []).length > 0;
    return { ...c, ...n, arquivado: false, status: mudou && rodou ? 'desatualizado' : c.arquivado ? 'pendente' : c.status };
  });
  for (const c of atual.cenarios) if (!novos.some((n) => n.id === c.id)) lista.push({ ...c, arquivado: true });
  const r = { planoVersao: versao, cenarios: lista };
  gravarJson(path.join(dir, CENARIOS), r);
  return { total: novos.length, novos: novos.filter((n) => !velhos.has(n.id)).length,
    mudaram: lista.filter((c) => !c.arquivado && velhos.has(c.id) && velhos.get(c.id).hash !== c.hash).length, sairam: lista.filter((c) => c.arquivado && !velhos.get(c.id)?.arquivado).length };
}
// ↻ Refazer: volta para pendente (o histórico fica); a execução (fase 5) pega os pendentes na ordem do plano.
function refazer(dir, id) {
  const r = cenarios(dir), c = r.cenarios.find((x) => x.id === id && !x.arquivado);
  if (!c || c.status === 'executando') return false;
  c.status = 'pendente';
  gravarJson(path.join(dir, CENARIOS), r);
  return true;
}

// ── Execuções de um cenário. A extensão abre (iniciarCenario); o Claude fecha com `qa-state cenario CTnn concluir`.
// Evidências de cada execução em evidencias/CTnn/<id da execução>/.
const RESULTADOS = ['passou', 'falhou', 'bloqueado'];
const carimbo = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
const fila = (r) => r.cenarios.filter((c) => !c.arquivado && ['pendente', 'desatualizado'].includes(c.status));
function iniciarCenario(dir, id, sha) {
  const r = cenarios(dir), c = r.cenarios.find((x) => x.id === id);
  const ex = { id: carimbo(), inicio: new Date().toISOString(), status: 'executando', sha: sha || null, evidencias: path.join('evidencias', id) };
  ex.evidencias = path.join(ex.evidencias, ex.id);
  fs.mkdirSync(path.join(dir, ex.evidencias), { recursive: true });
  c.statusAntes = c.status; c.status = 'executando'; (c.execucoes ||= []).push(ex);
  gravarJson(path.join(dir, CENARIOS), r);
  return ex;
}
// status: passou | falhou | bloqueado | descartado (pausa no meio: a execução fica no histórico e o cenário volta para a fila).
function concluirCenario(dir, id, status, nota = '') {
  const r = cenarios(dir), c = r.cenarios.find((x) => x.id === id), ex = c?.execucoes?.at(-1);
  if (!c || c.status !== 'executando' || !ex) throw new Error(`${id} não está em execução`);
  if (![...RESULTADOS, 'descartado'].includes(status)) throw new Error(`status inválido: ${status} (use ${RESULTADOS.join(', ')})`);
  Object.assign(ex, { status, nota, fim: new Date().toISOString() });
  c.status = status === 'descartado' ? (c.statusAntes || 'pendente') : status;
  delete c.statusAntes;
  gravarJson(path.join(dir, CENARIOS), r);
}
// Copia arquivos para a pasta da execução em andamento do cenário.
function evidencia(dir, id, arquivos) {
  const ex = cenarios(dir).cenarios.find((x) => x.id === id)?.execucoes?.at(-1);
  if (!ex || ex.status !== 'executando') throw new Error(`${id} não está em execução`);
  return arquivos.map((a) => { const destino = path.join(dir, ex.evidencias, path.basename(a)); fs.copyFileSync(a, destino); return destino; });
}
const arquivosDe = (dir, ex) => { try { return fs.readdirSync(path.join(dir, ex.evidencias)).filter((n) => !n.startsWith('.')).map((n) => path.join(dir, ex.evidencias, n)); } catch { return []; } };

// ── Massa de dados (.massa.json, aba Massa). Vale até o próximo refresh do banco (cópia de produção renovada todo dia):
// sem um sinal do restore no banco, o refresh é um horário configurável (craftingTable.qaHoraRefresh).
const MASSA = '.massa.json';
const massa = (dir) => lerJson(path.join(dir, MASSA), { itens: [] });
function ultimoRefresh(agora, hora = '06:00') {
  const [h, m] = String(hora).split(':').map(Number), d = new Date(agora);
  d.setHours(h || 0, m || 0, 0, 0);
  if (d > agora) d.setDate(d.getDate() - 1);
  return d;
}
const massaValida = (i, agora, hora) => i.estado === 'valida' && new Date(i.medidaEm) >= ultimoRefresh(agora, hora);
const semMassa = (dir, ids, agora, hora) => ids.filter((id) => !massa(dir).itens.some((i) => (i.cenarios || []).includes(id) && massaValida(i, agora, hora)));
function massaAdd(dir, { papel, cenarios: cens, dados, consulta }) {
  const m = massa(dir), id = `M${m.itens.reduce((n, i) => Math.max(n, Number(i.id.slice(1)) || 0), 0) + 1}`;
  m.itens.push({ id, papel: papel || '', cenarios: cens || [], dados: dados || {}, consulta: consulta || '', medidaEm: new Date().toISOString(), estado: 'valida' });
  gravarJson(path.join(dir, MASSA), m);
  return id;
}
function massaEstado(dir, id, est) {
  if (!['valida', 'consumida', 'invalida'].includes(est)) throw new Error(`estado inválido: ${est} (use valida, consumida, invalida)`);
  const m = massa(dir), i = m.itens.find((x) => x.id === id);
  if (!i) throw new Error(`massa ${id} não existe`);
  i.estado = est; if (est === 'valida') i.medidaEm = new Date().toISOString();
  gravarJson(path.join(dir, MASSA), m);
}

// ── Ambiente (preparar-ambiente.py da skill testes-funcionais: config, refs, API 5111, Metro 8081, emulador, app). Idempotente:
// o que já está de pé é reaproveitado, então rodar a cada ▶ custa segundos. O app é recompilado no 1º preparo do dia.
// Um ambiente por máquina (portas e emulador únicos): a trava diz de qual ticket ele está.
const AMBIENTE = '.ambiente.json';
const TRAVA = () => path.join(os.homedir(), '.claude', 'tickets', '.qa-ambiente.json');
const donoAmbiente = () => lerJson(TRAVA(), null);
const travar = (chave) => gravarJson(TRAVA(), { chave, em: new Date().toISOString() });
const ambiente = (dir) => lerJson(path.join(dir, AMBIENTE), null);
const hoje = (d = new Date()) => d.toLocaleDateString('sv-SE');
const SKILL = () => path.join(os.homedir(), '.claude', 'skills', 'testes-funcionais');
const scriptPreparo = (backend) => [path.join(backend, 'testes-funcionais', 'preparar-ambiente.py'), path.join(SKILL(), 'assets', 'backend', 'preparar-ambiente.py')].find((f) => fs.existsSync(f)) || null;
const shaDe = (repo) => { try { return repo ? execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { timeout: 5000 }).toString().trim() : null; } catch { return null; } };
const preparos = new Map(); // dir -> processo do preparar-ambiente (a pausa mata)
const LOG_AMB = '.ambiente.log'; // saída completa do último preparo (rodapé → Ambiente: log ao vivo; base da análise do Claude)
async function preparar(dir, chave, backend, d = {}) {
  const vivo = (tipo, texto) => maestro.anotar(dir, { tipo, texto });
  vivo('etapa', 'QA · Ambiente');
  gravarJson(path.join(dir, AMBIENTE), { ...(ambiente(dir) || {}), preparando: true, parou_em: null, erro: null, analise: null, em: new Date().toISOString() });
  vivo('acao', 'Procurando nos Comandos (Configurações) o que sobe API, Metro e emulador');
  const c = await viaComandos(dir, { ...d, backend });
  if (pausado(dir)) { gravarJson(path.join(dir, AMBIENTE), { ...ambiente(dir), preparando: false }); return null; }
  if (c) {
    const amb = { ...c, data: hoje(), em: new Date().toISOString(), preparando: false, sha: { backend: shaDe(c.backend), mobile: shaDe(c.mobile) } };
    gravarJson(path.join(dir, AMBIENTE), amb);
    if (amb.parou_em) return null;
    vivo('fim', `Ambiente pronto pelos Comandos · backend ${amb.sha.backend || '?'} · mobile ${amb.sha.mobile || '?'}`);
    return amb;
  }
  return prepararPelaSkill(dir, chave, backend);
}
function prepararPelaSkill(dir, chave, backend) {
  const vivo = (tipo, texto) => maestro.anotar(dir, { tipo, texto });
  const script = backend && scriptPreparo(backend);
  if (!script) {
    vivo('erro', backend ? 'Não achei o preparar-ambiente.py (nem no backend, nem na skill testes-funcionais)' : 'Sem repositório backend configurado (Configurações → repositórios)');
    const erro = backend ? `preparar-ambiente.py não encontrado em ${path.join(backend, 'testes-funcionais')} nem em ${path.join(SKILL(), 'assets', 'backend')}`
      : 'nenhum repositório backend configurado (Configurações → repositórios) e nenhum novo-wms-backend ao lado do repositório de specs';
    fs.writeFileSync(path.join(dir, LOG_AMB), `${new Date().toISOString()}\n${erro}\n`);
    gravarJson(path.join(dir, AMBIENTE), { parou_em: 'config', erro, itens: [], em: new Date().toISOString(), data: hoje(), fonte: 'skill' });
    return Promise.resolve(null);
  }
  const antes = ambiente(dir), build = !antes || antes.fonte !== 'skill' || antes.data !== hoje() || !!antes.parou_em;
  vivo('acao', `Preparando API, Metro, emulador e app${build ? ' (com build do app: 1º preparo do dia)' : ''}. O que já está de pé é reaproveitado`);
  return new Promise((ok) => {
    const args = [script, '--chave', chave, '--json', ...(build ? ['--build-app'] : [])];
    const log = fs.createWriteStream(path.join(dir, LOG_AMB), { flags: 'a' }); // depois do que a tentativa pelos Comandos escreveu
    log.write(`$ cd ${backend} && python3 ${args.join(' ')}\n${new Date().toISOString()}\n\n`);
    const p = spawn('python3', args, { cwd: backend, stdio: ['ignore', 'pipe', 'pipe'] });
    preparos.set(dir, p); mudar(dir, { pidPreparo: p.pid });
    let resto = '', json = null, erro = '';
    p.stdout.on('data', (b) => log.write(b));
    p.stderr.on('data', (b) => log.write(b));
    p.stdout.on('data', (b) => {
      const partes = (resto + b).split('\n'); resto = partes.pop();
      for (const l of partes) {
        if (l.startsWith('{')) { try { json = JSON.parse(l); } catch {} continue; }
        const m = l.match(/^\s*\[(\s*OK\s*|FEITO|PEND\.|AVISO)\]\s*(.*)/);
        if (m) vivo(/PEND|AVISO/.test(m[1]) ? 'aviso' : 'acao', m[2].trim().slice(0, 200));
      }
    });
    p.stderr.on('data', (b) => { erro += b; });
    p.on('error', (e) => { erro = e.message; });
    p.on('close', (code, sinal) => {
      preparos.delete(dir);
      log.end(`\n[saiu com código ${code}${sinal ? `, sinal ${sinal}` : ''}]\n`);
      if (resto.startsWith('{')) { try { json = JSON.parse(resto); } catch {} }
      if (sinal) { vivo('aviso', 'Preparo do ambiente interrompido'); return ok(null); }
      const amb = { ...(json || { parou_em: 'script', itens: [] }), erro: json ? null : (erro.trim().slice(-300) || `saiu com código ${code}`),
        data: hoje(), em: new Date().toISOString(), build, fonte: 'skill', preparando: false, sha: { backend: shaDe(json?.backend), mobile: shaDe(json?.mobile) } };
      gravarJson(path.join(dir, AMBIENTE), amb);
      if (amb.parou_em) { vivo('erro', `Ambiente parou na etapa ${amb.parou_em}${amb.erro ? `: ${amb.erro}` : ''}. Log e análise no Ambiente do rodapé`); return ok(null); }
      vivo('fim', `Ambiente pronto · ref ${amb.ref || '?'} · backend ${amb.sha.backend || '?'} · mobile ${amb.sha.mobile || '?'}${amb.pendentes ? ` · ${amb.pendentes} pendência(s)` : ''}`);
      ok(amb);
    });
  });
}

// ── Ambiente pelos Comandos das Configurações: se lá há um comando que sobe a API e outro que sobe o Metro, eles bastam
// (o que já responde na porta não é rodado de novo); o emulador vem do AVD padrão. Falta comando → script da skill.
// App não instalado → o script da skill completa (ele reaproveita API, Metro e emulador de pé e compila o app).
// Escolha por pontos: nome do botão vale mais que o comando. `yarn/npm start` NÃO conta como Metro: no wms-mobile ele é `yarn android`
// (compila e instala o app), não o bundler.
const PAPEIS = {
  api: { nome: 'API', porta: 5111, espera: 240, pelo_nome: /\bapi\b|backend/i, pelo_cmd: /dotnet\s+(run|watch)|5111/i },
  metro: { nome: 'Metro', porta: 8081, espera: 120, pelo_nome: /\bmetro\b|bundler/i, pelo_cmd: /react-native\s+start|\bmetro\b|--port[=\s]+8081/i }
};
const pontos = (b, p) => (p.pelo_nome.test(b.nome) ? 2 : 0) + (p.pelo_cmd.test(b.comando || '') ? 1 : 0);
const papeisDe = (lista) => Object.fromEntries(Object.entries(PAPEIS).map(([k, p]) => [k,
  lista.map((b) => [b, pontos(b, p)]).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1])[0]?.[0] || null]));
const portaAberta = (n) => new Promise((ok) => {
  const sk = require('net').connect(n, '127.0.0.1');
  const fim = (v) => { sk.destroy(); ok(v); };
  sk.setTimeout(1500); sk.on('connect', () => fim(true)); sk.on('error', () => fim(false)); sk.on('timeout', () => fim(false));
});
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(teste, segundos, parar) {
  for (const fim = Date.now() + segundos * 1000; Date.now() < fim; await dormir(3000)) { if (await teste()) return true; if (parar()) return false; }
  return teste();
}
const adbSaida = (adb, args) => { try { return execFileSync(adb, args, { timeout: 15000 }).toString(); } catch { return ''; } };
async function viaComandos(dir, d) {
  const vivo = (tipo, texto) => { maestro.anotar(dir, { tipo, texto }); fs.appendFileSync(path.join(dir, LOG_AMB), `[${new Date().toLocaleTimeString('pt-BR')}] ${texto}\n`); };
  fs.writeFileSync(path.join(dir, LOG_AMB), `Ambiente pelos Comandos das Configurações · ${new Date().toISOString()}\n\n`);
  const lista = d.comandos?.lista() || [], achou = papeisDe(lista);
  vivo('acao', lista.length ? `Comandos nas Configurações: ${lista.map((b) => b.nome).join(', ')}` : 'Nenhum comando cadastrado em Configurações → Comandos');
  const faltam = Object.keys(PAPEIS).filter((k) => !achou[k]);
  if (faltam.length) { vivo('aviso', `Falta comando para ${faltam.map((k) => PAPEIS[k].nome).join(' e ')}: uso o preparar-ambiente.py da skill`); return null; }
  vivo('acao', `Suficiente: API por “${achou.api.nome}” e Metro por “${achou.metro.nome}”`);
  for (const [k, p] of Object.entries(PAPEIS)) {
    if (await portaAberta(p.porta)) vivo('acao', `${p.nome} já responde na porta ${p.porta}`);
    else { vivo('acao', `Rodando “${achou[k].nome}” (${achou[k].comando})`); d.comandos.rodar(achou[k].nome); }
  }
  const adb = d.adb, pronto = () => adbSaida(adb, ['shell', 'getprop', 'sys.boot_completed']).trim() === '1';
  if (!(await d.emulador.aparelhos()).length) { vivo('acao', `Ligando o emulador ${d.emulador.avd || ''}`.trim()); d.emulador.ligar(); }
  else vivo('acao', 'Emulador já ligado');
  const parar = () => pausado(dir);
  for (const p of Object.values(PAPEIS)) {
    if (!(await esperar(() => portaAberta(p.porta), p.espera, parar))) {
      if (!parar()) vivo('erro', `${p.nome} não respondeu na porta ${p.porta} em ${p.espera}s (veja o terminal “${achou[p === PAPEIS.api ? 'api' : 'metro'].nome}”)`);
      return { parou_em: p === PAPEIS.api ? 'api' : 'metro', fonte: 'comandos', terminais: [achou.api.nome, achou.metro.nome] };
    }
    vivo('acao', `${p.nome} respondendo na porta ${p.porta}`);
  }
  if (!(await esperar(async () => pronto(), 300, parar))) { if (!parar()) vivo('erro', 'O emulador não terminou de ligar em 5 min'); return { parou_em: 'app', fonte: 'comandos', terminais: [achou.api.nome, achou.metro.nome] }; }
  adbSaida(adb, ['reverse', 'tcp:5111', 'tcp:5111']); adbSaida(adb, ['reverse', 'tcp:8081', 'tcp:8081']);
  const app = adbSaida(adb, ['shell', 'pm', 'list', 'packages']).match(/package:(br\.com\.ferreiracosta\.wms\S*)/)?.[1];
  if (!app) { vivo('aviso', 'App do WMS não instalado no emulador: o preparar-ambiente.py da skill compila e instala (reaproveita o que já está de pé)'); return null; }
  vivo('acao', `Emulador pronto com o app ${app}`);
  return { fonte: 'comandos', terminais: [achou.api.nome, achou.metro.nome], app, parou_em: null, itens: [], backend: achou.api.pasta || d.backend, mobile: achou.metro.pasta || null };
}

// ── Prompts do Claude em segundo plano (execução). A skill testes-funcionais é o método; as paradas dela viram registro.
const QA_STATE = path.join(__dirname, 'bin', 'qa-state');
const REGRAS = 'Modo não interativo: onde a skill manda parar e confirmar, não pergunte; registre e siga, ou conclua como bloqueado. '
  + 'Proibido: escrever no banco (INSERT/UPDATE/DELETE, liberar usuário ou permissão), publicar no Jira, commit e push. '
  + `Grave tudo do QA com ${QA_STATE} (a pasta ~/.claude é bloqueada para escrita).`;
const promptMassa = (chave, cens) => `[segundo plano · Crafting Table · QA de ${chave}] Levante a massa de dados para estes cenários, seguindo o método `
  + `de massa da skill testes-funcionais (${SKILL()}/SKILL.md; consultas só de leitura na cópia de produção):\n`
  + cens.map((c) => `- ${c.id} · ${c.titulo}${c.resumo ? ` (${c.resumo})` : ''}`).join('\n')
  + `\nPara cada papel encontrado: ${QA_STATE} massa add --papel "<papel>" --cenarios CT01,CT02 --dados '<json com os campos>' --consulta "<SQL usado>". `
  + 'Traga 2 registros por papel quando der (reserva: um cenário pode consumir o registro). Cenário que não precisa de massa: não registre nada. '
  + `Se o banco não responder, termine dizendo isso. ${REGRAS}`;
const promptCenario = (chave, c, amb, itens) => `[segundo plano · Crafting Table · QA de ${chave}] Execute SÓ o cenário ${c.id} do planejamento de QA, `
  + `seguindo o método da skill testes-funcionais (${SKILL()}/SKILL.md).\n\nCenário ${c.id} · ${c.titulo}\n${c.texto}\n\n`
  + `Ambiente já preparado (não rode preparar-ambiente): backend ${amb.backend || '?'} · mobile ${amb.mobile || '?'} · ref ${amb.ref || '?'} · API http://localhost:5111 · Metro 8081 · emulador ligado.\n`
  + `Massa válida para este cenário: ${itens.length ? JSON.stringify(itens.map((i) => ({ id: i.id, papel: i.papel, dados: i.dados }))) : 'nenhuma registrada'}. `
  + `Antes de usar, confira que o registro ainda está no estado esperado; se não estiver, ${QA_STATE} massa <ID> invalida e use outro (ou levante e registre com massa add). `
  + `Se o cenário alterar o registro, ${QA_STATE} massa <ID> consumida.\n`
  + `Evidências: a tela do emulador já está sendo gravada. Prints e arquivos de resultado (log Robot, junit, relatório): ${QA_STATE} evidencia ${c.id} <arquivo...>.\n`
  + `OBRIGATÓRIO ao final: ${QA_STATE} cenario ${c.id} concluir --status passou|falhou|bloqueado --nota "<1 frase: o que foi visto>". ${REGRAS}`;
const FERRAMENTAS_EXEC = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill'];
// Ambiente parou: o Claude lê o log e o diagnóstico da skill (só leitura) e grava a análise com `qa-state analise`.
const promptAnalise = (chave, dir, a) => `[segundo plano · Crafting Table · QA de ${chave}] O preparo do ambiente de testes (preparar-ambiente.py da skill `
  + `testes-funcionais) parou na etapa "${a.parou_em}"${a.erro ? ` (${a.erro})` : ''}. Descubra por quê.\nLog completo do preparo: ${path.join(dir, LOG_AMB)}\n`
  + `Use o diagnóstico da skill: ${SKILL()}/references/diagnostico.md e ${SKILL()}/references/ambiente-execucao.md. `
  + `Investigue só lendo (log da API em testes-funcionais/resultados/api-*.log do backend, portas, processos, ~/.wms-testes.env sem mostrar senhas): não suba, derrube nem instale nada.\n`
  + 'Responda em português, curto, neste formato:\nCausa: <1 a 2 frases>\nEvidência: <a linha do log ou o fato que prova>\nComo resolver:\n1. <passo>\n'
  + `Grave a resposta com: ${QA_STATE} analise <<'FIM'\n<resposta>\nFIM`;
const FERRAMENTAS_ANALISE = ['Read', 'Glob', 'Grep', `Bash(${QA_STATE}:*)`, 'Bash(cat:*)', 'Bash(tail:*)', 'Bash(head:*)', 'Bash(ls:*)', 'Bash(grep:*)',
  'Bash(ss:*)', 'Bash(ps:*)', 'Bash(curl:*)', 'Bash(git status:*)', 'Bash(git log:*)', 'Bash(which:*)', 'Bash(dotnet --info:*)', 'Bash(adb devices:*)'];
function analisarAmbiente(dir, d) {
  const a = ambiente(dir);
  if (!a?.parou_em || maestro.rodando(dir)) return Promise.resolve();
  gravarJson(path.join(dir, AMBIENTE), { ...a, analise: { analisando: true, em: new Date().toISOString() } });
  return claude(dir, { prompt: promptAnalise(d.chave, dir, a), titulo: 'QA · Analisando por que o ambiente parou', ferramentas: FERRAMENTAS_ANALISE, cwd: d.backend || dir }, d)
    .then(() => { const b = ambiente(dir); if (b?.analise?.analisando) gravarJson(path.join(dir, AMBIENTE), { ...b, analise: { texto: 'O Claude terminou sem gravar a análise. Veja o log.', em: new Date().toISOString() } }); });
}
// Rodapé do painel: preparando (clique abre o log ao vivo) · erro (luz vermelha piscando + bolinha até você abrir a análise) · pronto.
function statusAmbiente(dir) {
  const a = ambiente(dir);
  if (!a) return null;
  if (a.preparando && rodando(dir)) return { tipo: 'preparando' };
  if (a.parou_em) return { tipo: 'erro', analisando: !!a.analise?.analisando && rodando(dir), nova: !!a.analise?.texto && !a.analise.vista, etapa: a.parou_em };
  return a.preparando ? null : { tipo: 'pronto' };
}
// Conteúdo do modal do rodapé: etapa, erro, pendências e a análise do Claude (se houver).
function resumoErroAmbiente(dir) {
  const a = ambiente(dir);
  if (!a?.parou_em) return null;
  const pend = (a.itens || []).filter((i) => i.verdito === 'PENDENTE').map((i) => `⛔ ${i.item}: ${i.detalhe || ''}`);
  return { titulo: `Ambiente parou na etapa ${a.parou_em}`, analise: a.analise?.texto || null, analisando: !!a.analise?.analisando && rodando(dir),
    detalhe: [a.erro, ...pend].filter(Boolean).join('\n') };
}
function analiseVista(dir) { const a = ambiente(dir); if (a?.analise?.texto && !a.analise.vista) gravarJson(path.join(dir, AMBIENTE), { ...a, analise: { ...a.analise, vista: true } }); }
function gravarAnalise(dir, texto) {
  const a = ambiente(dir);
  if (!a) throw new Error('nenhum preparo de ambiente registrado');
  gravarJson(path.join(dir, AMBIENTE), { ...a, analise: { texto: String(texto).trim(), em: new Date().toISOString() } });
}

// Claude em segundo plano até terminar (maestro.rodar). d.extras/d.aoMudar vêm do painel.
const claude = (dir, opts, d) => new Promise((ok) => {
  const foi = maestro.rodar(dir, { ferramentas: FERRAMENTAS_EXEC, ...opts, env: { QA_DIR: dir, ...(opts.env || {}) }, extras: [...(d.extras || []), ...(opts.extras || [])],
    aoMudar: () => { d.aoMudar?.(); if (!maestro.rodando(dir)) ok(); } });
  if (!foi) ok();
});

// ▶ do QA: tudo em ordem. d = { chave, backend, api, horaRefresh, extras, aoMudar, confirmar(texto) → bool, gravarTela(dir), pararTela(), avisar(texto) }.
const ativos = new Set();
const pausado = (dir) => estado(dir).execucao === 'pausado';
async function executar(dir, d) {
  if (rodando(dir)) return;
  ativos.add(dir); mudar(dir, { execucao: 'rodando', host: process.pid }); d.aoMudar?.();
  const vivo = (tipo, texto) => maestro.anotar(dir, { tipo, texto });
  try {
    if (estado(dir).fase !== 'plano_aprovado') return vivo('aviso', 'Aprove o planejamento antes de dar início');
    vivo('etapa', 'QA · 3. Execução');
    let pend = fila(cenarios(dir));
    if (!pend.length) return vivo('fim', cenarios(dir).cenarios.length ? 'Nenhum cenário pendente. Use ↻ Refazer para executar um de novo' : 'Sem cenários para executar');
    const dono = donoAmbiente();
    if (dono && dono.chave !== d.chave && !(await d.confirmar(`O ambiente de testes (API, Metro, emulador) está com o ${dono.chave}. Usar no ${d.chave}?`))) {
      return vivo('aviso', `Ambiente em uso pelo ${dono.chave}: QA não iniciado`);
    }
    travar(d.chave);
    const amb = await preparar(dir, d.chave, d.backend, d);
    if (!amb && !pausado(dir)) { vivo('acao', 'Pedindo ao Claude uma análise do erro (aparece ao clicar em Ambiente parou, no rodapé)'); await analisarAmbiente(dir, d); }
    if (!amb || pausado(dir)) return;
    const agora = new Date(), falta = semMassa(dir, pend.map((c) => c.id), agora, d.horaRefresh);
    vivo('etapa', 'QA · Massa de dados');
    if (falta.length) {
      vivo('acao', `Sem massa válida para ${falta.join(', ')} (refresh do banco às ${d.horaRefresh || '06:00'}): levantando`);
      await claude(dir, { prompt: promptMassa(d.chave, pend.filter((c) => falta.includes(c.id))), titulo: 'QA · Levantando massa de dados', cwd: amb.backend || d.backend }, d);
      if (pausado(dir)) return;
    } else vivo('fim', 'Massa de hoje ainda válida: reaproveitada');
    while (!pausado(dir) && (pend = fila(cenarios(dir))).length) {
      const c = pend[0], ex = iniciarCenario(dir, c.id, amb.sha);
      const itens = massa(dir).itens.filter((i) => (i.cenarios || []).includes(c.id) && massaValida(i, new Date(), d.horaRefresh));
      d.gravarTela?.(path.join(dir, ex.evidencias));
      await claude(dir, { prompt: promptCenario(d.chave, c, amb, itens), titulo: `QA · ${c.id} · ${c.titulo}`, cwd: amb.backend || d.backend }, d);
      d.pararTela?.();
      if (cenarios(dir).cenarios.find((x) => x.id === c.id)?.status === 'executando') {
        if (pausado(dir)) { concluirCenario(dir, c.id, 'descartado', 'QA pausado no meio do cenário'); vivo('aviso', `${c.id} descartado (pausa no meio): volta da fila na retomada`); }
        else { concluirCenario(dir, c.id, 'bloqueado', 'O Claude terminou sem registrar o resultado'); vivo('aviso', `${c.id}: o Claude não registrou o resultado (bloqueado)`); }
      }
    }
    if (!pausado(dir)) {
      const ativosC = cenarios(dir).cenarios.filter((c) => !c.arquivado), n = (s) => ativosC.filter((c) => c.status === s).length;
      const fim = `QA concluído: ${n('passou')} passaram, ${n('falhou')} falharam, ${n('bloqueado')} bloqueados`;
      vivo('fim', fim); d.avisar?.(fim);
    }
  } catch (e) { vivo('erro', `QA parou: ${e.message}`); } finally {
    ativos.delete(dir);
    if (estado(dir).execucao === 'rodando') mudar(dir, { execucao: 'parado' });
    d.aoMudar?.();
  }
}
// ⏸: o cenário em andamento é descartado; API, Metro e emulador continuam de pé (retomar no mesmo dia custa segundos).
// Vale também para um QA iniciado em outra janela: ela vê execucao = pausado no arquivo e para entre os passos.
function pausar(dir) {
  const e = estado(dir);
  mudar(dir, { execucao: 'pausado' });
  maestro.parar(dir);
  if (preparos.has(dir)) preparos.get(dir).kill('SIGTERM');
  else if (e.pidPreparo && vivoPid(e.pidPreparo)) process.kill(e.pidPreparo, 'SIGTERM');
}
const vivoPid = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
// Rodando: nesta janela (memória) ou em outra (estado com o pid da janela dona ainda vivo, ou claude com .ao-vivo.pid vivo).
const qaRodando = (dir) => rodando(dir); // html() tem uma variável local chamada rodando
const rodando = (dir) => { if (ativos.has(dir) || maestro.rodando(dir)) return true; const e = estado(dir); return e.execucao === 'rodando' && e.host !== process.pid && vivoPid(e.host); };

const estado = (dir) => lerJson(path.join(dir, ESTADO), {});
const mudar = (dir, e) => gravarJson(path.join(dir, ESTADO), { ...estado(dir), ...e, em: new Date().toISOString() });

// ▶ do QA: acha o plano no Jira e versiona em Docs. Plano novo (ou mudado) espera a aprovação do humano; já aprovado, lista os cenários.
async function verificarPlano(dir, chave, api) {
  const vivo = (tipo, texto) => maestro.anotar(dir, { tipo, texto });
  vivo('etapa', 'QA · 1. Planejamento');
  vivo('acao', `Lendo as subtarefas do ${chave} no Jira`);
  mudar(dir, { fase: 'procurando', erro: null, chave });
  let r;
  try { r = await procurar(api, chave); } catch (e) {
    vivo('erro', `Não consegui ler o ticket no Jira: ${e.message}`);
    return mudar(dir, { fase: 'erro', erro: e.message });
  }
  vivo('acao', r.qa.length ? `Subtarefas com QA no nome: ${r.qa.map((x) => `${x.key} (${x.resumo})`).join(', ')}` : 'Nenhuma subtarefa com QA no nome');
  if (!r.plano) {
    vivo('aviso', r.qa.length ? 'Nenhuma delas tem cenários (CT01, Cenário 1, Dado que…): o QA só começa com o planejamento'
      : 'Sem planejamento de QA: o QA só começa com ele. Crie pelo cartão acima');
    return mudar(dir, { fase: 'sem_plano', subtarefas: r.qa.map((x) => x.key) });
  }
  const n = cenariosDo(r.plano.md).length, v = versionar(dir, r.plano);
  vivo('acao', `Planejamento encontrado em ${r.plano.key}: ${n} cenário(s)`);
  vivo('fim', v.nova ? `Salvo na aba Docs como ${v.arquivo}` : `Mesmo texto da v${v.v} (já está na aba Docs)`);
  const e = estado(dir);
  if (e.aprovado?.versao === v.v && e.aprovado.subtarefa === r.plano.key) {
    const m = sincronizar(dir, r.plano.md, v.v);
    vivo('fim', `Planejamento v${v.v} já aprovado: ${m.total} cenário(s) listados abaixo`);
    return mudar(dir, { fase: 'plano_aprovado', subtarefa: r.plano.key, versao: v.v });
  }
  vivo('aviso', `Aguardando você: abra o planejamento v${v.v} no cartão acima, peça mudanças ou aprove`);
  return mudar(dir, { fase: 'plano_encontrado', subtarefa: r.plano.key, versao: v.v });
}
const versaoAtual = (dir) => lerJson(path.join(dir, INDICE), { versoes: [] }).versoes.at(-1) || null;
// Texto do plano de uma versão (sem o cabeçalho que versionar() põe).
const mdDaVersao = (dir, v) => { const t = fs.readFileSync(path.join(dir, v.arquivo), 'utf8'); return t.slice(t.indexOf('\n---\n\n') + 6); };
// Aprovar: os cenários da versão aprovada vão para o mapa e o QA espera o Dar início.
function aprovar(dir) {
  const e = estado(dir), v = versaoAtual(dir);
  if (e.fase !== 'plano_encontrado' || !v) return false;
  const vivo = (tipo, texto) => maestro.anotar(dir, { tipo, texto });
  const m = sincronizar(dir, mdDaVersao(dir, v), v.v);
  vivo('etapa', 'QA · 2. Cenários');
  vivo('fim', `Planejamento v${v.v} aprovado`);
  vivo('fim', `${m.total} cenário(s) listados abaixo${m.mudaram ? ` · ${m.mudaram} mudaram desde a última versão` : ''}${m.sairam ? ` · ${m.sairam} saíram do plano` : ''}`);
  vivo('acao', 'Clique em Dar início para subir o ambiente e executar os cenários');
  mudar(dir, { fase: 'plano_aprovado', aprovado: { versao: v.v, subtarefa: v.subtarefa, em: new Date().toISOString() } });
  return true;
}

// Prompt do jira-qa-planner em segundo plano: a skill pede OK antes de cada escrita; aqui o clique do humano é o OK.
const promptCriar = (link) => `/fcx-qa-test-planning:jira-qa-planner ${link}\n\n[segundo plano · Crafting Table] O humano já aprovou a criação do `
  + 'planejamento ao clicar em "Criar planejamento" no painel: não peça confirmação, siga até gravar a subtarefa e o plano no Jira. '
  + 'Use as ferramentas MCP do Atlassian (o twg não está instalado). Se já existir subtarefa de QA, não crie outra: preencha a descrição dela.';
// Pedir mudança: o Claude aplica o pedido na descrição da subtarefa de QA (de onde o ▶ tira a versão). O Enviar do humano é o OK da escrita.
const promptMudanca = (link, sub, arquivo, pedido) => `[segundo plano · Crafting Table] Ticket ${link}. O humano pediu esta mudança no planejamento de QA `
  + `(subtarefa ${sub}; texto atual em ${arquivo}): "${pedido}".\nAplique na DESCRIÇÃO de ${sub} pelo MCP do Atlassian (editJiraIssue, markdown), sem pedir confirmação: `
  + 'mantenha o formato e a numeração dos cenários que não mudaram e continue a numeração nos novos. Não crie subtarefa nem comentário. '
  + 'Termine dizendo em uma frase o que mudou.';
// Ferramentas liberadas: leitura do plugin e Jira (MCP). Sem Bash livre.
const FERRAMENTAS_PLANO = ['Skill', 'Read', 'Glob', 'Grep', 'Bash(jq:*)', 'Bash(cat:*)', 'Bash(mkdir:*)',
  ...['getAccessibleAtlassianResources', 'atlassianUserInfo', 'getJiraIssue', 'searchJiraIssuesUsingJql', 'getJiraProjectIssueTypesMetadata',
    'getJiraIssueTypeMetaWithFields', 'createJiraIssue', 'editJiraIssue', 'addCommentToJiraIssue'].map((f) => `mcp__claude_ai_Atlassian__${f}`)];

// Bloco do topo da seção Evidências no QA: cartão do planejamento + Ao vivo. Botões vão ao painel (data-painel, grupo.js).
const CSS = `<style>${maestro.CSS_VIVO}
  .caixa-t { margin: 0 12px 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); display: flex; gap: 6px; }
  .caixa-t span { margin-left: auto; text-transform: none; letter-spacing: 0; }
  .qa-card { margin: 10px 12px; padding: 10px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); font-size: 12px; }
  .qa-card.bloq { border-left: 3px solid var(--warn); }
  .qa-card b { display: block; font-size: 12.5px; margin-bottom: 2px; }
  .qa-card p { margin: 0; color: var(--text-dim); line-height: 1.5; }
  .qa-card button { margin-top: 8px; height: 26px; padding: 0 10px; border: 0; border-radius: var(--r-md); background: var(--accent); color: var(--on-cor); font-weight: 600; cursor: pointer; }
  .qa-card button[disabled] { opacity: .6; cursor: default; }
  .qa-card .arquivo { display: inline-flex; gap: 2px; margin-top: 8px; }
  .qa-card .arquivo .fb-btn { margin: 0; height: 24px; padding: 0 7px; background: transparent; color: var(--text); font-weight: 400; }
  .qa-card .arquivo .fb-btn:hover { background: var(--surface-2); }
  .acoes-passo { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .qa-card .acoes-passo button { margin: 0; height: 26px; padding: 0 10px; border-radius: var(--r-md); font-size: 11.5px; font-weight: 600; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
  .qa-card .acoes-passo button.aprovar { background: var(--ok); color: var(--on-cor); border-color: transparent; }
  .qa-card .acoes-passo button:disabled, .qa-card .acoes-passo button.travado { opacity: .45; cursor: not-allowed; }
  .qa-card .sec { background: none; border: 1px solid var(--border); color: var(--text); font-weight: 400; margin-left: 4px; }
  .cens { margin: 0 12px 12px; display: flex; flex-direction: column; gap: 6px; }
  .cen { border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); font-size: 12px; }
  .cen summary { display: flex; gap: 8px; align-items: baseline; padding: 7px 10px; cursor: pointer; list-style: none; }
  .cen summary::-webkit-details-marker { display: none; }
  .cen .cid { font-weight: 700; color: var(--accent); flex: none; }
  .cen .ctit { flex: 1; min-width: 0; }
  .cen .cst { flex: none; font-size: 10px; padding: 0 6px; border-radius: var(--r-pill); border: 1px solid var(--border); color: var(--text-dim); }
  .cst.passou { color: var(--ok); border-color: var(--ok); } .cst.falhou { color: var(--danger); border-color: var(--danger); }
  .cst.desatualizado, .cst.bloqueado { color: var(--warn); border-color: var(--warn); } .cst.executando { color: var(--ia); border-color: var(--ia); }
  .cen .cdet { padding: 0 10px 10px; color: var(--text-dim); line-height: 1.5; }
  .cen .cdet pre { white-space: pre-wrap; font: inherit; margin: 6px 0; }
  .cen .cex { margin-top: 6px; } .cen .cex div { font-size: 11px; }
  .cen button { margin-top: 6px; height: 24px; padding: 0 9px; border: 1px solid var(--border); border-radius: var(--r-md); background: none; color: var(--text); cursor: pointer; }
  .cen.arq { opacity: .55; }
  .cevs { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
  .cev { width: 54px; height: 96px; border-radius: var(--r-md); overflow: hidden; background: var(--surface-2); display: flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 700; color: var(--text-dim); cursor: pointer; }
  .cex-vazio { font-size: 11px; color: var(--text-dim); margin: 2px 0 6px; }
  .cen .arquivo { display: inline-flex; gap: 2px; margin: 4px 0; }
  .cen .arquivo .fb-btn { margin: 0; height: 24px; border: 0; padding: 0 7px; background: transparent; }
  .cen .arquivo .fb-btn:hover { background: var(--surface-2); }
  .cev img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
</style>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// uri(arquivo) → endereço da webview (miniaturas das evidências).
function html(dir, uri = () => '') {
  const e = estado(dir), ult = versaoAtual(dir), rodando = qaRodando(dir);
  const plano = ult && `${esc(ult.subtarefa)} · v${ult.v}`;
  const abrir = ult ? `<div class="format-bar arquivo"><button class="fb-btn" data-painel="qaPlanoAbrir" title="${esc(path.join(dir, ult.arquivo))}">Abrir ${esc(ult.arquivo)}</button>`
    + '<button class="fb-btn" data-painel="qaPlanoMencionar" title="Mencionar no Claude">@</button></div>' : '';
  const lido = ult && e.lido === ult.v;
  const card = e.fase === 'sem_plano' || (e.fase === 'criando' && !rodando)
    ? `<div class="qa-card bloq"><b>Sem planejamento de QA</b><p>O QA só começa com o planejamento.${e.subtarefas?.length ? ` A subtarefa ${esc(e.subtarefas.join(', '))} não tem cenários.` : ''}
       O Claude cria a subtarefa e o plano no Jira com o jira-qa-planner.</p><button data-painel="qaCriarPlano">Criar planejamento</button></div>`
    : e.fase === 'criando' ? '<div class="qa-card"><b><span class="vivo-bola"></span>Criando o planejamento</b><p>O Claude está montando o plano no Jira. Ao terminar, a Crafting Table procura de novo.</p></div>'
    : e.fase === 'alterando' && rodando ? `<div class="qa-card"><b><span class="vivo-bola"></span>Aplicando sua mudança no planejamento</b><p>“${esc(e.pedido || '')}”. Ao terminar, a versão nova aparece aqui para aprovar.</p></div>`
    : ['plano_encontrado', 'alterando'].includes(e.fase) && ult ? `<div class="qa-card"><b>Planejamento encontrado · ${plano}</b><p>${esc(ult.resumo)} · ${cenariosDo(mdDaVersao(dir, ult)).length} cenário(s). Leia e aprove para listar os cenários.</p>
       ${abrir}${e.fase === 'alterando' ? '' : `<div class="acoes-passo"><button class="aprovar ${lido ? '' : 'travado'}" data-painel="qaPlanoAprovar" ${lido ? '' : 'disabled'}
         title="${lido ? 'Aprovar o planejamento e listar os cenários' : 'Abra o arquivo antes de aprovar: nunca aprove sem ler'}">Aprovar</button>
         <button data-painel="qaPlanoMudar" title="Descreva o ajuste: o Claude aplica na subtarefa do Jira e gera a versão nova">Pedir ajuste</button></div>`}</div>`
    : e.fase === 'plano_aprovado' && ult ? `<div class="qa-card"><b>Planejamento aprovado · ${plano}</b><p>${esc(ult.resumo)}</p>${abrir}</div>`
    : e.fase === 'erro' ? `<div class="qa-card bloq"><b>Não consegui conferir o planejamento</b><p>${esc(e.erro)}</p><button data-painel="qaPlay">Tentar de novo</button></div>`
    : !e.fase ? '<div class="qa-card"><b>QA não iniciado</b><p>Clique em ▶ no topo: a Crafting Table procura o planejamento de QA do ticket.</p></div>' : '';
  const aprovado = e.fase === 'plano_aprovado';
  // Plano já aprovado: o cartão dele desce para baixo do Ao vivo (em cima ficam execução e ambiente).
  // O ambiente fica só no rodapé do painel (status, log ao vivo e a análise do Claude num modal).
  return CSS + (aprovado ? '' : card) + (aprovado ? execucaoHtml(dir, e, rodando) : '')
    + maestro.caixaVivo(dir, rodando, 'qa') + (aprovado ? card + mapaHtml(dir, cenarios(dir), ambiente(dir), uri) : '');
}
function execucaoHtml(dir, e, rodando) {
  const r = cenarios(dir).cenarios.filter((c) => !c.arquivado), pend = fila({ cenarios: r }).length, feitos = r.filter((c) => RESULTADOS.includes(c.status)).length;
  const dono = donoAmbiente(), outro = dono && dono.chave !== e.chave ? ` O ambiente está com o ${esc(dono.chave)}.` : '';
  if (rodando) return `<div class="qa-card"><b><span class="vivo-bola"></span>QA em andamento</b><p>⏸ no topo pausa: o cenário em andamento é descartado e volta na retomada.</p></div>`;
  if (pend) return `<div class="qa-card"><b>${pend} cenário(s) na fila${e.execucao === 'pausado' ? ' · pausado' : ''}</b><p>Sobe API, Metro, emulador e app, confere a massa e executa um cenário por vez.${outro}</p>
    <button data-painel="qaIniciar">${e.execucao === 'pausado' ? 'Retomar' : feitos ? 'Continuar' : 'Dar início'}</button>
    ${feitos ? '<button class="sec" data-painel="qaPublicar" title="Comentário com o resultado e as evidências na subtarefa de QA (pede confirmação)">Publicar no Jira</button>' : ''}</div>`;
  return `<div class="qa-card"><b>Execução concluída</b><p>Nenhum cenário na fila. ↻ Refazer num cenário o coloca de volta.</p>
    ${feitos ? '<button class="sec" data-painel="qaPublicar" title="Comentário com o resultado e as evidências na subtarefa de QA (pede confirmação)">Publicar no Jira</button>' : ''}</div>`;
}
// Aba Massa (painel). Validade: estado 'valida' e medida depois do último refresh do banco.
function massaHtml(dir, hora = '06:00') {
  const m = massa(dir), agora = new Date(), ref = ultimoRefresh(agora, hora);
  const rot = (i) => (i.estado === 'valida' && !massaValida(i, agora, hora) ? ['Vencida', 'desatualizado'] : i.estado === 'valida' ? ['Válida', 'passou']
    : i.estado === 'consumida' ? ['Consumida', 'bloqueado'] : ['Inválida', 'falhou']);
  const linhas = m.itens.slice().reverse().map((i) => { const [r, cls] = rot(i); return `<div class="cen"><div class="cdet" style="padding-top:8px">
    <div><b class="cid">${esc(i.id)}</b> · ${esc(i.papel)} <span class="cst ${cls}">${r}</span></div>
    <div>Cenários: ${esc((i.cenarios || []).join(', ') || '—')} · medida ${esc(dataBr(i.medidaEm))}</div>
    <pre>${esc(Object.entries(i.dados || {}).map(([k, v]) => `${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n'))}</pre>
    ${i.consulta ? `<details><summary>Consulta</summary><pre>${esc(i.consulta)}</pre></details>` : ''}
    ${i.estado === 'valida' ? `<button data-acao="qaMassaEstado" data-id="${esc(i.id)}" data-op="invalida">Marcar inválida</button>` : `<button data-acao="qaMassaEstado" data-id="${esc(i.id)}" data-op="valida">Marcar válida</button>`}
    </div></div>`; }).join('');
  return `${CSS}<div class="qa-card"><b>Massa de dados</b><p>Vale até o refresh do banco (último: ${esc(dataBr(ref.toISOString()))}; horário em Configurações → craftingTable.qaHoraRefresh).
    O ▶ levanta massa só para cenários sem massa válida; a massa que um cenário altera vira consumida.</p>
    <button data-acao="qaMassaEditar" title="Abre o .massa.json no editor (cole ou corrija dados à mão)">Editar à mão</button></div>
    <div class="cens">${linhas || '<div class="vazio-aba">Nenhuma massa ainda. O ▶ do QA levanta a massa antes de executar os cenários.</div>'}</div>`;
}
const dataBr = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const IMG = /\.(png|jpe?g|gif|webp)$/i;
function mapaHtml(dir, r, amb, uri) {
  const ativos = r.cenarios.filter((c) => !c.arquivado), arq = r.cenarios.filter((c) => c.arquivado);
  if (!r.cenarios.length) return '';
  const feitos = ativos.filter((c) => c.status === 'passou').length;
  const miniatura = (f) => `<span class="cev" data-acao="abrir" data-nome="${esc(f)}" title="${esc(path.basename(f))}">${IMG.test(f) && uri(f) ? `<img src="${uri(f)}">` : esc(path.extname(f).slice(1).toUpperCase() || 'ARQ')}</span>`;
  // Expandido: resumo, pasta/copiar das evidências do cenário e cada execução com as suas evidências (todas, não só a última).
  const cartao = (c) => `<details class="cen ${c.arquivado ? 'arq' : ''}" data-cen="${esc(c.id)}"><summary><span class="cid">${esc(c.id)}</span><span class="ctit">${esc(c.titulo || '')}</span>
      <span class="cst ${esc(c.status)}">${c.arquivado ? 'Fora do plano' : esc(STATUS[c.status] || c.status)}</span></summary>
    <div class="cdet">${c.resumo ? `<pre>${esc(c.resumo)}</pre>` : `<pre>${esc((c.texto || '').slice(0, 600))}</pre>`}
      ${(c.execucoes || []).length ? `<div class="format-bar arquivo"><button class="fb-btn" data-acao="pastaCenario" data-nome="${esc(path.join(dir, 'evidencias', c.id))}" title="${esc(path.join(dir, 'evidencias', c.id))}">Abrir pasta</button>
        <button class="fb-btn" data-acao="copiarCenario" data-nome="${esc(path.join(dir, 'evidencias', c.id))}">Copiar caminho</button></div>
        <div class="cex">${c.execucoes.slice().reverse().map((x) => `<div>${esc(dataBr(x.inicio || x.em))} · ${esc(STATUS[x.status] || x.status)}${x.nota ? ` · ${esc(x.nota)}` : ''}`
          + `${x.sha && amb?.sha && (x.sha.backend !== amb.sha.backend || x.sha.mobile !== amb.sha.mobile) ? ' · <span class="cst desatualizado" title="O código mudou desde esta execução">build anterior</span>' : ''}</div>`
          + (arquivosDe(dir, x).length ? `<div class="cevs">${arquivosDe(dir, x).map(miniatura).join('')}</div>` : '<div class="cex-vazio">Sem evidências nesta execução.</div>')).join('')}</div>`
        : '<div class="cex"><div>Ainda não executado.</div></div>'}
      ${!c.arquivado && ['passou', 'falhou', 'desatualizado', 'bloqueado'].includes(c.status) ? `<button data-painel="qaRefazer" data-id="${esc(c.id)}">↻ Refazer</button>` : ''}</div></details>`;
  return `<div class="caixa-t">Cenários · plano v${r.planoVersao}<span>${feitos}/${ativos.length} passaram</span></div>
    <div class="cens">${ativos.map(cartao).join('')}${arq.map(cartao).join('')}</div>`;
}

module.exports = { statusAmbiente, analiseVista, resumoErroAmbiente, verificarPlano, aprovar, versaoAtual, promptCriar, promptMudanca, analisarAmbiente, gravarAnalise, LOG_AMB, FERRAMENTAS_PLANO, html, massaHtml, estado, mudar, cenarios, refazer, executar, pausar, rodando,
  concluirCenario, evidencia, arquivosDe, massa, massaAdd, massaEstado, massaValida, ambiente, donoAmbiente, INDICE, ESTADO, CENARIOS, MASSA, RESULTADOS,
  _teste: { papeisDe, ehQA, candidatas, temPlano, adfMd, versionar, procurar, cenariosDo, sincronizar, iniciarCenario, fila, ultimoRefresh, semMassa, promptCenario } };
