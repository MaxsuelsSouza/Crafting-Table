// @ts-check
// Utilidades da aba Spec usadas por mais de um arquivo desta pasta: pasta do ticket, nome do provedor e a cópia aprovada de um passo.
const path = require('path');
const { nomeProvedor: nomeAtivo } = require('../../../provedores');
const nomeProvedor = (t) =>
  t && (t.provedor === 'documento' || String(t.site || '').startsWith('documento:')) ? 'documento' : nomeAtivo();
const tickets = require('../../../infra/tickets');
const { arquivoPasso } = require('../../locais');

const pasta = (id) => tickets.pasta(id);
const copiaAprovada = (r, n) => path.join(pasta(r.id), 'aprovados', `${n}-${path.basename(arquivoPasso(r, n))}`); // gravada pelo sdd-state aprovar

module.exports = { pasta, nomeProvedor, copiaAprovada };
