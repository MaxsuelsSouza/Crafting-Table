// @ts-check
const path = require('path');
const vagas = require('../../../agentes/etapas');
const { SKILL_AMB, QA_STATE } = require('../../orquestrador/prompt-comum');
const { LOG_AMB } = require('./estado');

// Ambiente parou: o Claude lê o log e o diagnóstico da skill (só leitura) e grava a análise com `qa-state analise`.
const promptAnalise = (chave, dir, a) =>
  `[segundo plano · Crafting Table · QA de ${chave}] O preparo do ambiente de testes (preparar-ambiente.py da skill ` +
  `testes-funcionais) parou na etapa "${a.parou_em}"${a.erro ? ` (${a.erro})` : ''}. Descubra por quê.\nLog completo do preparo: ${path.join(dir, LOG_AMB)}\n` +
  `Use o diagnóstico da skill: ${SKILL_AMB()}/references/diagnostico.md e ${SKILL_AMB()}/references/ambiente-execucao.md. ` +
  vagas.aviso('qa.ambiente') +
  `Investigue só lendo (log da API em testes-funcionais/resultados/api-*.log do backend, portas, processos, ~/.wms-testes.env sem mostrar senhas): não suba, derrube nem instale nada.\n` +
  'Responda em português, curto, neste formato:\nCausa: <1 a 2 frases>\nEvidência: <a linha do log ou o fato que prova>\nComo resolver:\n1. <passo>\n' +
  `Grave a resposta com: ${QA_STATE} analise <<'FIM'\n<resposta>\nFIM`;
const FERRAMENTAS_ANALISE = [
  'Read',
  'Glob',
  'Grep',
  `Bash(${QA_STATE}:*)`,
  'Bash(cat:*)',
  'Bash(tail:*)',
  'Bash(head:*)',
  'Bash(ls:*)',
  'Bash(grep:*)',
  'Bash(ss:*)',
  'Bash(ps:*)',
  'Bash(curl:*)',
  'Bash(git status:*)',
  'Bash(git log:*)',
  'Bash(which:*)',
  'Bash(dotnet --info:*)',
  'Bash(adb devices:*)'
];

module.exports = { promptAnalise, FERRAMENTAS_ANALISE };
