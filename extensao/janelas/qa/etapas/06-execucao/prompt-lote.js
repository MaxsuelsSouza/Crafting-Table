// @ts-check
// Prompt do 6.1 em lote: o roteiro do cenário da vez e, na MESMA sessão, os dos próximos pendentes. O login, a navegação e os seletores
// descobertos uma vez servem a todos, e o custo fixo da sessão (contexto, leitura do método) se divide entre os cenários.
const { QA_STATE } = require('../../orquestrador/prompt-comum');
const { promptCenario, massaTexto } = require('./prompt');

/** outros: [{ c, itens, exige }] dos próximos cenários (sem roteiro salvo). */
const promptLote = (chave, c, amb, itens, dir, exige, outros) =>
  promptCenario(chave, c, amb, itens, dir, exige) +
  `\n\nNA MESMA SESSÃO, aproveitando o que já descobriu (login, navegação, seletores), escreva e registre também os roteiros destes cenários. ` +
  `Um JSON por cenário em roteiros/<CT>/ ao lado do ${c.id}; o setup comum (login e chegada à tela) num flow só em roteiros/comum/, reutilizado por runFlow. ` +
  `Para estes, SÓ registre (${QA_STATE} roteiro <CT> <arquivo.json>): não execute nem conclua. Se um deles não couber num roteiro ou faltar informação, pule-o sem perguntar (ele terá sessão própria).\n` +
  outros
    .map(
      (o) =>
        `\n### ${o.c.id} · ${o.c.titulo}\n${o.c.texto}\nMassa: ${massaTexto(o.itens)}` +
        (o.exige.length ? `\nGrava em tabela (${o.exige.join(', ')}): consulta antes e depois obrigatória.` : '')
    )
    .join('\n');

module.exports = { promptLote };
