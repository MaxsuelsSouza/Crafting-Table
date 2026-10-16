// @ts-check
// Situação de um ticket em cada módulo, lida do disco (sem vscode): o texto e a cor da pill do card na lista.
//   Refinamento: .ticket.json (refinamento.estado) · Implementações: .esteira.json · Incidentes: .mergulho.json · QA: .qa.json (qa/situacao.js)
// Devolve { texto, cor, dica } ou null (módulo ainda não iniciado para o ticket). cor: as do pill.js (ia | pausada | andando | ok | novo).
const fs = require('fs');
const path = require('path');
const tickets = require('./tickets');
const inc = require('../incidentes/incidentes');
const ref = require('../refinamento/refinamento');
const qa = require('../qa/qa');

const lerJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
// "rodando" gravado só vale com a janela dona viva (senão a execução foi interrompida).
const fase = (e) => (e.fase === 'rodando' && !(e.host && vivo(e.host)) ? 'parado' : e.fase);

function etapas(e, nomeEtapa) {
  const f = fase(e), n = e.etapa || 1;
  if (f === 'rodando') return { texto: `${nomeEtapa} · etapa ${n}`, cor: 'ia', dica: 'O Claude está trabalhando' };
  if (f === 'pausado') return { texto: 'Pausado', cor: 'pausada', dica: e.pausa?.pergunta || 'Aguardando resposta' };
  if (f === 'aguardando') return { texto: 'Aguardando aprovação', cor: 'andando', dica: `Etapa ${n} pronta para revisão` };
  if (f === 'erro') return { texto: 'Erro', cor: 'pausada', dica: 'A última etapa falhou' };
  if (f === 'concluido') return { texto: 'Concluído', cor: 'ok', dica: '' };
  return n > 1 ? { texto: `Parado · etapa ${n}`, cor: 'novo', dica: 'Interrompido: ▶ continua de onde parou' } : null;
}

/** @param {any} t ticket local @param {string} modulo refinamento | impl | incidentes | qa */
function situacaoDe(t, modulo) {
  const dir = (l) => tickets.pasta(t.chave, l);
  if (modulo === ref.ID) return ref.situacao(t);
  if (modulo === 'impl') { const e = lerJson(path.join(dir('impl'), '.esteira.json')); return e ? etapas(e, 'Implementando') : null; }
  if (modulo === inc.ID) { const e = lerJson(path.join(dir(inc.ID), inc.SITUACAO.arquivo)); return e ? etapas(e, inc.SITUACAO.rotulo) : null; }
  if (modulo === qa.ID) return qa.situacao(t);
  return null;
}

module.exports = { situacaoDe };
