// @ts-check
// Onde está o código do ticket num repositório (só leitura; o único efeito é o fetch). Busca pela chave na MENSAGEM dos commits ([WMS-123],
// cherry-pick e squash inclusos) e no NOME das branches, nesta ordem:
//   1. fetch --prune (falha vira aviso, segue com o que tem)
//   2. candidatas (craftingTable.branchesCandidatas: pre-releases/*, releases/*…), mais recentes primeiro: commits da chave fora da principal
//   3. principal ("já em produção")
//   4. branch com a chave no nome (sem merge/* e revert/*)
//   5. qualquer outra ref remota que contenha um commit da chave (no máximo 5): mostra o padrão que faltou na configuração (ex.: homolog/v84)
// escolher(): 0 achados → null; todos da mesma família (mesmo prefixo, ex.: origin/pre-releases/) → o mais recente; senão a lista, para perguntar.
// refParaReproduzir(): o código em que um bug/incidente é reproduzido (frente D). GitLab fica para a fase 2.
const { git } = require('./git');
const { reChave } = require('../dossie/trabalho-existente');

const CANDIDATAS_PADRAO = ['pre-releases/*', 'releases/*'];
const MAX_CANDIDATAS = 20; // ponytail: só as 20 refs candidatas mais recentes; aumentar se o código ficar em release antiga
const MAX_OUTRAS = 5;
const FMT = '%h%x09%aI%x09%s';
const IGNORAR = /^(origin\/)?(merge|revert)\//i;

const linhas = (cwd, args) => {
  try {
    return git(cwd, args).split('\n').filter(Boolean);
  } catch {
    return [];
  }
};
const commit = (l) => {
  const [hash, data, ...ass] = l.split('\t');
  return { hash, data, assunto: ass.join('\t') };
};
const grepDe = (chaves) => ['-i', '-E', `--grep=${reChave(chaves).source}`];
// Ref da principal para comparar: origin/<principal> se existir, senão a local.
const refPrincipal = (cwd, principal) =>
  !principal ? '' : linhas(cwd, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${principal}`]).length ? `origin/${principal}` : linhas(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${principal}`]).length ? principal : '';
// refs (nome curto e data do último commit), mais recentes primeiro
const refs = (cwd, padroes) =>
  linhas(cwd, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)%09%(committerdate:iso-strict)', ...padroes]).map((l) => {
    const [ref, data] = l.split('\t');
    return { ref, data };
  });

/**
 * @param {{ caminho: string, branchPrincipal?: string }} repo
 * @param {string[]} chaves chave do ticket (e, se quiser, das subtarefas, do pai…)
 * @param {{ candidatas?: string[], buscar?: boolean }} [o]
 * @returns {{ achados: { ref: string, via: 'candidata'|'principal'|'chave-no-nome'|'outra', commits: { hash: string, data: string, assunto: string }[], data: string }[], faltando: string[], aviso: string }}
 */
function localizar(repo, chaves, o = {}) {
  const cwd = repo.caminho,
    re = reChave(chaves),
    grep = grepDe(chaves);
  let aviso = '';
  if (o.buscar !== false)
    try {
      git(cwd, ['fetch', '--prune', 'origin'], { timeout: 120000 });
    } catch (x) {
      aviso = `fetch falhou (segui com o que já estava baixado): ${String(x.stderr || x.message).trim().split('\n')[0]}`;
    }
  const base = refPrincipal(cwd, repo.branchPrincipal),
    fora = base ? ['--not', base] : [];
  const achados = [];
  const tem = (ref) => achados.some((a) => a.ref === ref);
  // 2. candidatas
  const cands = refs(cwd, (o.candidatas || CANDIDATAS_PADRAO).map((p) => `refs/remotes/origin/${p}`)).slice(0, MAX_CANDIDATAS);
  for (const c of cands) {
    const commits = linhas(cwd, ['log', c.ref, ...fora, ...grep, `--format=${FMT}`, '-n', '15']).map(commit);
    if (commits.length) achados.push({ ...c, via: 'candidata', commits });
  }
  // 3. principal
  if (base) {
    const commits = linhas(cwd, ['log', base, ...grep, `--format=${FMT}`, '-n', '15']).map(commit);
    if (commits.length) achados.push({ ref: base, via: 'principal', commits, data: commits[0].data });
  }
  // 4. chave no nome (a remota vence a local de mesmo nome)
  const nomes = new Set();
  for (const r of refs(cwd, ['refs/remotes/origin', 'refs/heads']).sort((a, b) => Number(!a.ref.startsWith('origin/')) - Number(!b.ref.startsWith('origin/')))) {
    const nome = r.ref.replace(/^origin\//, '');
    if (!re.test(nome) || IGNORAR.test(nome) || r.ref === base || nome === 'HEAD' || tem(r.ref) || nomes.has(nome)) continue;
    nomes.add(nome);
    achados.push({ ...r, via: 'chave-no-nome', commits: linhas(cwd, ['log', r.ref, ...fora, `--format=${FMT}`, '-n', '15']).map(commit) });
  }
  // 5. outra ref remota com um commit da chave
  const soltos = linhas(cwd, ['log', '--remotes', ...fora, ...grep, `--format=${FMT}`, '-n', '10']).map(commit);
  const outras = new Map();
  for (const c of soltos)
    for (const ref of linhas(cwd, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', '--contains', c.hash, 'refs/remotes/origin']))
      if (!tem(ref) && !IGNORAR.test(ref) && !ref.endsWith('/HEAD') && ref !== 'origin') outras.set(ref, [...(outras.get(ref) || []), c]);
  for (const [ref, commits] of [...outras].slice(0, MAX_OUTRAS)) achados.push({ ref, via: 'outra', commits, data: refs(cwd, [`refs/remotes/${ref}`])[0]?.data || '' });
  // ponytail: "faltando" olha o assunto dos commits e o nome da ref (não o corpo da mensagem)
  const faltando = chaves.filter((k) => !achados.some((a) => reChave([k]).test(a.ref) || a.commits.some((c) => reChave([k]).test(c.assunto))));
  return { achados, faltando, aviso };
}

const familia = (ref) => ref.replace(/[^/]*$/, '');
/** 0 → null; 1 ou todos da mesma família → o mais recente; senão a lista (empate real: perguntar). */
function escolher(achados) {
  if (!achados?.length) return null;
  const recente = [...achados].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  return new Set(achados.map((a) => familia(a.ref))).size === 1 ? recente[0] : recente;
}

/**
 * Código em que o bug/incidente é reproduzido: a principal (produção); achado em homologação → a candidata (pre-release) do localizar.
 * @param {{ caminho: string, branchPrincipal?: string }} repo
 * @param {string[]} chaves
 * @param {{ categoria?: string | null, achadoEmHomologacao?: boolean, candidatas?: string[], buscar?: boolean }} [o]
 * @returns {{ ref: string, commit: string, origem: 'principal'|'candidata', motivo: string } | null}
 */
function refParaReproduzir(repo, chaves, o = {}) {
  if (!['incidente', 'bug', 'bug-experimental'].includes(String(o.categoria))) return null;
  const sha = (ref) => linhas(repo.caminho, ['rev-parse', ref])[0] || '';
  if (o.achadoEmHomologacao) {
    const cands = localizar(repo, chaves, o).achados.filter((a) => a.via === 'candidata');
    const e = escolher(cands);
    const a = Array.isArray(e) ? e[0] : e;
    if (a) return { ref: a.ref, commit: sha(a.ref), origem: 'candidata', motivo: `achado em homologação: ${a.ref} tem ${a.commits.length} commit(s) da chave${Array.isArray(e) ? ` (havia ${e.length}; usei a mais recente)` : ''}` };
    return null;
  }
  const base = refPrincipal(repo.caminho, repo.branchPrincipal);
  return base ? { ref: base, commit: sha(base), origem: 'principal', motivo: `${o.categoria === 'incidente' ? 'incidente' : 'bug'} reproduz na principal (produção)` } : null;
}

module.exports = { CANDIDATAS_PADRAO, localizar, escolher, refParaReproduzir, refPrincipal };
