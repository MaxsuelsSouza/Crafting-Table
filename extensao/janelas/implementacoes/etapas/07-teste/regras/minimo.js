// @ts-check
// Mínimo do score do Teste na aplicação por atividade (PURO, sem disco). Usado pela 7.1 (exige CT de regressão), pela 7.4 (grava no
// teste.json) e pela aba Teste (explica o número). Base pela categoria do ticket (infra/ticket/tipo-ticket.js): incidente 4, bug 4,
// bug experimental 3, outro 3 (história, melhoria, tarefa). Prioridade alta +1, baixa −1; área sensível nos caminhos do diff +1;
// o resultado fica sempre entre 2 e 5. Diff grande (mais de 15 arquivos ou mais de 400 linhas) não muda o mínimo, mas exige ao menos
// 1 CT de regressão (exigeRegressao).
const BASE = { incidente: 4, bug: 4, 'bug-experimental': 3, outro: 3 };
const SENSIVEL = /auth|login|permiss|pagamento|financ|fiscal|nota|estoque|migra|\.sql$/i;
const ALTA = /highest|high|alt(a|issima)|critic|blocker|urgent/i,
  BAIXA = /lowest|low|baixa|trivial|minor/i;
const GRANDE = { arquivos: 15, linhas: 400 };
const semAcento = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * @param {{ categoria?: string|null, prioridade?: string, caminhos?: string[], linhas?: number }} o
 * @returns {{ minimo: number, base: number, ajustes: { delta: number, motivo: string }[], exigeRegressao: boolean, sensiveis: string[] }}
 */
function minimo({ categoria, prioridade = '', caminhos = [], linhas = 0 } = {}) {
  const cat = categoria && categoria in BASE ? categoria : 'outro',
    base = BASE[cat],
    ajustes = [];
  const p = semAcento(prioridade);
  if (ALTA.test(p)) ajustes.push({ delta: 1, motivo: `prioridade ${prioridade}` });
  else if (BAIXA.test(p)) ajustes.push({ delta: -1, motivo: `prioridade ${prioridade}` });
  const sensiveis = caminhos.filter((c) => SENSIVEL.test(c));
  if (sensiveis.length)
    ajustes.push({ delta: 1, motivo: `área sensível no diff (${sensiveis.slice(0, 3).join(', ')})` });
  const bruto = ajustes.reduce((n, a) => n + a.delta, base);
  return {
    minimo: Math.max(2, Math.min(5, bruto)),
    base,
    ajustes,
    exigeRegressao: caminhos.length > GRANDE.arquivos || linhas > GRANDE.linhas,
    sensiveis
  };
}

module.exports = { minimo, BASE, SENSIVEL, GRANDE };
