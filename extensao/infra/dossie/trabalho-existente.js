// @ts-check
const fs = require('fs');
const path = require('path');
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

module.exports = { trabalhoExistente, trabalhoParaMarkdown, reChave };
