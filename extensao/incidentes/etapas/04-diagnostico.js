// @ts-check
// Etapa 4 · Diagnóstico: cruza a massa, o log e o relato do PO e define a ação do usuário (ou falha de ambiente) que gerou a anomalia.
// Grava 4-diagnostico.md. É a base da reprodução: pede aprovação sempre (sempreAprovar), mesmo com a entrada completa.
const { ETAPAS } = require('./index');

const tarefa = (d) =>
  `ETAPA 4 · DIAGNÓSTICO. Leia ${d}/${ETAPAS[0].arq}, ${d}/${ETAPAS[1].arq}, ${d}/${ETAPAS[2].arq} e ${d}/massa-real.sql. Cruze o estado da massa, o log e o relato do PO e defina a ação exata do usuário, ou a falha de ambiente, que gerou a anomalia (ex.: "tentou finalizar a tarefa sem completar todos os cards"; "app crashou no meio da requisição e o usuário reiniciou o celular"). Grave em ${d}/${ETAPAS[3].arq}: a ação/falha, as evidências que a sustentam (cite arquivo e registro) e o grau de certeza. Se não houver base para concluir, PAUSE e pergunte exatamente o que falta.`;

module.exports = { n: 4, sempreAprovar: true, tarefa };
