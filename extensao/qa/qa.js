// @ts-check
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const maestro = require('../painel/maestro');
const aoVivo = require('../componentes/ao-vivo');
const cardCenario = require('./card-cenario');
const caixaEtapas = require('../componentes/caixa-etapas');
const { dataBr } = cardCenario;
const { FC } = require('../infra/marca');

// Módulo QA (lista QA do painel). O ▶ roda tudo em ordem (executar): planejamento → mapa de cenários → ambiente → massa → um
// `claude -p` por cenário. Estado em arquivos da pasta qa/ do ticket, então pausar/retomar é só parar entre execuções.
// Fase 1: planejamento.
// A extensão acha o planejamento sozinha (1 chamada ao provedor, sem Claude): subtarefa de QA do ticket com cenários na descrição
// (convenção herdada do plugin fcx-qa-test-planning: "[QA] Planejamento dos Casos de Testes" / "[QA] Teste de Qualidade", CT01…).
// Cada versão diferente da descrição vira planejamento-qa-vN.md na pasta qa/ do ticket (aba Docs); o índice fica em .planejamento.json.
// Sem planejamento, o QA fica bloqueado até o Claude criar um (a IA escreve qa-plano.md em segundo plano e a extensão publica no provedor; o clique vale como OK).
const INDICE = '.planejamento.json';
// { fase: procurando | sem_plano | criando | erro | plano_encontrado (espera aprovação) | alterando | plano_aprovado, execucao: rodando | pausado | parado }
const ESTADO = '.qa.json';
const lerJson = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
// Atômico (tmp + rename): o qa-state do Claude e a extensão gravam os mesmos arquivos de processos diferentes e ninguém pode ler um arquivo pela metade.
const gravarJson = (arq, v) => { fs.mkdirSync(path.dirname(arq), { recursive: true }); fs.writeFileSync(`${arq}.${process.pid}.tmp`, JSON.stringify(v, null, 2)); fs.renameSync(`${arq}.${process.pid}.tmp`, arq); };

// "QA", "qa", "[QA]", "Q.A." como palavra (não pega "quadro", "aqa").
const ehQA = (resumo) => /(^|[^a-z0-9])q\.?a([^a-z0-9]|$)/i.test(resumo || '');
const NOMES = /^\[qa\]\s*(planejamento dos casos de testes|teste de qualidade)\s*$/i;
const PLANO = /planej|plano|planning|casos? de testes?|cen[aá]rio/i;
// Prioridade: nome da skill > QA de planejamento > qualquer QA.
const nota = (s) => (NOMES.test(s.resumo.trim()) ? 0 : PLANO.test(s.resumo) ? 1 : 2);
const candidatas = (subs) => subs.filter((s) => ehQA(s.resumo)).sort((a, b) => nota(a) - nota(b));
// Tem plano: cenários (CT01, CT-01) ou Gherkin. A descrição padrão de subtarefa recém-criada não conta.
const temPlano = (texto) => /\bCT-?\d+|\bdado que\b/i.test(texto || '');

// Subtarefas (filhos) do ticket com a descrição em Markdown: uma chamada só. filhos = (chave) => Promise<[{ key, resumo, updated, status, md }]>
// (o filhos do provedor, já autenticado).
async function procurar(filhos, chave) {
  const subs = await filhos(chave);
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
  fs.writeFileSync(path.join(dir, arquivo), `# Planejamento de QA · v${v}\n\nFonte: ${s.key} · ${s.resumo} · atualizado em ${s.updated}\n\n---\n\n${s.md}\n`);
  const nova = { v, arquivo, hash, subtarefa: s.key, resumo: s.resumo, jiraUpdated: s.updated, em: new Date().toISOString() };
  gravarJson(path.join(dir, INDICE), { ...ind, versoes: [...ind.versoes, nova] });
  return { ...nova, nova: true };
}

// ── Mapa de cenários (.cenarios.json): um item por CT do plano, com status e histórico de execuções.
// Plano novo: texto mudou → desatualizado (se já rodou) ; CT novo → pendente ; CT que saiu → arquivado (mantém o histórico).
const CENARIOS = '.cenarios.json';
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
  c.status = 'pendente'; delete c.dispensa;
  gravarJson(path.join(dir, CENARIOS), r);
  return true;
}

// ↻ Refazer (lote): os cenários que falharam ou ficaram bloqueados viram uma fila de perguntas (3 opções + outra resposta). Cada resposta
// devolve o cenário para a fila com a instrução do humano (c.instrucao), que o prompt de execução cita. Estado: .qa.json → refazerLote { ids, idx }.
const PARA_REFAZER = ['falhou', 'bloqueado'];
const opcoesRefazer = (c) => [
  'Refazer do jeito que está',
  'Refazer com massa nova (levantar de novo)',
  c.status === 'bloqueado' ? 'Refazer seguindo outro caminho na tela (descreva o bloqueio ao responder)' : 'Refazer conferindo com mais cuidado o resultado esperado',
];
const loteRefazer = (dir) => {
  const l = estado(dir).refazerLote;
  if (!l?.ids?.length) return null;
  const r = cenarios(dir), c = r.cenarios.find((x) => x.id === l.ids[l.idx || 0]);
  return c ? { ...l, idx: l.idx || 0, cenario: c, opcoes: opcoesRefazer(c) } : null;
};
function iniciarRefazerLote(dir) {
  const ids = cenarios(dir).cenarios.filter((c) => !c.arquivado && PARA_REFAZER.includes(c.status)).map((c) => c.id);
  if (!ids.length || estado(dir).execucao === 'rodando') return 0;
  mudar(dir, { refazerLote: { ids, idx: 0 } });
  return ids.length;
}
// Responde o cenário atual: instrução = texto da opção ou texto livre. Devolve { fim } quando era o último.
function responderRefazer(dir, instrucao) {
  const l = loteRefazer(dir), t = String(instrucao || '').trim();
  if (!l || !t) return null;
  const r = cenarios(dir), c = r.cenarios.find((x) => x.id === l.cenario.id);
  c.instrucao = t;
  gravarJson(path.join(dir, CENARIOS), r);
  refazer(dir, c.id);
  const fim = l.idx + 1 >= l.ids.length;
  mudar(dir, { refazerLote: fim ? null : { ids: l.ids, idx: l.idx + 1 } });
  return { fim, id: c.id };
}
const cancelarRefazerLote = (dir) => mudar(dir, { refazerLote: null });

// Não executado por decisão do usuário (Pedir ajuste / Excluir): sai da fila e não conta como pendente; guarda motivo, data e o tipo. ↻ Refazer devolve.
function dispensar(dir, id, motivo, tipo = 'excluir') {
  const r = cenarios(dir), c = r.cenarios.find((x) => x.id === id && !x.arquivado);
  if (!c || c.status === 'executando' || !String(motivo || '').trim()) return false;
  if (c.status !== 'dispensado') c.statusAntes = c.status;
  Object.assign(c, { status: 'dispensado', dispensa: { tipo, motivo: String(motivo).trim(), em: new Date().toISOString() } });
  gravarJson(path.join(dir, CENARIOS), r);
  return true;
}
// ── Execuções de um cenário. A extensão abre (iniciarCenario); o Claude fecha com `qa-state cenario CTnn concluir`.
// Evidências de cada execução em evidencias/CTnn/<id da execução>/.
const RESULTADOS = ['passou', 'falhou', 'bloqueado'];
const carimbo = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
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
// status: passou | falhou | bloqueado | descartado (pausa no meio: a execução fica no histórico e o cenário volta para a fila) |
// sem-massa (a massa da Etapa 4 não serve: o cenário volta para a fila e a extensão refaz a Etapa 4 antes de tentar de novo; não é falha).
const VOLTAM = ['descartado', 'sem-massa'];
function concluirCenario(dir, id, status, nota = '') {
  const r = cenarios(dir), c = r.cenarios.find((x) => x.id === id), ex = c?.execucoes?.at(-1);
  if (!c || c.status !== 'executando' || !ex) throw new Error(`${id} não está em execução`);
  if (![...RESULTADOS, ...VOLTAM].includes(status)) throw new Error(`status inválido: ${status} (use ${[...RESULTADOS, 'sem-massa'].join(', ')})`);
  if (status === 'passou') { const falta = faltaEvidencia(dir, c, ex); if (falta) throw new Error(falta); }
  Object.assign(ex, { status, nota, fim: new Date().toISOString() });
  c.status = VOLTAM.includes(status) ? (c.statusAntes || 'pendente') : status;
  delete c.statusAntes;
  gravarJson(path.join(dir, CENARIOS), r);
}
// Passou só com evidência anexada por `qa-state evidencia` nesta execução. Se a implementação grava em tabela (plano de mudança / implementacao.md),
// o cenário que cita a tabela precisa também da consulta SQL e do resultado dela.
const tabelasDe = (texto) => [...new Set([...String(texto).matchAll(/\btabela\s+[`"']?([A-Za-z_][\w.]*)[`"']?/gi)].map((m) => m[1].toLowerCase()).filter((n) => n.length > 2))];
function exigenciasDe(dir, c) {
  const raiz = path.dirname(dir);
  let tx = ''; for (const f of ['plano-mudanca.md', 'implementacao.md']) { try { tx += `\n${fs.readFileSync(path.join(raiz, 'impl', f), 'utf8')}`; } catch { /* sem implementação */ } }
  const gravam = tx.split('\n').filter((l) => /\b(grav|insert|registr|log|auditor|hist[óo]rico)/i.test(l));
  return tabelasDe(gravam.join('\n')).filter((tb) => `${c.titulo} ${c.texto}`.toLowerCase().includes(tb));
}
function faltaEvidencia(dir, c, ex) {
  const anexos = ex.anexos || [];
  if (!anexos.length) return `${c.id} não pode passar sem evidência: anexe prints, logs ou o resultado com qa-state evidencia ${c.id} <arquivo...> e conclua de novo`;
  const tabelas = exigenciasDe(dir, c);
  for (const tb of tabelas) {
    const sql = anexos.find((n) => /\.sql$/i.test(n) && fs.readFileSync(path.join(dir, ex.evidencias, n), 'utf8').toLowerCase().includes(tb));
    const res = anexos.find((n) => /resultado|result/i.test(n) && !/\.sql$/i.test(n));
    if (!sql || !res) return `${c.id} grava na tabela ${tb} (implementação): anexe a consulta SQL (arquivo .sql com a tabela) e o resultado dela (arquivo resultado-*.txt|csv) com qa-state evidencia ${c.id} <arquivo...>`;
  }
  return '';
}
// Cenário que ficou sem massa válida mesmo depois de refazer a Etapa 4: bloqueado, com a nota dizendo por quê (a execução já está fechada como sem-massa).
function bloquearSemMassa(dir, id, nota) {
  const r = cenarios(dir), c = r.cenarios.find((x) => x.id === id), ex = c?.execucoes?.at(-1);
  if (!c || !ex) return;
  c.status = 'bloqueado'; Object.assign(ex, { status: 'bloqueado', nota });
  gravarJson(path.join(dir, CENARIOS), r);
}
// Copia arquivos para a pasta da execução em andamento do cenário.
function evidencia(dir, id, arquivos) {
  const ex = cenarios(dir).cenarios.find((x) => x.id === id)?.execucoes?.at(-1);
  if (!ex || ex.status !== 'executando') throw new Error(`${id} não está em execução`);
  return arquivos.map((a) => {
    const nome = path.basename(a), destino = path.join(dir, ex.evidencias, nome);
    fs.copyFileSync(a, destino);
    const r = cenarios(dir), x = r.cenarios.find((y) => y.id === id)?.execucoes?.at(-1);
    if (x && !(x.anexos ||= []).includes(nome)) { x.anexos.push(nome); gravarJson(path.join(dir, CENARIOS), r); }
    return destino;
  });
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
// Sincronia Ao Vivo ↔ aba Massa: antes de tocar no banco, a sessão lê o que a aba já tem. Por cenário: `validas` (itens que ainda servem),
// `faltam` (sem massa válida: só esses podem ir ao banco) e `esgotadas` (a aba só tem massa já consumida: a busca no banco encerra, não se gera outra).
function sincronizarMassa(dir, ids, agora, hora) {
  const itens = massa(dir).itens, validas = {}, faltam = [], esgotadas = [];
  for (const id of ids) {
    const meus = itens.filter((i) => (i.cenarios || []).includes(id));
    validas[id] = meus.filter((i) => massaValida(i, agora, hora));
    if (validas[id].length) continue;
    faltam.push(id);
    if (meus.length && meus.every((i) => i.estado === 'consumida')) esgotadas.push(id);
  }
  return { validas, faltam, esgotadas };
}
function massaAdd(dir, { papel, cenarios: cens, dados, consulta = '', origem = 'consulta', desfazer = [] }) {
  const m = massa(dir), id = `M${m.itens.reduce((n, i) => Math.max(n, Number(i.id.slice(1)) || 0), 0) + 1}`;
  m.itens.push({ id, papel: papel || '', cenarios: cens || [], dados: dados || {}, consulta: consulta || '', medidaEm: new Date().toISOString(), estado: 'valida',
    ...(origem === 'sql' ? { origem, desfazer } : {}) });
  gravarJson(path.join(dir, MASSA), m);
  return id;
}
// A Etapa 4 marca `etapa: 'massa'` no estado enquanto levanta; o qa-state só aceita `massa add` nessa janela (a Execução só usa o que sobrou dela).
const emEtapaMassa = (dir) => estado(dir).etapa === 'massa';
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
// Skill de cada etapa (Configurações > Plugins, agentes/etapas.js; padrão: ~/.claude/skills/testes-funcionais): ambiente (preparo e diagnóstico) e execução (massa e cenários).
const vagas = require('../agentes/etapas');
const SKILL = () => vagas.pastaSkill('qa.execucao') || '';
const SKILL_AMB = () => vagas.pastaSkill('qa.ambiente') || '';
const scriptPreparo = (backend) => [path.join(backend, 'testes-funcionais', 'preparar-ambiente.py'), path.join(SKILL_AMB(), 'assets', 'backend', 'preparar-ambiente.py')].find((f) => fs.existsSync(f)) || null;
const shaDe = (repo) => { try { return repo ? execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { timeout: 5000 }).toString().trim() : null; } catch { return null; } };
const preparos = new Map(); // dir -> processo do preparar-ambiente (a pausa mata)
const LOG_AMB = '.ambiente.log'; // saída completa do último preparo (rodapé → Ambiente: log ao vivo; base da análise do Claude)
async function preparar(dir, chave, backend, d = {}) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
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
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const script = backend && scriptPreparo(backend);
  if (!script) {
    vivo('erro', backend ? 'Não achei o preparar-ambiente.py (nem no backend, nem na skill testes-funcionais)' : 'Sem repositório backend configurado (Configurações → repositórios)');
    const erro = backend ? `preparar-ambiente.py não encontrado em ${path.join(backend, 'testes-funcionais')} nem em ${path.join(SKILL_AMB(), 'assets', 'backend')}`
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
      // Limite: ticket por documento (DOC-001) não tem branch nem refs; a skill procura por chave e para em 'refs'. Sem script que aceite isso, vale os Comandos.
      if (amb.parou_em && ehLocal(dir) && (amb.parou_em === 'refs' || /chave|branch|\bref/i.test(amb.erro || ''))) amb.erro = 'o ticket por documento não tem branch: use os Comandos do ambiente em Configurações ou ajuste a skill';
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
  const vivo = (tipo, texto) => { aoVivo.anotar(dir, { tipo, texto }); fs.appendFileSync(path.join(dir, LOG_AMB), `[${new Date().toLocaleTimeString('pt-BR')}] ${texto}\n`); };
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
const QA_STATE = path.join(__dirname, 'qa-state');
// Falta informação que só o humano tem (qual usuário, regra ambígua) e nenhuma fonte responde: o Claude PERGUNTA (qa-state pausa) em vez de inventar.
// A extensão mostra a pergunta no cartão e retoma com a resposta (.respostas.md).
const REGRAS = 'Modo não interativo, sem ninguém para aprovar permissões. Não invente dado nem regra: o que não consta nas fontes você pergunta. '
  + `Para perguntar ao humano: ${QA_STATE} pausa --motivo "<curto>" --pergunta "<o que falta, em uma frase>" [--opcoes "A|B"] e TERMINE em seguida, sem concluir o cenário. `
  + 'Bloqueio de fluxo ou tela, falha de ambiente ou de ferramenta: NÃO conclua nem pule o cenário. Pause com o qa-state (pausa, descrevendo o bloqueio: tela, passo e o que viu) e TERMINE: o humano é avisado e instrui. Zero skip. '
  + 'Proibido: escrever no banco por conta própria (INSERT/UPDATE/DELETE/DDL, liberar usuário ou permissão; a alteração de massa só vai por qa-state massa proposta, que o humano aprova antes de rodar), publicar no provedor, commit, push, merge e rebase. '
  + `Grave tudo do QA com ${QA_STATE} (a pasta ~/.claude é bloqueada para escrita).`;
const RESPOSTAS = '.respostas.md', PAUSA = '.pausa.json';
const citarRespostas = (dir) => (fs.existsSync(path.join(dir, RESPOSTAS)) ? `\nRespostas do humano a perguntas anteriores (use-as): ${path.join(dir, RESPOSTAS)}` : '');
const citarDossie = (dir) => (fs.existsSync(path.join(dir, 'dossie.md')) ? `\nDossiê do ticket (fontes, confiança e lacunas): ${path.join(dir, 'dossie.md')}` : '');
const promptMassa = (chave, cens, dir = '', banco = '', mapa = '', escreve = false, naAba = []) => `[segundo plano · Crafting Table · QA de ${chave}] Levante a massa de dados para estes cenários, seguindo o método `
  + `de massa da skill testes-funcionais (${SKILL()}/SKILL.md; consultas só de leitura na cópia de produção):${vagas.aviso('qa.execucao')}${citarRespostas(dir)}${citarDossie(dir)}\n`
  + `Banco: ${banco || 'NÃO configurado: não consulte banco; registre como pendência'}${mapa ? `. Consulte SOMENTE por ${mapa}/bin/mapa-db (SELECT, máx. 50 linhas, colunas sensíveis mascaradas)` : ''}.\n`
  + (escreve ? `Se não existir registro que sirva, MONTE a massa ajustando os dados: leia antes, por SELECT, os valores originais e PROPONHA o lote com ${QA_STATE} massa proposta --papel "<papel>" --cenarios CT01 `
    + `--dados '<json do registro que vai ficar>' --sql "<INSERT/UPDATE/DELETE separados por ;>" --desfazer "<instruções que devolvem os valores originais>" --porque "<por que esse ajuste>". `
    + 'Você NÃO executa escrita: a extensão roda o lote depois que o humano ler e aprovar; proposta recusada ou sem WHERE por chave volta com o motivo. TERMINE em seguida. '
    + 'Mexa no mínimo de registros e nunca em registro que outro cenário usa.\n' : '')
  + cens.map((c) => `- ${c.id} · ${c.titulo}${c.resumo ? ` (${c.resumo})` : ''}`).join('\n')
  + (naAba.length ? `\nJá válidos na aba Massa (NÃO consulte nem registre de novo estes registros; escolha outros): ${JSON.stringify(naAba.map((i) => ({ id: i.id, papel: i.papel, cenarios: i.cenarios })))}.` : '')
  + `\nPara cada papel encontrado: ${QA_STATE} massa add --papel "<papel>" --cenarios CT01,CT02 --dados '<json com os campos>' --consulta "<SQL usado>". `
  + 'Traga 2 registros por papel quando der (reserva: um cenário pode consumir o registro). Cenário que não precisa de massa: não registre nada. '
  + `Se o banco não responder, termine dizendo isso. ${REGRAS}`;
const promptCenario = (chave, c, amb, itens, dir = '', exige = []) => `[segundo plano · Crafting Table · QA de ${chave}] Execute SÓ o cenário ${c.id} do planejamento de QA, `
  + `seguindo o método da skill testes-funcionais (${SKILL()}/SKILL.md).${vagas.aviso('qa.execucao')}${citarRespostas(dir)}${citarDossie(dir)}\n\nCenário ${c.id} · ${c.titulo}\n${c.texto}\n\n`
  + (c.instrucao ? `INSTRUÇÃO DO HUMANO para esta nova tentativa (siga): ${c.instrucao}\n\n` : '')
  + `Ambiente já preparado (não rode preparar-ambiente): backend ${amb.backend || '?'} · mobile ${amb.mobile || '?'} · ref ${amb.ref || '?'} · API http://localhost:5111 · Metro 8081 · emulador ligado.\n`
  + `Massa válida para este cenário: ${itens.length ? JSON.stringify(itens.map((i) => ({ id: i.id, papel: i.papel, dados: i.dados }))) : 'nenhuma registrada'}. `
  + `Use SÓ essa massa (a da Etapa 4): nunca procure nem registre massa nova (massa add é recusado aqui). Antes de usar, confira que o registro ainda está no estado esperado; `
  + `se não estiver, ${QA_STATE} massa <ID> invalida e use outro item válido da lista; se não houver outro, NÃO falhe o cenário: conclua com --status sem-massa --nota "<o que mudou no registro>" `
  + `(a extensão refaz o levantamento e volta aqui). Cenário que não precisa de massa segue sem ela. `
  + `Se o cenário alterar o registro, ${QA_STATE} massa <ID> consumida.\n`
  + `Evidências (OBRIGATÓRIAS para passou: a extensão recusa passou sem ao menos um arquivo anexado): a tela do emulador já está sendo gravada; anexe também prints e arquivos de resultado (log Robot, junit, relatório): ${QA_STATE} evidencia ${c.id} <arquivo...>.\n`
  + (exige.length ? `Este cenário exercita gravação em tabela (${exige.join(', ')}) da implementação: anexe a consulta SQL (arquivo .sql com o nome da tabela) e o resultado dela (arquivo resultado-<tabela>.txt ou .csv), consultando só por SELECT.\n` : '')
  + `OBRIGATÓRIO ao final: ${QA_STATE} cenario ${c.id} concluir --status passou|falhou|sem-massa --nota "<1 frase: o que foi visto>". ${REGRAS}`;
// Pré-condição (antes da suíte, fora da lista de cenários): confirma que a aplicação subiu, que a rede responde e que o login abre sessão autenticada.
const promptPreCondicao = (chave, amb, dir = '') => `[segundo plano · Crafting Table · QA de ${chave}] PRÉ-CONDIÇÃO da suíte (Health Check e Autenticação), antes de qualquer cenário. `
  + `Use o método da skill testes-funcionais (${SKILL()}/SKILL.md).${vagas.aviso('qa.execucao')}${citarRespostas(dir)}\n`
  + `Ambiente: backend ${amb.backend || '?'} · mobile ${amb.mobile || '?'} · API http://localhost:5111 · Metro 8081 · emulador ligado.\n`
  + '1) Health check: a aplicação (API e app) subiu e responde. 2) Rede: uma requisição real à API volta com resposta válida. '
  + '3) Autenticação: faça o login com o usuário de teste da skill (credenciais do ambiente, nunca as mostre) e CONFIRME a sessão autenticada (tela pós-login ou token/usuário na resposta). '
  + 'Não execute cenário nenhum e não altere dado. '
  + `OBRIGATÓRIO ao final: ${QA_STATE} precondicao --status ok|falhou --nota "<1 frase: o que foi confirmado, ou o motivo exato da falha>". ${REGRAS}`;
const FERRAMENTAS_EXEC = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill'];
// Massa: só leitura do código, as consultas pelo mapa-db (SELECT, recusa produção, log e máscara) e o qa-state para gravar. Sem Bash livre.
const FERRAMENTAS_MASSA = (mapa) => ['Read', 'Glob', 'Grep', `Bash(${QA_STATE}:*)`, ...(mapa ? [`Bash(${mapa}/bin/mapa-db:*)`] : []),
  'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(grep:*)'];
// Nunca na execução do QA, qualquer que seja a etapa: o prompt pede, a extensão garante (--disallowedTools).
const PROIBIDAS = ['Bash(git commit:*)', 'Bash(git push:*)', 'Bash(git merge:*)', 'Bash(git rebase:*)', 'Bash(git reset:*)', 'Bash(git clean:*)', 'Bash(git tag:*)'];
// Ambiente parou: o Claude lê o log e o diagnóstico da skill (só leitura) e grava a análise com `qa-state analise`.
const promptAnalise = (chave, dir, a) => `[segundo plano · Crafting Table · QA de ${chave}] O preparo do ambiente de testes (preparar-ambiente.py da skill `
  + `testes-funcionais) parou na etapa "${a.parou_em}"${a.erro ? ` (${a.erro})` : ''}. Descubra por quê.\nLog completo do preparo: ${path.join(dir, LOG_AMB)}\n`
  + `Use o diagnóstico da skill: ${SKILL_AMB()}/references/diagnostico.md e ${SKILL_AMB()}/references/ambiente-execucao.md. `
  + vagas.aviso('qa.ambiente')
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

// Claude em segundo plano até terminar (maestro.rodar). d.extras/d.aoMudar vêm do painel. Resolve { estourou, erro } (limite de tempo: d.timeoutMin; erro: is_error/saída com código do Claude, ex.: limite de tokens ou API fora).
const claude = (dir, opts, d) => new Promise((ok) => {
  let estourou = false, timer = null;
  const fim = () => { clearTimeout(timer); ok({ estourou, erro: maestro.erroDe?.(dir) || null }); };
  const foi = maestro.rodar(dir, { ferramentas: FERRAMENTAS_EXEC, proibidas: PROIBIDAS, ...opts, env: { QA_DIR: dir, ...(opts.env || {}) }, extras: [...(d.extras || []), ...(opts.extras || [])],
    aoMudar: () => { d.aoMudar?.(); if (!maestro.rodando(dir)) fim(); } });
  if (!foi) return fim();
  if (d.timeoutMin > 0) timer = setTimeout(() => { estourou = true; aoVivo.anotar(dir, { tipo: 'aviso', texto: `Passou de ${d.timeoutMin} min: parando o Claude` }); maestro.parar(dir); }, d.timeoutMin * 60000);
});
// Pausa de verdade, pedida pelo Claude (qa-state pausa → .pausa.json) ou pela extensão (briefing): fica em .qa.json e aparece como pergunta no cartão.
const pausaPendente = (dir) => { const p = lerJson(path.join(dir, PAUSA), null); return p?.pergunta ? { motivo: String(p.motivo || ''), pergunta: String(p.pergunta), opcoes: Array.isArray(p.opcoes) ? p.opcoes.map(String) : [], etapa: p.etapa || '', detalhe: p.detalhe ? String(p.detalhe) : '' } : null; };
function registrarPausa(dir, { motivo = '', pergunta, opcoes = [], etapa = '', detalhe = '' }) {
  if (!String(pergunta || '').trim()) throw new Error('a pergunta é obrigatória');
  gravarJson(path.join(dir, PAUSA), { motivo, pergunta: String(pergunta).trim(), opcoes, etapa, detalhe, em: new Date().toISOString() });
}
// A extensão, ao ver o .pausa.json depois da etapa: tira da pasta e guarda no estado; execução vira pausado até a resposta.
function absorverPausa(dir) {
  const p = pausaPendente(dir);
  if (!p) return null;
  fs.rmSync(path.join(dir, PAUSA), { force: true });
  mudar(dir, { pausa: p, execucao: 'pausado' });
  aoVivo.anotar(dir, { tipo: 'aviso', texto: `O Claude perguntou: ${p.pergunta}` });
  return p;
}
// ── Pré-condição (Health Check e Autenticação): roda antes da suíte e fora da lista de cenários. Só com tudo ok a suíte começa.
// A etapa marca `etapa: 'precondicao'` no estado enquanto roda; o qa-state precondicao só vale nela. Estado: { status: verificando | ok | falhou, motivo, em }.
const emPreCondicao = (dir) => estado(dir).etapa === 'precondicao';
function registrarPreCondicao(dir, status, nota) {
  if (!['ok', 'falhou'].includes(status)) throw new Error('status inválido: use ok ou falhou');
  if (!String(nota || '').trim()) throw new Error('a nota é obrigatória (o que foi confirmado ou o motivo da falha)');
  mudar(dir, { precondicao: { status, motivo: String(nota).trim(), em: new Date().toISOString() } });
}
// Aplicação no ar e rede respondendo, sem Claude: portas da API e do Metro abertas e a API devolvendo qualquer resposta HTTP. { ok, motivo }.
async function healthCheck() {
  for (const p of Object.values(PAPEIS)) if (!(await portaAberta(p.porta))) return { ok: false, motivo: `${p.nome} não responde na porta ${p.porta}` };
  const http = require('http');
  const resp = await new Promise((ok) => {
    const rq = http.get({ host: '127.0.0.1', port: PAPEIS.api.porta, path: '/', timeout: 5000 }, (r) => { r.resume(); ok(true); });
    rq.on('timeout', () => { rq.destroy(); ok(false); }); rq.on('error', () => ok(false));
  });
  return resp ? { ok: true } : { ok: false, motivo: `A API (porta ${PAPEIS.api.porta}) aceita conexão mas não responde requisição` };
}
// true = pode começar a suíte. false = já tratado aqui (falha com o motivo, ou pausa por erro de API do Claude): quem chamou só retorna.
async function preCondicao(dir, d, amb) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  vivo('etapa', 'QA · Pré-condição (Health Check e Autenticação)');
  mudar(dir, { precondicao: { status: 'verificando', em: new Date().toISOString() }, etapa: 'precondicao' });
  const falhar = (motivo) => {
    mudar(dir, { precondicao: { status: 'falhou', motivo, em: new Date().toISOString() }, etapa: null });
    vivo('erro', `Pré-condição falhou: ${motivo}. A suíte não foi iniciada`);
    d.alertar?.(`Pré-condição do QA falhou: ${motivo}. Nenhum cenário foi iniciado.`); d.avisar?.(`pré-condição falhou: ${motivo}`);
    return false;
  };
  try {
    vivo('acao', 'Health check: API, Metro e resposta de rede');
    const h = await (d.healthCheck || healthCheck)(amb);
    if (!h.ok) return falhar(h.motivo || 'health check sem resposta');
    vivo('acao', 'Login com o usuário de teste e confirmação da sessão autenticada');
    const { estourou, erro } = await claude(dir, { prompt: promptPreCondicao(d.chave, amb, dir), titulo: 'QA · Pré-condição · login', cwd: amb.backend || d.backend }, d);
    if (pausado(dir)) { mudar(dir, { precondicao: null }); return false; }
    const p = estado(dir).precondicao;
    if (p?.status === 'ok') { vivo('fim', `Pré-condição ok: ${p.motivo}`); return true; }
    if (erro && !p?.motivo) return pausarPorApi(dir, d, erro, null);
    return falhar(p?.status === 'falhou' ? p.motivo : estourou ? `O login passou de ${d.timeoutMin} min sem confirmar a sessão` : 'O Claude terminou sem confirmar a sessão autenticada');
  } finally { if (emPreCondicao(dir)) mudar(dir, { etapa: null }); }
}
// ── Zero skip: nenhum cenário é pulado. Bloqueio de fluxo/tela pausa NO cenário (volta à fila, mesma posição), abre o diálogo e espera o humano.
// Falta de tokens ou erro da API do Claude pausa a fila no ponto exato; o estado fica nos arquivos e a retomada segue do mesmo cenário.
function bloquearFluxo(dir, d, c, motivo) {
  const x = cenarios(dir).cenarios.find((y) => y.id === c.id), nota = `Bloqueio: ${motivo}`;
  if (x?.status === 'executando') concluirCenario(dir, c.id, 'descartado', nota);
  else if (x?.status === 'bloqueado') reabrirBloqueado(dir, c.id, nota); // o Claude concluiu como bloqueado: volta para a fila, não fica como resultado
  const pergunta = `${c.id} ficou bloqueado: ${motivo}. A fila parou neste cenário (nenhum é pulado). Resolva o bloqueio e responda para retomar.`;
  mudar(dir, { pausa: { motivo: 'bloqueio', pergunta, opcoes: ['Tentar de novo'], etapa: 'Execução', detalhe: motivo }, execucao: 'pausado' });
  aoVivo.anotar(dir, { tipo: 'aviso', texto: `${c.id} bloqueado (${motivo}): QA pausado neste cenário, aguardando instrução` });
  d.alertar?.(`${c.id} · ${c.titulo}\n\nBloqueio: ${motivo}\n\nO QA pausou neste cenário e aguarda a sua instrução.`);
}
function reabrirBloqueado(dir, id, nota) {
  const r = cenarios(dir), c = r.cenarios.find((x) => x.id === id), ex = c?.execucoes?.at(-1);
  if (!c || c.status !== 'bloqueado') return;
  c.status = 'pendente'; if (ex) Object.assign(ex, { status: 'descartado', nota: `${ex.nota ? `${ex.nota} · ` : ''}${nota}` });
  gravarJson(path.join(dir, CENARIOS), r);
}
// Erro de API/tokens do Claude: o cenário em andamento volta à fila e a fila pausa; `interrupcao` no estado diz onde parou. Sempre devolve false.
function pausarPorApi(dir, d, erro, c) {
  if (c && cenarios(dir).cenarios.find((x) => x.id === c.id)?.status === 'executando') concluirCenario(dir, c.id, 'descartado', `Erro da API do Claude: ${erro}`);
  mudar(dir, { execucao: 'pausado', etapa: null, interrupcao: { motivo: 'api-claude', cenario: c?.id || null, detalhe: String(erro).slice(0, 300), em: new Date().toISOString() } });
  aoVivo.anotar(dir, { tipo: 'erro', texto: `Claude indisponível (${String(erro).slice(0, 120)}): fila pausada${c ? ` em ${c.id}` : ''}; retome quando voltar` });
  d.alertar?.(`O Claude parou por erro de API ou falta de tokens:\n${String(erro).slice(0, 200)}\n\nA fila foi pausada${c ? ` em ${c.id}` : ''} e nenhum cenário seguinte foi pulado. Retome quando voltar.`);
  return false;
}
// ── Massa por SQL: a IA PROPÕE o lote (qa-state massa proposta); você lê e aprova no cartão; a extensão executa numa transação só e registra a massa.
// Nada de escrita sai da IA: só o lote aprovado, pela conexão configurada, nunca produção. O SQL de desfazer fica no item da massa.
const PROPOSTA = '.massa-proposta.json', LOG_SQL = '.massa-sql.log.jsonl';
const propostaMassa = (dir) => lerJson(path.join(dir, PROPOSTA), null);
function proporMassa(dir, { papel, cenarios: cens = [], dados = {}, sql, desfazer, porque = '' }) {
  const b = require('../infra/banco'), v = b.validarAlteracao(sql), u = b.validarAlteracao(desfazer);
  if (!v.ok) throw new Error(`--sql recusado: ${v.erro}`);
  if (!u.ok) throw new Error(`--desfazer obrigatório e válido: ${u.erro}`);
  if (!cens.length) throw new Error('--cenarios é obrigatório');
  const p = { papel: papel || '', cenarios: cens, dados, sql: v.stmts, desfazer: u.stmts, porque: String(porque).trim(), em: new Date().toISOString() };
  gravarJson(path.join(dir, PROPOSTA), p);
  registrarPausa(dir, { motivo: 'massa-sql', pergunta: `Alterar o banco para montar a massa de ${cens.join(', ')}? Leia o SQL abaixo antes de aprovar.`, opcoes: ['Aprovar e executar', 'Recusar'], etapa: 'Massa', detalhe: p.porque });
  return p;
}
const logSql = (dir, o) => { try { fs.appendFileSync(path.join(dir, LOG_SQL), `${JSON.stringify({ em: new Date().toISOString(), ...o })}\n`); } catch { /* o log não derruba o fluxo */ } };
/** Executa o lote aprovado. d: { banco, executarSql(banco, stmts) }. Erro: nada é gravado (rollback) e a pausa vira pergunta com as saídas. */
async function aplicarProposta(dir, d) {
  const p = propostaMassa(dir);
  if (!p) return { ok: false, erro: 'não há proposta de massa' };
  const b = d.banco || {}, vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const r = await (d.executarSql || require('../infra/banco').executar)(b, p.sql);
  logSql(dir, { tipo: 'aplicar', conexao: b.conexao || '', ambiente: b.ambiente || '', cenarios: p.cenarios, sql: p.sql, desfazer: p.desfazer, ok: r.ok, saida: String(r.saida || '').slice(0, 500) });
  if (!r.ok) {
    vivo('erro', `A alteração de massa falhou (nada foi gravado): ${String(r.saida).split('\n')[0].slice(0, 160)}`);
    mudar(dir, { pausa: { motivo: 'massa-sql-erro', pergunta: `O banco recusou o lote e nada foi gravado: ${String(r.saida).slice(0, 300)}`, opcoes: ['Tentar de novo', 'Seguir sem essa massa'], etapa: 'Massa' } });
    return { ok: false, erro: r.saida };
  }
  const id = massaAdd(dir, { papel: p.papel, cenarios: p.cenarios, dados: p.dados, consulta: p.sql.join(';\n'), origem: 'sql', desfazer: p.desfazer });
  fs.rmSync(path.join(dir, PROPOSTA), { force: true });
  mudar(dir, { pausa: null });
  vivo('fim', `Massa ${id} montada por SQL (${p.sql.length} instrução(ões)) para ${p.cenarios.join(', ')}; o SQL de desfazer está na aba Massa`);
  return { ok: true, id };
}
function recusarProposta(dir) {
  fs.rmSync(path.join(dir, PROPOSTA), { force: true });
  logSql(dir, { tipo: 'recusar' });
  mudar(dir, { pausa: null });
}
/** Desfaz a alteração de um item de massa montado por SQL (o humano confirma antes). */
async function desfazerMassa(dir, id, d) {
  const m = massa(dir), i = m.itens.find((x) => x.id === id);
  if (!i?.desfazer?.length) throw new Error(`massa ${id} não tem SQL de desfazer`);
  const r = await (d.executarSql || require('../infra/banco').executar)(d.banco || {}, i.desfazer);
  logSql(dir, { tipo: 'desfazer', massa: id, sql: i.desfazer, ok: r.ok, saida: String(r.saida || '').slice(0, 500) });
  if (!r.ok) throw new Error(String(r.saida).split('\n')[0].slice(0, 200) || 'o banco recusou');
  massaEstado(dir, id, 'invalida');
  return true;
}
// Resposta do humano: vai para .respostas.md (os prompts citam) e libera a retomada.
function responder(dir, resposta) {
  const e = estado(dir), r = String(resposta || '').trim();
  if (!e.pausa || !r) return false;
  fs.appendFileSync(path.join(dir, RESPOSTAS), `## ${e.pausa.etapa || 'QA'} · ${e.pausa.pergunta}\n${r}\n\n`);
  mudar(dir, { pausa: null });
  return true;
}

// Etapa 4: o Claude levanta massa para os cenários dados. `etapa: 'massa'` no estado libera o `qa-state massa add` só durante ela.
// Trava de banco: relê a aba antes; só vai ao banco quem não tem massa válida lá, e cenário com a massa da aba toda consumida encerra a busca.
async function levantarMassa(dir, d, amb, cens) {
  const sync = sincronizarMassa(dir, cens.map((c) => c.id), new Date(), d.horaRefresh);
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const naAba = Object.values(sync.validas).flat();
  const busca = cens.filter((c) => sync.faltam.includes(c.id) && !sync.esgotadas.includes(c.id));
  if (sync.esgotadas.length) vivo('aviso', `Massa da aba toda consumida para ${sync.esgotadas.join(', ')}: busca no banco encerrada`);
  if (!busca.length) { if (!sync.faltam.length) vivo('fim', 'Aba Massa já tem massa válida para os cenários: banco não consultado'); return { ok: true, travado: true }; }
  cens = busca;
  mudar(dir, { etapa: 'massa' });
  const b = d.banco, liberado = b && require('../infra/banco').liberado(b), mapa = liberado ? vagas.raiz('impl.mapa') || '' : '';
  const opts = { prompt: promptMassa(d.chave, cens, dir, b ? require('../infra/banco').texto(b) : '', mapa, liberado, naAba), titulo: 'QA · Levantando massa de dados', cwd: amb.backend || d.backend,
    ferramentas: FERRAMENTAS_MASSA(mapa), env: { ...(mapa ? require('../infra/banco').env(b, dir) : {}), ...(liberado ? { QA_BANCO_ESCRITA: '1' } : {}) } };
  try { return await claude(dir, opts, d); } finally { mudar(dir, { etapa: null }); }
}
// ▶ do QA: tudo em ordem (ambiente → pré-condição → massa → cenários, zero skip). d = { chave, backend, api, horaRefresh, extras, aoMudar, confirmar(texto) → bool, alertar(texto) (diálogo de bloqueio/falha), healthCheck(amb) → { ok, motivo }, gravarTela(dir), pararTela(), avisar(texto) }.
const ativos = new Set();
const pausado = (dir) => estado(dir).execucao === 'pausado';
async function executar(dir, d) {
  if (rodando(dir)) return;
  if (estado(dir).pausa) return aoVivo.anotar(dir, { tipo: 'aviso', texto: `Responda a pergunta antes de retomar: ${estado(dir).pausa.pergunta}` });
  reconciliar(dir);
  ativos.add(dir); mudar(dir, { execucao: 'rodando', host: process.pid, interrupcao: null }); d.aoMudar?.();
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
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
    if (!(await preCondicao(dir, d, amb))) return; // falhou (motivo reportado) ou pausou: a suíte não começa
    const agora = new Date(), falta = semMassa(dir, pend.map((c) => c.id), agora, d.horaRefresh);
    vivo('etapa', 'QA · Massa de dados');
    if (falta.length) {
      vivo('acao', `Sem massa válida para ${falta.join(', ')} (refresh do banco às ${d.horaRefresh || '06:00'}): levantando`);
      const rm = await levantarMassa(dir, d, amb, pend.filter((c) => falta.includes(c.id)));
      if (absorverPausa(dir) || pausado(dir)) return;
      if (rm.erro && semMassa(dir, pend.map((c) => c.id), new Date(), d.horaRefresh).length) return pausarPorApi(dir, d, rm.erro, null);
    } else vivo('fim', 'Massa de hoje ainda válida: reaproveitada');
    const retentou = new Set(); // cenários que já voltaram à Etapa 4 nesta rodada (1 volta por cenário; na 2ª pausa pedindo instrução, nunca pula)
    while (!pausado(dir) && (pend = fila(cenarios(dir))).length) {
      const c = pend[0], ex = iniciarCenario(dir, c.id, amb.sha);
      const itens = massa(dir).itens.filter((i) => (i.cenarios || []).includes(c.id) && massaValida(i, new Date(), d.horaRefresh));
      d.gravarTela?.(path.join(dir, ex.evidencias));
      const exige = exigenciasDe(dir, c);
      const { estourou, erro } = await claude(dir, { prompt: promptCenario(d.chave, c, amb, itens, dir, exige), titulo: `QA · ${c.id} · ${c.titulo}`, cwd: amb.backend || d.backend }, d);
      d.pararTela?.();
      if (cenarios(dir).cenarios.find((x) => x.id === c.id)?.status === 'executando' && absorverPausa(dir)) {
        concluirCenario(dir, c.id, 'descartado', 'O Claude perguntou antes de concluir: volta à fila depois da resposta');
        return;
      }
      const statusAgora = () => cenarios(dir).cenarios.find((x) => x.id === c.id)?.status;
      if (pausado(dir)) { if (statusAgora() === 'executando') { concluirCenario(dir, c.id, 'descartado', 'QA pausado no meio do cenário'); vivo('aviso', `${c.id} descartado (pausa no meio): volta da fila na retomada`); } return; }
      // Erro de API/tokens do Claude sem resultado registrado: pausa a fila neste cenário, sem pular os seguintes.
      if (erro && statusAgora() === 'executando') return pausarPorApi(dir, d, erro, c);
      // Zero skip: tempo estourado ou bloqueio relatado pelo Claude não pulam o cenário; pausa nele e espera o humano.
      if (estourou && statusAgora() === 'executando') return bloquearFluxo(dir, d, c, `passou de ${d.timeoutMin} min sem concluir`);
      if (statusAgora() === 'bloqueado') return bloquearFluxo(dir, d, c, cenarios(dir).cenarios.find((x) => x.id === c.id).execucoes.at(-1)?.nota || 'bloqueio informado pelo Claude');
      if (cenarios(dir).cenarios.find((x) => x.id === c.id)?.status === 'executando' && itens.length && semMassa(dir, [c.id], new Date(), d.horaRefresh).length) {
        concluirCenario(dir, c.id, 'sem-massa', 'Massa invalidada e o Claude não registrou o resultado'); // invalidou tudo e parou: é falta de massa, não falha
      }
      if (cenarios(dir).cenarios.find((x) => x.id === c.id)?.execucoes?.at(-1)?.status === 'sem-massa') {
        if (pausado(dir)) continue;
        if (retentou.has(c.id)) { return bloquearFluxo(dir, d, c, 'sem massa válida mesmo depois de refazer a Etapa 4 (levante a massa na aba Massa e responda para tentar de novo)'); }
        retentou.add(c.id);
        vivo('aviso', `Etapa 5 → voltando para a Etapa 4: massa de ${c.id} inválida`); vivo('etapa', 'QA · Massa de dados');
        const r4 = await levantarMassa(dir, d, amb, [c]);
        if (absorverPausa(dir)) return;
        if (r4.erro && !pausado(dir) && semMassa(dir, [c.id], new Date(), d.horaRefresh).length) return pausarPorApi(dir, d, r4.erro, c);
        if (!pausado(dir) && semMassa(dir, [c.id], new Date(), d.horaRefresh).length) return bloquearFluxo(dir, d, c, 'a Etapa 4 não achou massa válida para o cenário');
        else vivo('fim', `Etapa 4 refeita para ${c.id}: retomando a Etapa 5`);
        vivo('etapa', 'QA · Execução');
        continue;
      }
      if (cenarios(dir).cenarios.find((x) => x.id === c.id)?.status === 'executando') {
        return bloquearFluxo(dir, d, c, 'o Claude terminou sem registrar o resultado');
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
// Decisão do usuário no QA -> aba Decisões (mesmo .decisoes.json do Ao vivo). extra: { ticket, motivo, ... } vai em detalhes. Falha não derruba o fluxo.
function registrarDecisao(dir, texto, extra = {}) {
  try {
    const arq = path.join(dir, '.decisoes.json');
    let lista = []; try { lista = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch {}
    if (!Array.isArray(lista)) lista = [];
    const { ticket, ...resto } = extra || {};
    lista.push({ id: crypto.randomBytes(6).toString('hex'), data: new Date().toISOString(), origem: 'usuario', titulo: String(texto).slice(0, 90), resumo: `${ticket ? `${ticket} · ` : ''}${texto}`, detalhes: { ticket: ticket || '', ...resto } });
    fs.writeFileSync(`${arq}.tmp`, JSON.stringify(lista, null, 1)); fs.renameSync(`${arq}.tmp`, arq);
  } catch {}
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

// Rodada que morreu sem o finally (janela fechada, crash): estado diz rodando mas ninguém roda. Vira parado e o cenário preso volta à fila.
function reconciliar(dir) {
  if (rodando(dir)) return false;
  const e = estado(dir), r = cenarios(dir), presos = r.cenarios.filter((c) => c.status === 'executando');
  if (e.execucao !== 'rodando' && !presos.length) return false;
  for (const c of presos) { try { concluirCenario(dir, c.id, 'descartado', 'Execução interrompida (janela fechada ou queda): volta à fila'); } catch { /* sem execução aberta */ } }
  if (e.execucao === 'rodando') mudar(dir, { execucao: 'parado' });
  aoVivo.anotar(dir, { tipo: 'aviso', texto: `Execução anterior interrompida${presos.length ? `: ${presos.map((c) => c.id).join(', ')} volta(m) à fila` : ''}` });
  return true;
}
const estado = (dir) => lerJson(path.join(dir, ESTADO), {});
const mudar = (dir, e) => gravarJson(path.join(dir, ESTADO), { ...estado(dir), ...e, em: new Date().toISOString() });

// ▶ do QA: acha o plano no provedor (ou em qa-plano.md) e versiona em Docs. Plano novo (ou mudado) espera a aprovação do humano; já aprovado, lista os cenários.
async function verificarPlano(dir, chave, filhos) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  reconciliar(dir);
  if (estado(dir).publicarPendente && versaoAtual(dir) && estado(dir).fase === 'plano_encontrado') { // plano local à espera do seu Aprovar: o provedor ainda não o tem
    vivo('aviso', `Aguardando você: abra o planejamento v${versaoAtual(dir).v} no cartão acima, peça mudanças ou aprove (aprovar publica no ${onde(dir)})`);
    return;
  }
  vivo('etapa', 'QA · 1. Planejamento');
  vivo('acao', `Lendo as subtarefas do ${chave} no ${onde(dir)}`);
  mudar(dir, { fase: 'procurando', erro: null, chave });
  let r;
  try { r = await procurar(filhos, chave); } catch (e) {
    vivo('erro', `Não consegui ler o ticket no ${onde(dir)}: ${e.message}`);
    return mudar(dir, { fase: 'erro', erro: e.message });
  }
  vivo('acao', r.qa.length ? `Subtarefas com QA no nome: ${r.qa.map((x) => `${x.key} (${x.resumo})`).join(', ')}` : 'Nenhuma subtarefa com QA no nome');
  if (!r.plano) { // sem subtarefa com plano no provedor (ex.: sem subtarefas): vale o arquivo local
    const l = planoLocal(dir);
    if (l) r.plano = { key: chave, resumo: `Plano de QA (${PLANO_LOCAL})`, updated: new Date(l.mtime).toISOString(), md: l.md };
  }
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
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const m = sincronizar(dir, mdDaVersao(dir, v), v.v);
  vivo('etapa', 'QA · 2. Cenários');
  vivo('fim', `Planejamento v${v.v} aprovado`);
  vivo('fim', `${m.total} cenário(s) listados abaixo${m.mudaram ? ` · ${m.mudaram} mudaram desde a última versão` : ''}${m.sairam ? ` · ${m.sairam} saíram do plano` : ''}`);
  vivo('acao', 'Clique em Dar início para subir o ambiente e executar os cenários');
  mudar(dir, { fase: 'plano_aprovado', publicarPendente: false, aprovado: { versao: v.v, subtarefa: v.subtarefa, em: new Date().toISOString() } });
  return true;
}
// O plano que a IA escreveu fica só local (versão nova na aba Docs) até o humano abrir, ler e aprovar: o provedor só recebe depois.
function proporPlano(dir, chave) {
  const p = planoLocal(dir);
  if (!p) throw new Error(`O Claude não gravou ${PLANO_LOCAL} com cenários (CT01…)`);
  const v = versionar(dir, { key: chave, resumo: `Plano de QA (${PLANO_LOCAL}, ainda não publicado)`, updated: new Date(p.mtime).toISOString(), md: p.md });
  aoVivo.anotar(dir, { tipo: 'fim', texto: `Plano v${v.v} pronto, só local: ${v.nova ? `salvo como ${v.arquivo}` : 'mesmo texto da versão anterior'}` });
  aoVivo.anotar(dir, { tipo: 'aviso', texto: `Aguardando você: abra o planejamento v${v.v}, leia e aprove (aprovar publica no ${onde(dir)})` });
  mudar(dir, { fase: 'plano_encontrado', subtarefa: chave, versao: v.v, publicarPendente: true, erro: null, pedido: null, pausa: null });
  return v;
}
// Aprovar um plano local: publica no provedor (portão passou), reconcilia a versão com o texto que o provedor guardou e aprova.
async function aprovarPublicando(dir, deps) {
  const e = estado(dir);
  if (e.fase !== 'plano_encontrado' || !e.publicarPendente || !versaoAtual(dir)) return aprovar(dir);
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  vivo('acao', ehLocal(dir) ? 'Salvando o plano no documento' : `Publicando o plano aprovado no ${nomeProvedor()}`);
  const r = await publicarPlano(dir, deps);
  vivo('fim', r.modo === 'criada' ? `Subtarefa ${r.key} criada com o plano` : r.modo === 'atualizada' ? `Descrição de ${r.key} atualizada com o plano` : `Plano publicado como comentário no ${r.key}`);
  // A versão aprovada passa a ser a do provedor (ele pode normalizar o texto); sem isso o próximo ▶ pediria a aprovação de novo.
  const ind = lerJson(path.join(dir, INDICE), { versoes: [] }), ult = ind.versoes.at(-1);
  if (ult) { ult.subtarefa = r.key; gravarJson(path.join(dir, INDICE), ind); }
  const achado = await procurar(deps.filhos, deps.chave).catch(() => null);
  const v = achado?.plano ? versionar(dir, achado.plano) : versaoAtual(dir);
  mudar(dir, { fase: 'plano_encontrado', subtarefa: v.subtarefa, versao: v.v });
  return aprovar(dir);
}

// ── Planejamento: a IA só escreve o plano em Markdown numa pasta local (qa-plano.md); quem publica no provedor é a extensão (publicarPlano).
// Sem ferramentas do provedor (MCP): o contexto do ticket vai num arquivo (.ticket-contexto.md, buscado pelo provedor).
const PLANO_LOCAL = 'qa-plano.md', CONTEXTO = '.ticket-contexto.md';
// Confere o contrato do plano (a extensão não confia na fala da IA): avisos, sem bloquear. Vira linha 'aviso' no Ao vivo.
const conferirPlano = (md) => [
  ...(/crit[ée]rios de aceite cobertos/i.test(md) ? [] : ['O plano não tem a seção "Critérios de aceite cobertos" (rastreio critério → cenário)']),
  ...(/\b(aprovado|gerado|bruto|verbal|inferido)\b/i.test(md) ? [] : ['O plano não diz a fonte e a confiança (aprovado, gerado, bruto, verbal, inferido) dos critérios'])];
const TITULO_SUBTAREFA = '[QA] Planejamento dos Casos de Testes'; // convenção que procurar() reconhece
// Nome do provedor para os rótulos (fora do VS Code, nos testes, cai no Jira).
const nomeProvedor = () => { try { return require('../infra/ticket').jira.nome || 'Jira'; } catch { return 'Jira'; } };
// Ticket por documento (provedor local, sem rede): a pasta do QA é <ticket>/qa. Rótulos e prompt mudam; o fluxo é o mesmo, pelo adaptador local.
const ehLocal = (dir) => { try { return require('../infra/tickets').ler(path.basename(path.dirname(dir)))?.provedor === 'documento'; } catch { return false; } };
const onde = (dir) => (ehLocal(dir) ? 'documento' : nomeProvedor()); // "no <onde>"
// Só para documento: o original e o texto extraído (infra/contexto.js; só cita o que já existe na pasta do ticket).
function blocoDocumento(dir) {
  if (!ehLocal(dir)) return '';
  const raiz = path.dirname(dir), ex = (f) => fs.existsSync(path.join(raiz, f));
  const t = require('../infra/tickets').ler(path.basename(raiz)), orig = t?.documento?.arquivo;
  const itens = [orig && `o documento original ${path.join(raiz, orig)}`, ex('.documento-extraido.md') && `o texto extraído dele ${path.join(raiz, '.documento-extraido.md')}`,
    ex('.documento-paginas') && `as páginas renderizadas (imagens) em ${path.join(raiz, '.documento-paginas')}`].filter(Boolean);
  return itens.length ? ` Este ticket é um DOCUMENTO sem Jira: a fonte da verdade é ${itens.join(', ')}. Leia-os (imagens com Read) antes de montar os casos.` : '';
}

// Ticket normalizado do provedor (buscar) + ticket local → arquivo de contexto que a IA lê (infra/contexto.js, igual para todo módulo).
const contextoTicket = (j, t) => require('../infra/contexto').contextoDoTicket(j, t);

// Método do planejamento (o do jira-qa-planner, sem a parte que publica): casos de teste no formato que cenariosDo() entende.
const METODO = 'MÉTODO: leia a descrição, os critérios de aceite e os comentários e monte os casos de teste que os cobrem. '
  + 'Estrutura do arquivo: "## Cenários de Teste" com um título "#### CT01 – <o que valida>" por caso (numeração contínua CT01, CT02…); '
  + 'em cada caso, o passo a passo em Gherkin, uma linha por item em negrito no início: **Dado que** …, **Quando** …, **Então** … (**E** … para continuar); '
  + 'depois "Validações:" com os pontos a conferir. Cubra o caminho feliz, as regras de negócio e os critérios de aceite, os limites e erros, e as regressões prováveis. '
  + 'Casos que dependem de exploração livre vão ao final como "#### Exploratório 1 – …". Termine com "## Critérios de aceite cobertos" (tabela CA × CT) e "## Riscos e pré-requisitos" '
  + '(massa de dados, perfis/permissões, ambiente). Um cenário por comportamento verificável; sem inventar regra que não esteja nas fontes (o que faltar vai em Riscos). '
  + 'Na tabela de critérios use as colunas Critério | Cenários | Fonte (arquivo ou campo do ticket) | Confiança (aprovado, gerado, bruto, verbal ou inferido): critério que você deduziu é "inferido". '
  + 'Se a implementação (impl/implementacao.md, impl/plano-mudanca.md) grava em uma tabela (log, auditoria, histórico), crie um cenário que consulte essa tabela e cite o nome dela no título ou no corpo.';
const REGRAS_PLANO = (dir, rasc = dir) => `Regras: português; você roda em segundo plano, sem ninguém para aprovar; use SÓ o contexto local (nada de ferramentas do ${onde(dir)}). `
  + `Leia ${path.join(dir, CONTEXTO)} (ticket, subtarefas e comentários) e, se houver, os arquivos baixados do ticket (pasta ${path.join(dir, '..')}) e as specs na pasta do ticket (Glob/Read). `
  + `${citarDossie(dir)}${citarRespostas(dir)}\n${blocoDocumento(dir)}Grave o plano completo, só o conteúdo do planejamento (sem cabeçalho de versão), em ${path.join(rasc, PLANO_LOCAL)}. NÃO publique, NÃO crie subtarefa nem comentário: a Crafting Table publica só depois de o humano ler e aprovar. `
  + `Se faltar algo que só o humano sabe e nenhuma fonte responde, NÃO invente: grave ${path.join(rasc, PAUSA)} com {"motivo":"...","pergunta":"...","opcoes":["..."]} (opcoes pode ser vazio), não grave o plano e termine.`;
// Criar: o clique em "Criar planejamento" é o OK do humano. rasc: onde a IA pode escrever (infra/area-ia.js); a extensão copia para dir.
const promptCriar = (dir, rasc = dir) => `[segundo plano · Crafting Table] Planejamento de testes de QA do ticket. O humano pediu o plano ao clicar em "Criar planejamento" e vai ler e aprovar o arquivo antes de qualquer publicação.\n\n${METODO}\n\n${REGRAS_PLANO(dir, rasc)}`
  + ' Termine dizendo em uma frase quantos casos montou.';
// Pedir mudança: a IA edita o arquivo local; a extensão republica.
const promptMudanca = (dir, pedido, rasc = dir) => `[segundo plano · Crafting Table] O humano pediu esta mudança no planejamento de QA, que está em ${path.join(rasc, PLANO_LOCAL)}: "${pedido}".\n`
  + 'Aplique o pedido editando esse arquivo (não pergunte nada): mantenha o formato e a numeração dos cenários que não mudaram e continue a numeração nos novos.\n\n'
  + `${METODO}\n\n${REGRAS_PLANO(dir, rasc)} Não crie outro arquivo. Termine dizendo em uma frase o que mudou.`;
// Ferramentas liberadas: só leitura do contexto local e escrita/edição do plano. Nada do provedor.
const FERRAMENTAS_PLANO = ['Read', 'Glob', 'Grep', 'Write', 'Edit'];

// Plano escrito pela IA em PLANO_LOCAL (null se não existe ou não tem cenários).
function planoLocal(dir) {
  try {
    const arq = path.join(dir, PLANO_LOCAL), md = fs.readFileSync(arq, 'utf8');
    return cenariosDo(md).length ? { md, mtime: fs.statSync(arq).mtimeMs } : null;
  } catch { return null; }
}
// Publica o plano local no provedor: subtarefa [QA] nova (criarSubtarefa) ou a existente (atualizarDescricao); sem subtarefas no provedor,
// comentário no ticket (o arquivo local segue como fonte). deps: { chave, filhos, subtarefas, criarSubtarefa, atualizarDescricao, comentar }.
async function publicarPlano(dir, deps) {
  const p = planoLocal(dir);
  if (!p) throw new Error(`O Claude não gravou ${PLANO_LOCAL} com cenários (CT01…)`);
  if (!deps.subtarefas) {
    await deps.comentar(`**${TITULO_SUBTAREFA}** (Crafting Table)\n\n${p.md}`);
    return { modo: 'comentario', key: deps.chave };
  }
  const existente = candidatas(await deps.filhos(deps.chave))[0];
  if (existente) { await deps.atualizarDescricao(existente.key, p.md); return { modo: 'atualizada', key: existente.key }; }
  const { key } = await deps.criarSubtarefa({ resumo: TITULO_SUBTAREFA, descricao: p.md });
  return { modo: 'criada', key };
}

// Bloco do topo da seção Evidências no QA: cartão do planejamento + Ao vivo. Botões vão ao painel (data-painel, grupo.js).
const CSS = `<style>${caixaEtapas.CSS}${aoVivo.CSS}${cardCenario.CSS}
  .caixa-t { margin: 0 12px 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); display: flex; gap: 6px; }
  .caixa-t span { margin-left: auto; text-transform: none; letter-spacing: 0; }
  .papel-massa { margin: 6px 0; padding: 8px 10px; border-radius: var(--r-lg); background: ${FC.bg}; color: ${FC.text}; box-shadow: 0 4px 16px rgb(0 0 0 / 16%); font-family: var(--vscode-editor-font-family, monospace); font-size: 13px; line-height: 1.55; user-select: text; }
  .papel-massa .campo { display: flex; gap: 8px; align-items: baseline; }
  .papel-massa .k { font-weight: 700; flex: none; } .papel-massa .k::after { content: ' ='; }
  .papel-massa .v { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .papel-massa .copiar { flex: none; background: transparent; color: inherit; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: 4px; padding: 0 5px; opacity: .55; cursor: pointer; }
  .papel-massa .copiar:hover { opacity: 1; }
  .qa-card { margin: 10px 12px; padding: 10px 12px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--border); font-size: 12px; }
  .qa-card.linha { display: flex; align-items: center; gap: 8px; }
  .qa-card.linha b { margin: 0; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .qa-card.linha .dim { font-weight: 400; color: var(--text-dim); }
  .qa-card.linha .arquivo { margin: 0; flex: none; }
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
       O Claude escreve o plano; você lê e aprova, e só então a Crafting Table ${ehLocal(dir) ? 'salva no documento' : `publica no ${nomeProvedor()}`}.</p><button data-painel="qaCriarPlano">Criar planejamento</button></div>`
    : e.fase === 'criando' ? `<div class="qa-card"><b><span class="vivo-bola"></span>Criando o planejamento</b><p>O Claude está escrevendo o plano; ao terminar ele aparece aqui para você ler e aprovar (nada é publicado antes).</p></div>`
    : e.fase === 'alterando' && rodando ? `<div class="qa-card"><b><span class="vivo-bola"></span>Aplicando sua mudança no planejamento</b><p>“${esc(e.pedido || '')}”. Ao terminar, a versão nova aparece aqui para aprovar.</p></div>`
    : ['plano_encontrado', 'alterando'].includes(e.fase) && ult ? `<div class="qa-card"><b>Planejamento encontrado · ${plano}</b><p>${esc(ult.resumo)} · ${cenariosDo(mdDaVersao(dir, ult)).length} cenário(s). Leia e aprove para listar os cenários.${e.publicarPendente ? ` O plano ainda está só aqui: aprovar o publica no ${esc(onde(dir))}.` : ''}${e.erro ? ` <span class="dim">Última tentativa: ${esc(e.erro)}</span>` : ''}</p>
       ${abrir}${e.fase === 'alterando' ? '' : `<div class="acoes-passo"><button class="aprovar ${lido ? '' : 'travado'}" data-painel="qaPlanoAprovar" ${lido ? '' : 'disabled'}
         title="${lido ? 'Aprovar o planejamento e listar os cenários' : 'Abra o arquivo antes de aprovar: nunca aprove sem ler'}">Aprovar</button>
         <button data-painel="qaPlanoMudar" title="Descreva o ajuste: o Claude aplica na subtarefa e gera a versão nova">Pedir ajuste</button></div>`}</div>`
    : e.fase === 'plano_aprovado' && ult ? `<div class="qa-card linha"><b>Planejamento aprovado · ${plano} <span class="dim">${esc(ult.resumo)}</span></b>${abrir}</div>`
    : e.fase === 'erro' ? `<div class="qa-card bloq"><b>Não consegui conferir o planejamento</b><p>${esc(e.erro)}</p><button data-painel="qaPlay">Tentar de novo</button></div>`
    : !e.fase ? '<div class="qa-card"><b>QA não iniciado</b><p>Clique em ▶ no topo: a Crafting Table procura o planejamento de QA do ticket.</p></div>' : '';
  const aprovado = e.fase === 'plano_aprovado';
  // Pergunta do Claude (ou da extensão, quando o ticket só tem título): o cartão é a pausa; a resposta retoma sozinha.
  const prop = e.pausa?.motivo === 'massa-sql' ? propostaMassa(dir) : null;
  const sqlHtml = prop ? `<p><b>Por quê:</b> ${esc(prop.porque || e.pausa.detalhe || '—')} · <b>Papel:</b> ${esc(prop.papel)} · <b>Cenários:</b> ${esc(prop.cenarios.join(', '))}</p>
    <details open><summary>SQL que vai rodar (${prop.sql.length})</summary><pre>${esc(prop.sql.join(';\n'))};</pre></details>
    <details><summary>SQL de desfazer (${prop.desfazer.length})</summary><pre>${esc(prop.desfazer.join(';\n'))};</pre></details>` : '';
  const pausaCard = e.pausa ? `<div class="qa-card bloq"><b>${e.pausa.motivo === 'briefing' ? 'Antes de planejar, preciso entender o que testar' : prop ? 'Alteração no banco para montar a massa' : 'O Claude precisa da sua resposta'}</b><p>${esc(e.pausa.pergunta)}</p>${sqlHtml}
    <div class="acoes-passo">${(e.pausa.opcoes || []).map((o, i) => `<button data-painel="qaResponder" data-op="${i}">${esc(o)}</button>`).join('')}
    <button data-painel="qaResponder" class="aprovar">Responder…</button></div></div>` : '';
  const lote = loteRefazer(dir);
  const loteCard = lote ? (() => { const c = lote.cenario, ult = (c.execucoes || []).at(-1);
    return `<div class="qa-card bloq"><b>Refazer · ${lote.idx + 1} de ${lote.ids.length} · ${esc(c.id)} <span class="dim">${esc(c.titulo || '')}</span></b>
    <p>${esc(c.status === 'bloqueado' ? 'Bloqueado' : 'Não passou')}${ult?.nota ? `: ${esc(ult.nota)}` : ''}. Como refazer este cenário?</p>
    <div class="acoes-passo">${lote.opcoes.map((o, i) => `<button data-painel="qaRefazerResponder" data-op="${i}">${esc(o)}</button>`).join('')}
    <button class="aprovar" data-painel="qaRefazerResponder" data-op="outra">Outra resposta…</button>
    <button class="sec" data-painel="qaRefazerCancelar">Cancelar</button></div></div>`; })() : '';
  // Plano já aprovado: o cartão dele desce para baixo do Ao vivo (em cima ficam execução e ambiente).
  // O ambiente fica só no rodapé do painel (status, log ao vivo e a análise do Claude num modal).
  return CSS + loteCard + pausaCard + (aprovado || e.pausa ? '' : card) + (aprovado && !e.pausa ? execucaoHtml(dir, e, rodando) : '')
    + etapasQa(dir, e, rodando) + aoVivo.caixa(dir, rodando, 'qa') + (aprovado ? card + mapaHtml(dir, cenarios(dir), ambiente(dir), uri) : '');
}
// Publicar só com todos os cenários não arquivados em 'passou' (e ao menos um).
function podePublicar(lista) { const a = lista.filter((c) => !c.arquivado && c.status !== 'dispensado'); return a.length > 0 && a.every((c) => c.status === 'passou'); }
const BOTAO_PUBLICAR = (ok, local = false) => `<button class="sec" data-painel="qaPublicar" ${ok ? '' : 'disabled '}title="${ok ? `Comentário com o resultado e as evidências na subtarefa de QA${local ? ' do documento' : ''} (pede confirmação)` : 'Só é possível publicar quando todos os cenários estiverem com resultado OK (passou)'}">${local ? 'Salvar resultado no documento' : `Publicar no ${nomeProvedor()}`}</button>`;
// Caixa de etapas do QA: os nomes vêm de agentes/etapas.js (módulo "qa", os mesmos da aba Plugins); o estado sai do que o módulo já sabe.
function etapasQa(dir, e, rodando) {
  const nomes = vagas.MODULOS.find((m) => m.id === 'qa').etapas.map((x) => x.nome);
  const r = cenarios(dir).cenarios.filter((c) => !c.arquivado && c.status !== 'dispensado'), feitos = r.filter((c) => RESULTADOS.includes(c.status)).length;
  const aprovado = e.fase === 'plano_aprovado', amb = statusAmbiente(dir), ms = massa(dir).itens;
  const plano = e.fase === 'erro' ? ['erro'] : aprovado ? ['concluida'] : e.fase === 'plano_encontrado' ? ['aguardando'] : ['criando', 'alterando'].includes(e.fase) && rodando ? ['rodando'] : ['pendente'];
  const ambEt = !aprovado ? ['pendente'] : amb?.tipo === 'preparando' ? ['rodando'] : amb?.tipo === 'erro' ? ['erro'] : amb ? ['concluida'] : ['pendente'];
  const pc = estado(dir).precondicao, preEt = !aprovado || !r.length ? ['pendente'] : pc?.status === 'ok' ? ['concluida'] : pc?.status === 'falhou' ? ['erro'] : pc?.status === 'verificando' && rodando ? ['rodando'] : ['pendente'];
  const massaEt = !aprovado || !r.length ? ['pendente'] : ms.some((i) => i.estado === 'valida') ? ['concluida'] : ambEt[0] === 'concluida' && rodando ? ['rodando'] : ['pendente'];
  const exec = !aprovado || !r.length ? ['pendente']
    : feitos === r.length ? ['concluida', `${feitos}/${r.length}`] : e.execucao === 'pausado' ? ['pausada', `${feitos}/${r.length}`] : rodando ? ['rodando', `${feitos}/${r.length}`] : ['pendente', feitos ? `${feitos}/${r.length}` : ''];
  const pub = podePublicar(cenarios(dir).cenarios) ? ['aguardando', 'pronta para publicar'] : ['pendente'];
  const est = [plano, aprovado ? ['concluida', `${r.length} cenário(s)`] : ['pendente'], ambEt, preEt, massaEt, exec, pub];
  const etapas = nomes.map((nome, i) => ({ n: i + 1, nome, estado: est[i][0], ...(est[i][1] !== undefined ? { rotulo: est[i][1] } : {}) }));
  return caixaEtapas.caixa({ titulo: 'Etapas do QA', etapas, atual: (etapas.find((x) => x.estado !== 'concluida') || {}).n });
}
function execucaoHtml(dir, e, rodando) {
  const r = cenarios(dir).cenarios.filter((c) => !c.arquivado), pend = fila({ cenarios: r }).length, feitos = r.filter((c) => RESULTADOS.includes(c.status)).length;
  const dono = donoAmbiente(), outro = dono && dono.chave !== e.chave ? ` O ambiente está com o ${esc(dono.chave)}.` : '';
  if (rodando) return `<div class="qa-card"><b><span class="vivo-bola"></span>QA em andamento</b><p>⏸ no topo pausa: o cenário em andamento é descartado e volta na retomada.</p></div>`;
  if (pend) return `${e.interrupcao ? `<div class="qa-card bloq"><b>Fila pausada: Claude indisponível${e.interrupcao.cenario ? ` em ${esc(e.interrupcao.cenario)}` : ''}</b><p>${esc(e.interrupcao.detalhe)}</p><p>Nenhum cenário foi pulado: retome e a execução segue do mesmo ponto.</p></div>` : ''}${e.precondicao?.status === 'falhou' ? `<div class="qa-card bloq"><b>Pré-condição falhou: a suíte não foi iniciada</b><p>${esc(e.precondicao.motivo)}</p></div>` : ''}<div class="qa-card"><b>${pend} cenário(s) na fila${e.execucao === 'pausado' ? ' · pausado' : ''}</b><p>Sobe API, Metro, emulador e app, confere a massa e executa um cenário por vez.${outro}</p>
    <button data-painel="qaIniciar">${e.execucao === 'pausado' ? 'Retomar' : feitos ? 'Continuar' : 'Dar início'}</button>
    ${feitos ? BOTAO_PUBLICAR(podePublicar(r), ehLocal(dir)) : ''}</div>`;
  return `<div class="qa-card"><b>Execução concluída</b><p>Nenhum cenário na fila. ↻ Refazer num cenário o coloca de volta.</p>
    ${feitos ? BOTAO_PUBLICAR(podePublicar(r), ehLocal(dir)) : ''}</div>`;
}
// Aba Massa (painel). Validade: estado 'valida' e medida depois do último refresh do banco.
function massaHtml(dir, hora = '06:00') {
  const m = massa(dir), agora = new Date(), ref = ultimoRefresh(agora, hora);
  const rot = (i) => (i.estado === 'valida' && !massaValida(i, agora, hora) ? ['Vencida', 'desatualizado'] : i.estado === 'valida' ? ['Válida', 'passou']
    : i.estado === 'consumida' ? ['Consumida', 'bloqueado'] : ['Inválida', 'falhou']);
  const linhas = m.itens.slice().reverse().map((i) => { const [r, cls] = rot(i); return `<div class="cen"><div class="cdet" style="padding-top:8px">
    <div><b class="cid">${esc(i.id)}</b> · ${esc(i.papel)} <span class="cst ${cls}">${r}</span></div>
    <div>Cenários: ${esc((i.cenarios || []).join(', ') || '—')} · medida ${esc(dataBr(i.medidaEm))}</div>
    <div class="papel-massa">${Object.entries(i.dados || {}).map(([k, v]) => `<div class="campo"><span class="k">${esc(k)}</span><span class="v">${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</span><button class="copiar" data-acao="qaMassaCopiar" data-id="${esc(i.id)}" data-key="${esc(k)}" title="Copiar ${esc(k)}">⧉</button></div>`).join('') || '<span class="k">sem campos</span>'}</div>
    ${i.consulta ? `<details><summary>Consulta</summary><pre>${esc(i.consulta)}</pre></details>` : ''}
    ${i.origem === 'sql' && i.desfazer?.length ? `<details><summary>Montada por SQL · desfazer</summary><pre>${esc(i.desfazer.join(';\n'))};</pre><button data-acao="qaMassaDesfazer" data-id="${esc(i.id)}" title="Roda o SQL de desfazer no banco (pede confirmação)">Desfazer no banco</button></details>` : ''}
    ${i.estado === 'valida' ? `<button data-acao="qaMassaEstado" data-id="${esc(i.id)}" data-op="invalida">Marcar inválida</button>` : `<button data-acao="qaMassaEstado" data-id="${esc(i.id)}" data-op="valida">Marcar válida</button>`}
    </div></div>`; }).join('');
  return `${CSS}<div class="qa-card"><b>Massa de dados</b><p>Vale até o refresh do banco (último: ${esc(dataBr(ref.toISOString()))}; horário em Configurações → craftingTable.qaHoraRefresh).
    O ▶ levanta massa só para cenários sem massa válida; a massa que um cenário altera vira consumida.</p>
    <button data-acao="qaMassaEditar" title="Abre o .massa.json no editor (cole ou corrija dados à mão)">Editar à mão</button></div>
    <div class="cens">${linhas || '<div class="vazio-aba">Nenhuma massa ainda. O ▶ do QA levanta a massa antes de executar os cenários.</div>'}</div>`;
}
function mapaHtml(dir, r, amb, uri) {
  const ativos = r.cenarios.filter((c) => !c.arquivado), arq = r.cenarios.filter((c) => c.arquivado);
  if (!r.cenarios.length) return '';
  const feitos = ativos.filter((c) => c.status === 'passou').length, dispensados = ativos.filter((c) => c.status === 'dispensado').length;
  const ctx = { dir, amb, uri, arquivos: (x) => arquivosDe(dir, x) };
  const nRef = ativos.filter((c) => PARA_REFAZER.includes(c.status)).length;
  return `<div class="caixa-t">Cenários · plano v${r.planoVersao}${nRef ? ` <button class="sec" data-painel="qaRefazerLote" title="Pergunta, cenário a cenário, como refazer os que falharam ou ficaram bloqueados">↻ Refazer (${nRef})</button>` : ''}<span>${feitos}/${ativos.length - dispensados} passaram${dispensados ? ` · ${dispensados} não executado(s) por decisão` : ''}</span></div>
    <div class="cens">${[...ativos, ...arq].map((c) => cardCenario.card(c, ctx)).join('')}</div>`;
}

module.exports = { proporMassa, aplicarProposta, recusarProposta, desfazerMassa, propostaMassa, PROPOSTA, LOG_SQL, proporPlano, aprovarPublicando, conferirPlano, reconciliar, registrarPausa, absorverPausa, pausaPendente, responder, FERRAMENTAS_MASSA, FERRAMENTAS_EXEC, FERRAMENTAS_ANALISE, PROIBIDAS, RESPOSTAS, PAUSA, faltaEvidencia, exigenciasDe, statusAmbiente, analiseVista, resumoErroAmbiente, verificarPlano, aprovar, versaoAtual, promptCriar, promptMudanca, publicarPlano, planoLocal, mdDaVersao, contextoTicket, PLANO_LOCAL, CONTEXTO, analisarAmbiente, gravarAnalise, LOG_AMB, FERRAMENTAS_PLANO, html, massaHtml, estado, mudar, cenarios, refazer, iniciarRefazerLote, responderRefazer, cancelarRefazerLote, loteRefazer, executar, pausar, rodando, registrarDecisao,
  ehLocal, podePublicar, dispensar, concluirCenario, bloquearSemMassa, emEtapaMassa, emPreCondicao, registrarPreCondicao, promptPreCondicao, evidencia, arquivosDe, massa, massaAdd, massaEstado, sincronizarMassa, massaValida, ambiente, donoAmbiente, INDICE, ESTADO, CENARIOS, MASSA, RESULTADOS,
  _teste: { healthCheck, papeisDe, ehQA, candidatas, temPlano, versionar, procurar, cenariosDo, sincronizar, iniciarCenario, fila, ultimoRefresh, semMassa, promptCenario } };
