// @ts-check
const vagas = require('../../../infra/agentes/etapas');
const { SKILL, QA_STATE, REGRAS, citarRespostas } = require('../../orquestrador/prompt-comum');

// Pré-condição (antes da suíte, fora da lista de cenários): confirma que a aplicação subiu, que a rede responde e que o login abre sessão autenticada.
const promptPreCondicao = (chave, amb, dir = '') =>
  `[segundo plano · Crafting Table · QA de ${chave}] PRÉ-CONDIÇÃO da suíte (Health Check e Autenticação), antes de qualquer cenário. ` +
  `Use o método da skill testes-funcionais (${SKILL()}/SKILL.md).${vagas.aviso('qa.execucao')}${citarRespostas(dir)}\n` +
  `Ambiente: backend ${amb.backend || '?'} · mobile ${amb.mobile || '?'} · API http://localhost:5111 · Metro 8081 · emulador ligado.\n` +
  '1) Health check: a aplicação (API e app) subiu e responde. 2) Rede: uma requisição real à API volta com resposta válida. ' +
  '3) Autenticação: faça o login com o usuário de teste da skill (credenciais do ambiente, nunca as mostre) e CONFIRME a sessão autenticada (tela pós-login ou token/usuário na resposta). ' +
  'Não execute cenário nenhum e não altere dado. ' +
  `OBRIGATÓRIO ao final: ${QA_STATE} precondicao --status ok|falhou --nota "<1 frase: o que foi confirmado, ou o motivo exato da falha>". ${REGRAS}`;

module.exports = { promptPreCondicao };
