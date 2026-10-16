// @ts-check
const { provedorAtivo, provedorPara } = require('.');
const { OPERACOES } = require('./contrato');
const { folhaTicket, corStatus, estiloDetalhe } = require('../../componentes/folha-ticket');

// Fachada do provedor de gestão de trabalho (infra/provedores/): cada operação vai para o provedor ativo, escolhido na hora da
// chamada, salvo ticket-documento (alvo/site 'documento:…' ou anexo com provedor 'documento'), que vai ao adaptador local (trocar de provedor nas configurações vale sem recarregar). A folha e o estilo da aba Ticket moram em componentes/folha-ticket.js.
const operacoes = Object.fromEntries(OPERACOES.map((op) => [op, (...a) => provedorPara(a)[op](...a)]));

// Ticket gravado (infra/ticket/tickets.js) → alvo das operações; link colado → identidade { id, chave, projeto, site, provedor } para tickets.criar.
const alvo = (t) => require('../ticket/tickets').alvo(t);
const identidade = (link) => ({ ...provedorAtivo().lerLink(link), provedor: provedorAtivo().id });

const ehDocumento = (t) => !!t && (t.provedor === 'documento' || String(t.site || '').startsWith('documento:'));

exports.jira = { ...operacoes, alvo, ehDocumento, identidade, get nome() { return provedorAtivo().nome; }, get capacidades() { return provedorAtivo().capacidades; }, folhaTicket, corStatus, estiloDetalhe };
