// @ts-check
// Etapa 4 · Plano de mudança (claude -p, sem implementar, vaga impl.mapa): plano-mudanca.md com a linha "Repositórios afetados" que a
// etapa 5 lê (05-implementacao/regras/branch.js). Portão sempre: aprovar libera a escrita de código.
const { ARQ } = require('.');

const tarefa = (c) =>
  `ETAPA 4 · PLANO DE MUDANÇA (não implemente). Leia ${c.dir}/${ARQ[2]} e ${c.dir}/${ARQ[3]}. Planeje a MENOR mudança que cumpre o critério de pronto sem quebrar o que a varredura marcou. ` +
  `Grave em ${c.dir}/${ARQ[4]}. Logo após o título, uma linha exata: "Repositórios afetados: <camadas separadas por vírgula, ex.: backend, mobile>" (só as camadas que serão alteradas). ` +
  `Seções: "Mudanças" (por arquivo: o que muda e por quê), "Ordem", "O que não pode quebrar" (da varredura), "Testes a rodar ou criar" e "Riscos". ` +
  `Se houver mais de um caminho viável e a escolha muda o comportamento, PAUSE com as opções.`;

module.exports = { n: 4, tarefa };
