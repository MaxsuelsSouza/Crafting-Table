// @ts-check
// Situação de um ticket em cada módulo, lida do disco (sem vscode): o texto e a cor da pill do card na lista.
//   Refinamento: .ticket.json (refinamento.estado) · Implementações: .esteira.json · Incidentes: .mergulho.json · QA: .qa.json
// Devolve { texto, cor, dica } ou null (módulo ainda não iniciado para o ticket). cor: as do pill.js (ia | pausada | andando | ok | novo).
const fs = require('fs');
const path = require('path');
const tickets = require('./tickets');

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
const QA = { procurando: ['Procurando plano', 'ia'], criando: ['Criando plano', 'ia'], alterando: ['Ajustando plano', 'ia'], erro: ['Erro', 'pausada'],
  sem_plano: ['Sem plano', 'novo'], plano_encontrado: ['Plano aguardando aprovação', 'andando'], plano_aprovado: ['Plano aprovado', 'ok'] };

/** @param {any} t ticket local @param {string} modulo refinamento | impl | incidentes | qa */
function situacaoDe(t, modulo) {
  const dir = (l) => tickets.pasta(t.chave, l);
  if (modulo === tickets.REFINAMENTO) {
    const m = t.refinamento?.estado;
    return m === 'rodando' ? { texto: 'Refinando', cor: 'ia', dica: 'Modo refinamento: o Claude trabalha nos passos da spec' }
      : m === 'pausado' ? { texto: 'Refinamento pausado', cor: 'pausada', dica: '' }
      : m === 'aguardando_inicio' ? { texto: 'Preparando spec', cor: 'ia', dica: '' } : null;
  }
  if (modulo === 'impl') { const e = lerJson(path.join(dir('impl'), '.esteira.json')); return e ? etapas(e, 'Implementando') : null; }
  if (modulo === 'incidentes') { const e = lerJson(path.join(dir('incidentes'), '.mergulho.json')); return e ? etapas(e, 'Investigando') : null; }
  if (modulo === 'qa') {
    const q = lerJson(path.join(dir('qa'), '.qa.json'));
    if (!q) return null;
    if (q.execucao === 'rodando') return { texto: 'Executando cenários', cor: 'ia', dica: '' };
    const [texto, cor] = QA[q.fase] || [];
    return texto ? { texto, cor, dica: '' } : null;
  }
  return null;
}

module.exports = { situacaoDe };
