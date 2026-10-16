// @ts-check
// ── Verificação feita pela extensão: depois de cada execução de passo, confere o que ficou em disco. Passo que não concluiu ou
// artefato que não presta volta ao Claude com o problema (MAX_CORRECOES vezes); esgotou, pausa e a aba Spec mostra o motivo.
const fs = require('fs');
const path = require('path');
const { arquivoPasso, estadoSpec } = require('../locais');
const { papelDoTicket } = require('../estado');

const MAX_CORRECOES = 2,
  MIN_CARACTERES = 200;
// Mesmas contagens do sdd-state (contar): o que o passo precisa ter para valer.
const EXIGE = {
  1: [/\bRF\d{2,}\b/, 'nenhum requisito (RFnn)'],
  2: [/\bRF\d{2,}\b/, 'nenhum requisito (RFnn)'],
  4: [/\bt\d{2,}\b/, 'nenhuma tarefa (tNN)'],
  6: [/\bCT\d{2,}\b/, 'nenhum caso de teste (CTnn)']
};
/** @returns {{ tipo: 'concluir'|'artefato', texto: string }|null} */
const problemaDoPasso = (t, n) => {
  const p = estadoSpec(t)?.passos?.[n];
  if (!p) return null;
  if (!['aguardando_revisao', 'aprovado'].includes(p.status))
    return { tipo: 'concluir', texto: `o passo ${n} (${p.titulo}) terminou sem concluir (sdd-state concluir ${n})` };
  const arq = arquivoPasso(t, n),
    nome = path.basename(arq);
  let texto;
  try {
    texto = fs.readFileSync(arq, 'utf8');
  } catch {
    return { tipo: 'artefato', texto: `${nome} não existe` };
  }
  if (texto.trim().length < MIN_CARACTERES)
    return { tipo: 'artefato', texto: `${nome} está vazio ou curto demais (menos de ${MIN_CARACTERES} caracteres)` };
  if (EXIGE[n] && !EXIGE[n][0].test(texto)) return { tipo: 'artefato', texto: `${nome} tem ${EXIGE[n][1]}` };
  if (n === 3 && papelDoTicket(t).papel === 'quebrar')
    return /Decomposi/i.test(texto) ? null : { tipo: 'artefato', texto: `${nome} sem a seção "Decomposição"` };
  if (n === 3 && !(/Mapeamento do código/i.test(texto) && /Conformidade com a Constitui/i.test(texto)))
    return {
      tipo: 'artefato',
      texto: `${nome} sem as seções "Mapeamento do código" e "Conformidade com a Constituição"`
    };
  return null;
};

module.exports = { MAX_CORRECOES, MIN_CARACTERES, EXIGE, problemaDoPasso };
