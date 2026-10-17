// @ts-check
// Etapa 8 · Resumo (claude -p): implementacao.md, a entrada do QA. resumoGit: o que a esteira alterou em cada repositório, para o prompt.
const path = require('path');
const { ARQ } = require('.');
const { deps } = require('../dependencias');

const tarefa = (c) =>
  `ETAPA 8 · RESUMO. Leia ${c.dir}/${ARQ[4]}, ${c.dir}/${ARQ[5]}, ${c.dir}/${ARQ[6]} e ${c.dir}/${ARQ[7]} (teste na aplicação: score, mínimo, entregavel, CTs). Resumo do que mudou nos repositórios (git diff --stat):\n${c.gitResumo || '(sem alterações detectadas)'}\n` +
  `Grave em ${c.dir}/${ARQ[8]}, seções: "O que mudou" (arquivo e motivo), "Como validar" (liste os cenários do QA e a reprodução do incidente que o dossiê cita, e os passos manuais), ` +
  `"Verificação automática" (resultado de ${ARQ[6]}), "Teste na aplicação" (score N/5 contra o mínimo, CTs que falharam ou ficaram bloqueados, o plano em teste/plano-cts.md; se entregavel for false, diga em destaque que foi entregue ABAIXO DO MÍNIMO por decisão do usuário), "Riscos residuais" e "Pendências". Curto e direto: este arquivo é a entrada do QA.`;

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

module.exports = { n: 8, tarefa, resumoGit };
