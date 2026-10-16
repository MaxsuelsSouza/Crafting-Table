// @ts-check
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const { lerJson, gravarJson, mudar } = require('../estado');
const { PAUSA } = require('./prompt-comum');

// Pausa de verdade, pedida pelo Claude (qa-state pausa → .pausa.json) ou pela extensão (briefing): fica em .qa.json e aparece como pergunta no cartão.
const pausaPendente = (dir) => {
  const p = lerJson(path.join(dir, PAUSA), null);
  return p?.pergunta
    ? {
        motivo: String(p.motivo || ''),
        pergunta: String(p.pergunta),
        opcoes: Array.isArray(p.opcoes) ? p.opcoes.map(String) : [],
        etapa: p.etapa || '',
        detalhe: p.detalhe ? String(p.detalhe) : ''
      }
    : null;
};
function registrarPausa(dir, { motivo = '', pergunta, opcoes = [], etapa = '', detalhe = '' }) {
  if (!String(pergunta || '').trim()) throw new Error('a pergunta é obrigatória');
  gravarJson(path.join(dir, PAUSA), {
    motivo,
    pergunta: String(pergunta).trim(),
    opcoes,
    etapa,
    detalhe,
    em: new Date().toISOString()
  });
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

module.exports = { pausaPendente, registrarPausa, absorverPausa };
