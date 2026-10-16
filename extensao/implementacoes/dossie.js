// @ts-check
// Dossiê da Implementação: o que existe no disco do ticket (spec, cards, incidente, QA, descrição, briefing do dev) normalizado em três
// eixos (alvo, pronto, onde) com a confiança de cada fonte. Daí saem a prontidão e o modo da esteira (esteira.js). Só lê arquivos:
// sem vscode e sem IA, então roda em teste e em bin/. Gravado em impl/dossie.json (máquina) e impl/dossie.md (IA e aba Dossiê).
//   confiança: aprovado (humano aprovou) > gerado (IA produziu) > bruto (texto do ticket) > verbal (o dev explicou) > ausente
//   modo: executar (spec e tarefas aprovadas) · corrigir (diagnóstico do incidente) · entender (texto sem refino) · perguntar (nada)
const fs = require('fs');
const path = require('path');
const tickets = require('../infra/tickets');
const { dirSpec, estadoSpec, tarefasDe, arqHandoff } = require('../infra/spec');
const { ler } = require('../infra/pasta-ticket');
const { html2txt } = require('../infra/texto');

const { execFileSync } = require('child_process');

// ── Trabalho já feito: branches e commits do ticket nos repositórios, mesmo de quem nunca usou a extensão ──
// Só leitura. Acha pela chave do ticket (e a das subtarefas) no NOME da branch, local ou remota, e na MENSAGEM dos commits; mostra o que cada branch
// já tem à frente da branch principal, o que já foi integrado e o que está por commitar na checkout atual. Chave "KAN-5" não casa com "KAN-50".
const gitPadrao = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reChave = (chaves) => new RegExp(`(^|[^A-Za-z0-9])(${chaves.map(escRe).join('|')})([^0-9]|$)`, 'i');
const LIMITE = { branches: 8, commits: 15, arquivos: 40, fora: 10 };
const FMT = '%h%x09%an%x09%aI%x09%s';
const linhaCommit = (l) => { const [hash, autor, data, ...ass] = l.split('\t'); return { hash, autor, data, assunto: ass.join('\t') }; };

/** @returns {{ caminho: string, camada: string, principal: string, branches: any[], foraDeBranch: any[], integrados: any[], atual: { branch: string, alteracoes: string[] } | null }[]} */
function trabalhoExistente(repos, chaves, git = gitPadrao) {
  const re = reChave(chaves), r = (f, def = '') => { try { return f(); } catch { return def; } };
  return repos.flatMap((repo) => {
    if (!fs.existsSync(path.join(repo.caminho, '.git'))) return [];
    const g = (...a) => r(() => git(repo.caminho, a));
    const principal = repo.branchPrincipal || '', temRemoto = (n) => !!g('rev-parse', '--verify', '--quiet', `refs/remotes/origin/${n}`);
    const base = principal ? (temRemoto(principal) ? `origin/${principal}` : g('rev-parse', '--verify', '--quiet', `refs/heads/${principal}`) ? principal : '') : '';
    // branches (locais e remotas) com a chave no nome, sem duplicar a que existe nos dois lugares
    const refs = g('for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes').split('\n').filter(Boolean)
      .map((n) => ({ ref: n, nome: n.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\/origin\//, ''), remoto: n.startsWith('refs/remotes/') }))
      .filter((x) => x.nome !== 'HEAD' && re.test(x.nome));
    const porNome = new Map();
    for (const x of refs) { const a = porNome.get(x.nome) || { nome: x.nome, local: false, remoto: false, ref: x.ref }; a[x.remoto ? 'remoto' : 'local'] = true; if (!x.remoto) a.ref = x.ref; porNome.set(x.nome, a); }
    const branches = [...porNome.values()].filter((b) => b.nome !== principal).slice(0, LIMITE.branches).map((b) => {
      const alvo = b.ref, intervalo = base ? `${base}..${alvo}` : alvo;
      const commits = g('log', intervalo, `--format=${FMT}`, `-n`, String(LIMITE.commits)).split('\n').filter(Boolean).map(linhaCommit);
      const adiante = base ? Number(g('rev-list', '--count', intervalo) || 0) : commits.length;
      const arquivos = base ? g('diff', '--name-only', `${base}...${alvo}`).split('\n').filter(Boolean) : [];
      return { nome: b.nome, local: b.local, remoto: b.remoto, adiante, commits, arquivos: arquivos.slice(0, LIMITE.arquivos), totalArquivos: arquivos.length,
        stat: base ? g('diff', '--stat', '--stat-width=100', `${base}...${alvo}`).split('\n').slice(-1)[0] || '' : '',
        ultimo: linhaCommit(g('log', '-1', `--format=${FMT}`, alvo)), esteira: /^impl\//.test(b.nome) };
    });
    // commits com a chave na mensagem: já integrados na principal, e os que estão fora dela (com as branches que os contêm)
    const grep = ['-i', '-E', `--grep=(^|[^A-Za-z0-9])(${chaves.map(escRe).join('|')})([^0-9]|$)`];
    const integrados = base ? g('log', base, ...grep, `--format=${FMT}`, '-n', String(LIMITE.fora)).split('\n').filter(Boolean).map(linhaCommit) : [];
    const nomesBranch = new Set(branches.map((b) => b.nome));
    const foraDeBranch = g('log', '--all', ...(base ? ['--not', base] : []), ...grep, `--format=${FMT}`, '-n', String(LIMITE.fora)).split('\n').filter(Boolean).map(linhaCommit)
      .map((c) => ({ ...c, branches: g('branch', '-a', '--contains', c.hash).split('\n').map((x) => x.replace(/^[*+\s]+/, '').replace(/^remotes\/origin\//, '')).filter((x) => x && !/^\(|HEAD/.test(x)) }))
      .filter((c) => !c.branches.length || c.branches.some((n) => !nomesBranch.has(n)));
    // checkout atual: alterações ainda não commitadas só importam se a branch atual é do ticket
    const atual = g('rev-parse', '--abbrev-ref', 'HEAD');
    const alteracoes = atual && re.test(atual) ? g('status', '--short').split('\n').filter(Boolean) : [];
    if (!branches.length && !integrados.length && !foraDeBranch.length && !alteracoes.length) return [];
    return [{ caminho: repo.caminho, camada: repo.camada, principal, branches, foraDeBranch, integrados, atual: atual ? { branch: atual, alteracoes } : null }];
  });
}

/** Markdown de trabalho-existente.md: o que a IA lê para saber o que já foi feito (não é o diff inteiro: aponta os comandos para ver). */
function trabalhoParaMarkdown(trabalho, chave) {
  const dt = (iso) => String(iso || '').slice(0, 10);
  const c = (x) => `- \`${x.hash}\` ${dt(x.data)} · ${x.autor} · ${x.assunto}`;
  const out = [`# Trabalho já feito · ${chave}`, '', 'Encontrado nos repositórios pela chave do ticket (nome de branch ou mensagem de commit). É trabalho de outra pessoa ou de outra sessão: **leia antes de planejar**, para não refazer o que já existe nem divergir dele.', ''];
  for (const t of trabalho) {
    out.push(`## ${path.basename(t.caminho)} (${t.camada})`, `Repositório: ${t.caminho}${t.principal ? ` · branch principal: ${t.principal}` : ' · branch principal não configurada (sem comparação)'}`, '');
    for (const b of t.branches) {
      out.push(`### Branch \`${b.nome}\` · ${b.local && b.remoto ? 'local e remota' : b.remoto ? 'só no remoto' : 'só local'}${b.esteira ? ' · criada pela esteira' : ''}`,
        `${b.adiante ? `${b.adiante} commit(s) à frente de ${t.principal || 'HEAD'}` : `nada à frente de ${t.principal}: já integrada ou ainda sem commits`} · último: ${dt(b.ultimo.data)} por ${b.ultimo.autor}`, '');
      if (b.commits.length) out.push(...b.commits.map(c));
      if (b.arquivos.length) out.push('', `Arquivos alterados (${b.totalArquivos}${b.stat ? ` · ${b.stat.trim()}` : ''}):`, ...b.arquivos.map((a) => `- ${a}`), b.totalArquivos > b.arquivos.length ? `- … e mais ${b.totalArquivos - b.arquivos.length}` : '');
      out.push('', `Ver o código: \`mapa-git ${t.caminho} log -p ${t.principal ? `${t.principal}..` : ''}${b.nome}\``, '');
    }
    if (t.foraDeBranch.length) out.push('### Commits com a chave que não estão em branch com a chave no nome', '', ...t.foraDeBranch.map((x) => `${c(x)}${x.branches.length ? ` · em: ${x.branches.slice(0, 3).join(', ')}` : ' · sem branch (solto)'}`), '');
    if (t.integrados.length) out.push(`### Já integrados em ${t.principal}`, '', ...t.integrados.map(c), '');
    if (t.atual?.alteracoes.length) out.push(`### Alterações não commitadas na checkout atual (${t.atual.branch})`, '', ...t.atual.alteracoes.map((a) => `- ${a}`), '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

const NIVEIS = ['ausente', 'verbal', 'bruto', 'gerado', 'aprovado'];
const rank = (n) => NIVEIS.indexOf(n);
const BRIEFING = '.briefing.md', JSON_ = 'dossie.json', MD = 'dossie.md', TRABALHO = 'trabalho-existente.md', REPRODUCAO = 'reproducao.md', LIMIAR_TEXTO = 40; // caracteres de descrição+comentários para virar "bruto"
const existe = (f) => { try { return fs.statSync(f).size > 0; } catch { return false; } };
const subpasta = (t, lista) => tickets.pasta(t.chave, lista);

/**
 * O que o ticket traz além do título: descrição + comentários (caracteres) e o documento anexado. Usado pelo dossiê e pela entrada do
 * Refinamento (refinamento/spec.js): ticket que só tem título vira pergunta ao dev, nunca invenção.
 * @param {any} t ticket local (chave, documento?)  @param {any} [j] ticket normalizado (jira.buscar / documento.buscarSync)
 */
function sobreTicket(t, j) {
  const texto = html2txt(j?.descricao) + (j?.comentarios || []).map((c) => html2txt(c.corpo)).join('\n');
  const doc = t.documento?.arquivo ? path.join(tickets.pasta(t.chave), t.documento.arquivo) : null;
  const temDoc = !!doc && fs.existsSync(doc);
  const caracteres = texto.trim().length;
  return { caracteres, doc, temDoc, suficiente: caracteres >= LIMIAR_TEXTO || temDoc };
}

/** Tipos de ticket que pedem confirmação do erro antes de desenvolver (nome do tipo no Jira: Bug, Defeito, Incidente…). */
const tipoTicket = require('../infra/tipo-ticket');
const ehBug = (tipo) => tipoTicket.exigeReproducao(tipoTicket.classificar(tipo));

/** Maior nível entre as fontes de um eixo. */
const nivelDe = (itens) => itens.reduce((m, i) => (rank(i.confianca) > rank(m) ? i.confianca : m), 'ausente');

/** @typedef {{ fonte: string, rotulo: string, confianca: string, arquivo?: string, detalhe?: string }} Item */

/** Banco (leitura só com conexão, ambiente e fora de produção) e repositórios; acrescenta as lacunas. */
function capacidadesDe(o, lacunas) {
  const b = o.banco || {};
  const banco = b.conexao && b.ambiente && b.ambiente !== 'producao' ? 'leitura' : 'nenhum';
  const repos = (o.repos || []).map((r) => ({ caminho: r.caminho, camada: r.camada, branchPrincipal: r.branchPrincipal || '' }));
  const semBranch = repos.filter((r) => !r.branchPrincipal).map((r) => r.caminho);
  if (!repos.length) lacunas.push('Nenhum repositório de código configurado (Configurações > Geral > Repositórios de código).');
  else if (semBranch.length) lacunas.push(`Sem branch principal configurada: ${semBranch.map((c) => path.basename(c)).join(', ')} (Configurações > Geral > Repositórios de código).`);
  if (banco === 'nenhum') lacunas.push('Sem acesso ao banco (não configurado ou em produção): dados confirmados ficam como pendência.');
  return { banco, repos, semBranch };
}

/**
 * @param {any} t ticket local (chave, spec?, documento?, ...)
 * @param {{ j?: any, banco?: { conexao?: string, ambiente?: string }, repos?: { caminho: string, camada: string, branchPrincipal?: string }[], git?: (cwd: string, args: string[]) => string }} [o]
 *   j: ticket normalizado (jira.buscar / documento.buscarSync), para medir descrição e comentários e para as chaves das subtarefas.
 *   git: leitura de git (testes trocam); o padrão roda `git -C`.
 */
function montar(t, o = {}) {
  const dirImpl = subpasta(t, 'impl'), dirInc = subpasta(t, 'incidentes'), dirQa = subpasta(t, 'qa');
  /** @type {{ alvo: Item[], pronto: Item[], onde: Item[] }} */
  const eixos = { alvo: [], pronto: [], onde: [] };
  /** @type {string[]} */ const lacunas = [];
  const fontes = {};
  const marca = (id, v) => { fontes[id] = v; };

  // Ticket: descrição, comentários e documento anexado
  const { caracteres, doc, temDoc, suficiente } = sobreTicket(t, o.j);
  marca('ticket', { texto: caracteres, documento: temDoc, comentarios: (o.j?.comentarios || []).length });
  if (suficiente) {
    eixos.alvo.push({ fonte: 'ticket', rotulo: temDoc ? 'Documento do ticket' : 'Descrição e comentários do ticket', confianca: 'bruto',
      detalhe: temDoc ? path.basename(doc) : `${caracteres} caracteres`, ...(temDoc ? { arquivo: doc } : {}) });
  } else lacunas.push('O ticket não tem descrição nem documento suficientes: só o título.');

  // Briefing do dev (explicado de boca)
  const briefing = path.join(dirImpl, BRIEFING);
  if (existe(briefing)) { eixos.alvo.push({ fonte: 'briefing', rotulo: 'Explicação do dev (verbal)', confianca: 'verbal', arquivo: briefing }); marca('briefing', true); }

  // Spec do Refinamento
  const est = estadoSpec(t), passos = est?.passos || [];
  const aprovado = (n) => passos.find((p) => p.n === n)?.status === 'aprovado';
  const arq = (nome) => { const d = dirSpec(t); const f = d && path.join(d, nome); return f && existe(f) ? f : undefined; };
  const cards = tarefasDe(tickets.pasta(t.chave));
  const aprovadas = cards.filter((c) => c.status === 'aprovada' && c.tipo !== 'qa');
  marca('spec', { passos: passos.map((p) => ({ n: p.n, status: p.status })), cards: cards.length, aprovadas: aprovadas.length });
  if (arq('spec.md')) {
    const ok = aprovado(2) || aprovado(1);
    eixos.alvo.push({ fonte: 'spec', rotulo: 'Spec do Refinamento', confianca: ok ? 'aprovado' : 'gerado', arquivo: arq('spec.md'), detalhe: ok ? 'aprovada' : 'ainda não aprovada' });
    eixos.pronto.push({ fonte: 'spec', rotulo: 'Critérios de aceite dos RFs (Dado/Quando/Então)', confianca: ok ? 'aprovado' : 'gerado', arquivo: arq('spec.md') });
  }
  if (arq('plan.md')) eixos.onde.push({ fonte: 'plan', rotulo: 'Plano técnico (mapeamento do código)', confianca: aprovado(3) ? 'aprovado' : 'gerado', arquivo: arq('plan.md') });
  if (arq('tasks.md') || cards.length) eixos.onde.push({ fonte: 'tarefas', rotulo: `Tarefas (${aprovadas.length}/${cards.filter((c) => c.tipo !== 'qa').length} aprovadas)`,
    confianca: aprovado(4) || aprovadas.length ? 'aprovado' : 'gerado', ...(arq('tasks.md') ? { arquivo: arq('tasks.md') } : {}) });
  if (arq('testes.md')) eixos.pronto.push({ fonte: 'testes', rotulo: 'Plano de testes do Refinamento (CTs)', confianca: aprovado(6) ? 'aprovado' : 'gerado', arquivo: arq('testes.md') });
  for (const lado of ['backend', 'mobile']) {
    const f = arqHandoff(t, lado);
    if (f && existe(f)) eixos.onde.push({ fonte: `mapa-${lado}`, rotulo: `Mapa do código (${lado})`, confianca: 'gerado', arquivo: f });
  }

  // Incidente (Mergulho)
  const diag = path.join(dirInc, '4-diagnostico.md'), mg = ler(path.join(dirInc, '.mergulho.json'), {});
  const repro = ler(path.join(dirInc, 'reproducao.json'), null), fluxo = ler(path.join(dirInc, 'fluxo.json'), null);
  const diagOk = existe(diag);
  marca('incidente', { diagnostico: diagOk, reproduziu: repro?.ok === true, passos: (fluxo?.passos || []).length, resumo: existe(path.join(dirInc, 'resumo.md')),
    massaReal: existe(path.join(dirInc, 'massa-real.sql')), massaTeste: existe(path.join(dirInc, 'massa-teste.sql')) });
  if (diagOk) eixos.alvo.push({ fonte: 'incidente', rotulo: 'Diagnóstico do incidente (ação/falha, evidências, certeza)', confianca: mg.etapa > 4 ? 'aprovado' : 'gerado', arquivo: diag });
  if (repro?.ok === true) eixos.pronto.push({ fonte: 'reproducao', rotulo: 'Reprodução do incidente (o teste de regressão)', confianca: 'gerado', arquivo: path.join(dirInc, 'reproducao.json') });
  else if ((fluxo?.passos || []).length) eixos.pronto.push({ fonte: 'fluxo', rotulo: `Fluxo de reprodução (${fluxo.passos.length} passos, ${repro?.ok === false ? 'não reproduziu' : 'sem resultado'})`, confianca: 'gerado', arquivo: path.join(dirInc, 'fluxo.json') });

  // QA
  const cen = ler(path.join(dirQa, '.cenarios.json'), null), qa = ler(path.join(dirQa, '.qa.json'), {});
  const lista = (cen?.cenarios || []).filter((c) => !c.arquivado && c.status !== 'dispensado');
  marca('qa', { cenarios: lista.length, aprovado: qa.fase === 'plano_aprovado' });
  if (lista.length) eixos.pronto.push({ fonte: 'qa', rotulo: `Cenários do QA (${lista.length})`, confianca: qa.fase === 'plano_aprovado' ? 'aprovado' : 'gerado', arquivo: path.join(dirQa, '.cenarios.json') });

  // Trabalho já feito por alguém: branches e commits com a chave do ticket (ou das subtarefas) nos repositórios configurados
  const chaves = [...new Set([t.chave, ...(o.j?.subtarefas || []).map((x) => x.key)].filter(Boolean))];
  let trabalho = [];
  try { trabalho = trabalhoExistente(o.repos || [], chaves, o.git); } catch { /* repositório ilegível: segue sem */ }
  marca('trabalho', { repositorios: trabalho.length, branches: trabalho.reduce((n, x) => n + x.branches.length, 0), chaves });
  if (trabalho.length) {
    const nB = trabalho.reduce((n, x) => n + x.branches.length, 0), nC = trabalho.reduce((n, x) => n + x.foraDeBranch.length + x.integrados.length, 0);
    eixos.onde.push({ fonte: 'trabalho', rotulo: 'Trabalho já feito (branches e commits do ticket)', confianca: 'bruto', arquivo: path.join(dirImpl, TRABALHO),
      detalhe: `${nB} branch(es), ${nC} commit(s) fora de branch com a chave` });
    lacunas.push(`Já existe trabalho neste ticket nos repositórios (${nB} branch(es), ${nC} commit(s) soltos ou integrados): leia ${TRABALHO} antes de planejar.`);
  }

  // Níveis, prontidão e modo
  const niveis = { alvo: nivelDe(eixos.alvo), pronto: nivelDe(eixos.pronto), onde: nivelDe(eixos.onde) };
  const prontidao = rank(niveis.alvo) >= rank('gerado') && rank(niveis.pronto) >= rank('gerado') ? 'alta' : rank(niveis.alvo) >= rank('bruto') ? 'media' : 'baixa';
  const modo = niveis.alvo === 'aprovado' && (aprovado(4) || aprovadas.length) ? 'executar'
    : diagOk ? 'corrigir' : rank(niveis.alvo) >= rank('verbal') ? 'entender' : 'perguntar';
  if (niveis.pronto === 'ausente') lacunas.push('Sem critério de pronto: nenhuma spec, cenário de QA ou reprodução. O Entendimento vai propor um e você aprova.');
  if (niveis.onde === 'ausente') lacunas.push('Sem indicação de onde mexer: a Varredura vai mapear o código do zero.');

  // Capacidades
  const { banco, repos, semBranch } = capacidadesDe(o, lacunas);

  return {
    versao: 1, ticket: t.chave, titulo: t.titulo || t.documento?.nome || '', gerado: new Date().toISOString(),
    eixos, niveis, fontes, prontidao, modo, lacunas, trabalho, capacidades: { banco, repos, semBranch },
    ...(() => { const cat = tipoTicket.categoriaDe({ ...t, tipo: o.j?.tipo || t.tipo });
      return { tipoTicket: String(o.j?.tipo || t.tipo || ''), categoria: cat, exigeReproducao: tipoTicket.exigeReproducao(cat) }; })(),
    exigeAprovacaoEntendimento: modo !== 'executar' && prontidao !== 'alta'
  };
}

const ROTULO_MODO = { executar: 'Executar (spec e tarefas aprovadas)', corrigir: 'Corrigir (incidente diagnosticado)', entender: 'Entender primeiro (sem refinamento)', perguntar: 'Perguntar (só o título)' };
const ROTULO_EIXO = { alvo: 'Alvo: o que tem que mudar', pronto: 'Critério de pronto: como saber que acabou', onde: 'Onde mexer' };

/** Markdown do dossiê (a IA e a aba Dossiê leem daqui).
 * @param {any} d  @param {{ eixos: Record<string, string>, modos: Record<string, string>, nome: string }} [o] rótulos: o padrão é o da Implementação */
function paraMarkdown(d, o = { eixos: ROTULO_EIXO, modos: ROTULO_MODO, nome: 'Dossiê' }) {
  const sec = (e) => `## ${o.eixos[e]} · ${d.niveis[e]}\n\n` + (d.eixos[e].length
    ? d.eixos[e].map((i) => `- **${i.rotulo}** (${i.confianca})${i.detalhe ? ` · ${i.detalhe}` : ''}${i.arquivo ? `\n  ${i.arquivo}` : ''}`).join('\n') : '- (nada encontrado)');
  return [`# ${o.nome} · ${d.ticket}${d.titulo ? ` · ${d.titulo}` : ''}`, '',
    `Modo: **${o.modos[d.modo]}** · Prontidão: **${d.prontidao}**`, '',
    ...(d.exigeReproducao ? [`Tipo do ticket: **${d.tipoTicket}**${d.categoria ? ` (${tipoTicket.rotulo(d.categoria)})` : ''}: exige a etapa de Reprodução (confirmar que o erro acontece) antes de desenvolver. Resultado: ${REPRODUCAO}`, ''] : []),
    ...Object.keys(o.eixos).flatMap((e) => [sec(e), '']),
    '## Capacidades', '', `- Banco: ${d.capacidades.banco === 'leitura' ? 'somente leitura (mapa-db)' : 'indisponível'}`,
    ...d.capacidades.repos.map((r) => `- Repositório ${r.camada}: ${r.caminho} · branch principal: ${r.branchPrincipal || '(não configurada)'}`), '',
    ...(d.trabalho?.length ? ['## Trabalho já feito', '', ...d.trabalho.flatMap((t) => [`- ${path.basename(t.caminho)} (${t.camada}): ${t.branches.map((b) => `\`${b.nome}\` (${b.adiante} à frente)`).join(', ') || 'sem branch com a chave'}${t.foraDeBranch.length ? ` · ${t.foraDeBranch.length} commit(s) soltos` : ''}${t.integrados.length ? ` · ${t.integrados.length} já integrado(s)` : ''}`]), `  Detalhe: ${TRABALHO}`, ''] : []),
    '## Lacunas', '', ...(d.lacunas.length ? d.lacunas.map((l) => `- ${l}`) : ['- (nenhuma)']), ''].join('\n');
}

/** Grava dossie.json e dossie.md em <dir>. */
function gravar(dir, d) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, JSON_), JSON.stringify(d, null, 2));
  fs.writeFileSync(path.join(dir, MD), paraMarkdown(d));
  if (d.trabalho?.length) fs.writeFileSync(path.join(dir, TRABALHO), trabalhoParaMarkdown(d.trabalho, d.ticket));
  else fs.rmSync(path.join(dir, TRABALHO), { force: true }); // não deixa um arquivo velho enganar a IA
}
const lerGravado = (dir) => ler(path.join(dir, JSON_), null);

module.exports = { montar, sobreTicket, capacidadesDe, rank, ehBug, paraMarkdown, gravar, lerGravado, nivelDe, trabalhoExistente, trabalhoParaMarkdown, NIVEIS, ROTULO_MODO, BRIEFING, JSON_, MD, TRABALHO, REPRODUCAO, _teste: { rank, reChave } };
