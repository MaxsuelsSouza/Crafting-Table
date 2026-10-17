// @ts-check
// Nome da branch do ticket no padrão do repositório: <prefixo>/<CHAVE>, uma por ticket, sem slug (CLAUDE.md, "Branches"). O prefixo é o mais usado
// nas últimas 300 branches remotas entre os candidatos do tipo do ticket (história → story ou feature…); sem histórico, o primeiro candidato.
// É um palpite: quem cria a branch confirma antes (Implementações: pausa 'criar').
// propria(): a branch do ticket que já existe (<qualquer prefixo>/<CHAVE> ou só <CHAVE>), local ou no origin, a mais recente.
const { git } = require('./git');

// Candidatos por tipo do ticket (nome do tipo na ferramenta ou a categoria de infra/ticket/tipo-ticket.js), na ordem de preferência.
const CANDIDATOS = [
  [/incident/i, ['hotfix']],
  [/bug|defeito|defect|falha|erro|problema/i, ['bugfix', 'fix']],
  [/stor(y|ies)|hist[óo]ria/i, ['story', 'feature']],
  [/task|tarefa/i, ['task', 'feature']],
  [/melhoria|improvement|reform/i, ['reform', 'feature']],
  [/epic|[ée]pico|feature|funcionalidade/i, ['feature']]
];
/** @param {string} tipo */
const candidatos = (tipo) => CANDIDATOS.find(([re]) => /** @type {RegExp} */ (re).test(String(tipo || '')))?.[1] || ['feature'];
const cwdDe = (repo) => (typeof repo === 'string' ? repo : repo.caminho);
const lista = (cwd, args) => {
  try {
    return git(cwd, args).split('\n').filter(Boolean);
  } catch {
    return [];
  }
};

/**
 * @param {string | { caminho: string }} repo
 * @param {{ chave: string, tipo?: string }} o
 * @returns {{ nome: string, prefixo: string, porque: string }}
 */
function nomeSugerido(repo, { chave, tipo }) {
  const cand = /** @type {string[]} */ (candidatos(tipo || ''));
  const nomes = lista(cwdDe(repo), ['for-each-ref', '--sort=-committerdate', '--count=300', '--format=%(refname:lstrip=3)', 'refs/remotes/origin']);
  const conta = Object.fromEntries(cand.map((p) => [p, nomes.filter((n) => n.startsWith(`${p}/`)).length]));
  const prefixo = cand.reduce((a, p) => (conta[p] > conta[a] ? p : a), cand[0]);
  const porque = conta[prefixo]
    ? `${prefixo}/ é o mais usado para "${tipo || 'outro'}" nas últimas ${nomes.length} branches remotas (${cand.map((p) => `${p}/ ${conta[p]}`).join(', ')})`
    : `sem histórico de ${cand.map((p) => `${p}/`).join(' ou ')} no repositório: usei o primeiro candidato para "${tipo || 'outro'}"`;
  return { nome: `${prefixo}/${chave}`, prefixo, porque };
}

// A branch do ticket que já existe: nome = <prefixo>/<CHAVE> ou <CHAVE> (sem slug; "KAN-5" não casa com "KAN-50"; merge/ e revert/ não contam). Local vence remota.
/** @returns {{ nome: string, local: boolean } | null} */
function propria(repo, chave) {
  const esc = String(chave).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    re = new RegExp(`^([^/]+/)?${esc}$`, 'i');
  const refs = lista(cwdDe(repo), ['for-each-ref', '--sort=-committerdate', '--format=%(refname)', 'refs/heads', 'refs/remotes/origin'])
    .map((r) => ({ nome: r.replace(/^refs\/heads\/|^refs\/remotes\/origin\//, ''), local: r.startsWith('refs/heads/') }))
    .filter((r) => re.test(r.nome) && !/^(merge|revert)\//i.test(r.nome));
  return refs.find((r) => r.local) || refs[0] || null;
}

module.exports = { CANDIDATOS, candidatos, nomeSugerido, propria };
