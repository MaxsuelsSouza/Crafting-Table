// @ts-check
// Leitores e nomes de arquivo da pasta do ticket comuns a todos os módulos (saíram de refinamento/locais.js, que reexporta).
// Onde é usado: painel.js, notas.js, notificacoes.js, rodape.js, aba-docs.js, conversas.js, implementacoes/dossie.js,
// incidentes/orquestrador/portao-ticket.js e o próprio Refinamento.
// Como usar: const { ler, lerTexto, NOTAS, ORIGEM, decisoesDe, ticketDe } = require('../infra/pasta-ticket');
//   ler(arq, padrao) JSON ou padrão · lerTexto(arq) texto ou null · decisoesDe(dir) aba Decisões, mais recentes primeiro
//   ticketDe(chave) ticket local com id = chave · pasta(id) = tickets.pasta(id)
const fs = require('fs');
const path = require('path');
const tickets = require('./tickets');

const pasta = (id) => tickets.pasta(id);

// Leitores e nomes de arquivo da pasta do ticket.
const ler = (arq, padrao) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; } };
const lerTexto = (arq) => { try { return fs.readFileSync(arq, 'utf8'); } catch { return null; } };
const NOTAS = '.notas.html';
const ORIGEM = '.origem.json'; // { "arquivo.pdf": { origem: <id do provedor, 'jira' nos antigos>, id: '123' } }: documentos que vieram de fora
const decisoesDe = (dir) => {
  const l = dir ? ler(path.join(dir, '.decisoes.json'), []) : [];
  return Array.isArray(l) ? l.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))) : [];
};

// Ticket com id = chave (as funções da spec usam r.id para achar a pasta); estado da spec e ticket pronto para as abas.
const ticketDe = (chave) => { const t = tickets.ler(chave); return t && { ...t, id: chave }; };

module.exports = { pasta, ler, lerTexto, NOTAS, ORIGEM, decisoesDe, ticketDe };
