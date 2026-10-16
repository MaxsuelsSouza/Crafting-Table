// @ts-check
// Etapa 2 · Entendimento (claude -p, só leitura): objetivo, critério de pronto, escopo e lacunas em entendimento.md. Portão só com prontidão
// abaixo de "alta" (orquestrador/avancar.js). Exporta a tarefa do prompt (prompts.js monta o cabeçalho e as regras).
const { ARQ } = require('.');
const { CONTEXTO } = require('../estado');

const tarefa = (c) =>
  `ETAPA 2 · ENTENDIMENTO. Leia ${c.dir}/dossie.md, cada arquivo que ele cita nos eixos (spec, diagnóstico, cenários, documento…), ${c.dir}/${CONTEXTO} (se existir) e o briefing do dev (${c.dir}/.briefing.md, se existir). ` +
  `Grave em ${c.dir}/${ARQ[2]}, seções: "Objetivo" (o que tem que mudar, em uma ou duas frases), "Critério de pronto" (como saber que acabou; se o dossiê não traz um, PROPONHA e marque "(proposto)"), ` +
  `"Escopo" e "Fora de escopo", "Origem das afirmações" (cada afirmação com a fonte e a confiança: aprovado, gerado, bruto, verbal ou inferido) e "Lacunas". ` +
  `Se o dossiê citar trabalho-existente.md, leia o resumo: o que já foi feito por outra pessoa entra no Escopo como "já feito" e não como pendente. ` +
  `Se há lacuna crítica que muda o rumo e nenhuma fonte responde, PAUSE e pergunte exatamente o que falta.`;

module.exports = { n: 2, tarefa };
