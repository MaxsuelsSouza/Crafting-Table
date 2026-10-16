// @ts-check
// Etapa 7 · Resumo (claude -p): implementacao.md, a entrada do QA. resumoGit: o que a esteira alterou em cada repositório, para o prompt.
const path = require('path');
const { ARQ } = require('.');
const { deps } = require('../dependencias');

const tarefa = (c) =>
  `ETAPA 7 · RESUMO. Leia ${c.dir}/${ARQ[4]}, ${c.dir}/${ARQ[5]} e ${c.dir}/${ARQ[6]}. Resumo do que mudou nos repositórios (git diff --stat):\n${c.gitResumo || '(sem alterações detectadas)'}\n` +
  `Grave em ${c.dir}/${ARQ[7]}, seções: "O que mudou" (arquivo e motivo), "Como validar" (liste os cenários do QA e a reprodução do incidente que o dossiê cita, e os passos manuais), ` +
  `"Verificação automática" (resultado de ${ARQ[6]}), "Riscos residuais" e "Pendências". Curto e direto: este arquivo é a entrada do QA.`;

// O que a esteira alterou em cada repositório (sem commit: está no working tree da branch de trabalho): status curto + diff --stat contra HEAD.
const resumoGit = (repos, branches) =>
  repos
    .filter((r) => branches[r.caminho])
    .map((r) => {
      try {
        return `${path.basename(r.caminho)} (${branches[r.caminho]}):\n${[deps.git(r.caminho, ['status', '--short']), deps.git(r.caminho, ['diff', '--stat', 'HEAD'])].filter(Boolean).join('\n') || '(sem diferenças)'}`;
      } catch (x) {
        return `${path.basename(r.caminho)}: ${String(x.message).split('\n')[0]}`;
      }
    })
    .join('\n');

module.exports = { n: 7, tarefa, resumoGit };
