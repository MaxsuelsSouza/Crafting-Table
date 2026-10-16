// @ts-check
// Seções do que só existia na pasta do ticket: perguntas do Claude e respostas, dúvidas ao time, decisões e mudanças por comentário.
const { dia, secao } = require('./comum');

/** L = linhas do refinamento.md (montar.js). */
const historico = (L, { est, duvidas, decisoes, impactos }) => {
  const respondidas = (est.perguntas || []).filter((q) => q.status === 'respondida');
  L.push(
    secao(
      'Perguntas do Claude e respostas',
      respondidas
        .map(
          (q) =>
            `- **${q.id}** (passo ${q.passo ?? '?'}): ${q.pergunta}\n  - Resposta: ${q.resposta}${q.respondidaEm ? ` (${dia(q.respondidaEm)})` : ''}`
        )
        .join('\n')
    )
  );
  const respDuvidas = duvidas.filter((x) => x.resposta);
  L.push(
    secao(
      'Dúvidas ao time e respostas',
      respDuvidas
        .map(
          (x) =>
            `- **${x.id}**: ${x.texto}${x.contexto ? ` _(contexto: ${x.contexto})_` : ''}\n  - Resposta${x.resposta.autor ? ` de ${x.resposta.autor}` : ''}: ${x.resposta.texto}${x.resposta.link ? ` (${x.resposta.link})` : ''}`
        )
        .join('\n')
    )
  );
  L.push(
    secao(
      'Decisões registradas',
      decisoes
        .map(
          (x) =>
            `- **${dia(x.data)} · ${x.titulo}** (${{ claude: 'Claude', usuario: 'você', pergunta: 'pergunta', chat: 'conversa' }[x.origem] || x.origem}): ${String(x.resumo || '').slice(0, 600)}`
        )
        .join('\n')
    )
  );
  const mud = impactos.filter((i) => !['triagem', 'triando', 'na_fila', 'analisando'].includes(i.status));
  L.push(
    secao(
      'Mudanças pedidas em comentários',
      mud
        .map(
          (i) =>
            `- **${dia(i.data)} · ${i.autor}**${i.nivel ? ` (impacto ${i.nivel})` : ''}: ${i.resumo || String(i.texto || '').slice(0, 200)}\n  - Desfecho: ${i.status}${i.decisao ? ` · ${typeof i.decisao === 'string' ? i.decisao : i.decisao.rotulo || ''}` : ''}${i.link ? ` · ${i.link}` : ''}`
        )
        .join('\n')
    )
  );
};

module.exports = { historico };
