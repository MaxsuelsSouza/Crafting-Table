// @ts-check
// Confere o plano das subtarefas antes do portão (0.4). Devolve a lista de erros (vazia = válido):
//   1 ou 2 grupos (custo: no máximo 2 agentes) · cada subtarefa aberta em exatamente um grupo, nenhuma concluída ou desconhecida
//   execução coerente: unico = 1 grupo; sequencia = G2 depende do G1; paralelo = sem dependência, arquivos previstos e nenhum em comum
const MAX_GRUPOS = 2;
const EXECUCOES = ['unico', 'sequencia', 'paralelo'];

/** @param {{ execucao: string, grupos: any[] }} p @param {string[]} abertas chaves das subtarefas abertas @param {string[]} concluidas */
function validarPlano(p, abertas, concluidas = []) {
  const erros = [],
    gs = p.grupos || [];
  if (!gs.length) return ['Nenhum grupo encontrado (seções "## G1 · título").'];
  if (gs.length > MAX_GRUPOS) erros.push(`${gs.length} grupos: o máximo é ${MAX_GRUPOS}. Junte as subtarefas.`);
  const ids = gs.map((g) => g.id);
  if (new Set(ids).size !== ids.length) erros.push(`Grupos com o mesmo id: ${ids.join(', ')}.`);
  if (!EXECUCOES.includes(p.execucao))
    erros.push(`"Execução: ${p.execucao || '?'}" inválida: use unico, sequencia ou paralelo.`);
  const vistas = new Map();
  for (const g of gs) {
    if (!g.subtarefas.length) erros.push(`${g.id} não tem subtarefas.`);
    for (const k of g.subtarefas) {
      if (vistas.has(k)) erros.push(`${k} está em ${vistas.get(k)} e em ${g.id}: cada subtarefa fica em um grupo só.`);
      vistas.set(k, g.id);
      if (concluidas.includes(k)) erros.push(`${k} já está concluída: não entra em grupo (cite em "Já feito").`);
      else if (!abertas.includes(k)) erros.push(`${k} (em ${g.id}) não é subtarefa aberta deste ticket.`);
    }
    for (const d of g.dependeDe) {
      if (d === g.id) erros.push(`${g.id} depende de si mesmo.`);
      else if (!ids.includes(d)) erros.push(`${g.id} depende de ${d}, que não existe.`);
    }
  }
  const faltam = abertas.filter((k) => !vistas.has(k));
  if (faltam.length) erros.push(`Subtarefas abertas fora de todos os grupos: ${faltam.join(', ')}.`);
  if (gs.length === 2) {
    const [a, b] = gs;
    if (a.dependeDe.includes(b.id) && b.dependeDe.includes(a.id))
      erros.push(`${a.id} e ${b.id} dependem um do outro (ciclo).`);
    if (p.execucao === 'unico') erros.push('"Execução: unico" com 2 grupos: use sequencia ou paralelo.');
    if (p.execucao === 'sequencia' && !b.dependeDe.includes(a.id))
      erros.push(`"Execução: sequencia": ${b.id} precisa de "Depende de: ${a.id}".`);
    if (p.execucao === 'paralelo') {
      if (a.dependeDe.length || b.dependeDe.length) erros.push('"Execução: paralelo" com dependência: use sequencia.');
      if (!a.arquivos.length || !b.arquivos.length)
        erros.push('"Execução: paralelo" exige os arquivos previstos de cada grupo.');
      const comuns = a.arquivos.filter((x) => b.arquivos.includes(x));
      if (comuns.length)
        erros.push(`"Execução: paralelo" com arquivo nos dois grupos (${comuns.join(', ')}): use sequencia.`);
    }
  } else if (gs.length === 1 && p.execucao && p.execucao !== 'unico') erros.push('Um grupo só: use "Execução: unico".');
  return erros;
}

module.exports = { MAX_GRUPOS, validarPlano };
