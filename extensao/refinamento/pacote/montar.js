// @ts-check
// Monta o texto do refinamento.md: cabeçalho, pendências, passos e as seções (historico.js, tarefas.js, arquivos.js), nessa ordem.
const path = require('path');
const tickets = require('../../infra/ticket/tickets');
const { dirSpec, estadoSpec, tarefasDe, duvidasDe, impactosDe, decisoesDe } = require('../locais');
const { ROTINA, STATUS, dia } = require('./comum');
const { historico } = require('./historico');
const { tarefas } = require('./tarefas');
const { arquivos } = require('./arquivos');

/** @param {any} t ticket com spec { repo, dir } (ticketDe). */
function montar(t) {
  const dir = tickets.pasta(t.chave),
    spec = dirSpec(t),
    est = estadoSpec(t);
  if (!spec || !est) return null;
  const doc = tickets.ler(t.chave) || t;
  const aprovado = (n) => est.passos[n]?.status === 'aprovado';
  const pendencias = [];
  const abertas = (est.perguntas || []).filter((q) => q.status === 'aberta');
  const duvidas = duvidasDe(dir),
    semResposta = duvidas.filter((x) => !x.resposta);
  const impactos = impactosDe(dir),
    cards = tarefasDe(dir);
  const decisoes = decisoesDe(dir)
    .slice()
    .reverse()
    .filter((x) => x.origem !== 'claude' || !ROTINA.test(String(x.titulo || '')));
  est.passos
    .filter((p) => p.n <= 6 && p.status !== 'aprovado')
    .forEach((p) => pendencias.push(`Passo ${p.n} (${p.titulo}): ${STATUS[p.status] || p.status}`));
  if (abertas.length)
    pendencias.push(`${abertas.length} pergunta(s) do Claude sem resposta: ${abertas.map((q) => q.id).join(', ')}`);
  if (semResposta.length)
    pendencias.push(`${semResposta.length} dúvida(s) ao time sem resposta: ${semResposta.map((x) => x.id).join(', ')}`);
  const aguardando = impactos.filter((i) => i.status === 'aguardando_decisao');
  if (aguardando.length)
    pendencias.push(
      `${aguardando.length} mudança(s) pedida(s) em comentário esperando decisão: ${aguardando.map((i) => `${i.autor} (${dia(i.data)})`).join(', ')}`
    );
  const semDecisao = cards.filter((c) => ['pendente', 'em_alteracao'].includes(c.status));
  if (semDecisao.length)
    pendencias.push(`${semDecisao.length} tarefa(s) sem decisão: ${semDecisao.map((c) => c.id).join(', ')}`);

  const L = [];
  L.push(`# Refinamento ${t.chave}${doc.titulo ? ` · ${doc.titulo}` : ''}`);
  L.push(
    `\n> Gerado pela Crafting Table em ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC${doc.refinamento?.iniciadoPor ? `, refinamento de ${doc.refinamento.iniciadoPor}` : ''}. ` +
      'Reúne tudo o que é preciso para implementar sem ter participado do refinamento. Não edite este arquivo: ele é gerado de novo a cada aprovação.'
  );
  L.push(`\n- Ticket: ${doc.link || doc.documento?.arquivo || t.chave}`);
  L.push(`- Pasta da spec: \`${path.basename(spec)}\` (arquivos ao lado deste)`);
  L.push(
    `- Situação: ${est.proximoPasso > 6 ? 'refinamento concluído, todos os passos aprovados' : `próximo passo: ${est.proximoPasso} · ${est.passos[est.proximoPasso]?.titulo || ''}`}`
  );

  L.push('\n## Antes de começar');
  L.push(
    '\nOrdem de leitura: Spec (o quê e por quê) → Plano técnico (como e onde no código) → Tarefas → Plano de testes. As decisões e respostas abaixo valem mais que a primeira versão do texto: o que mudou depois está nelas.'
  );
  L.push(
    pendencias.length
      ? `\n**Pendências abertas** (não implemente em cima disso sem resolver):\n${pendencias.map((p) => `- ${p}`).join('\n')}`
      : '\nSem pendências abertas: todos os passos aprovados e nada esperando resposta.'
  );

  L.push('\n## Passos do refinamento\n\n| Passo | Estado | Aprovado por | Em |\n|---|---|---|---|');
  for (const p of est.passos.filter((x) => x.n <= 6))
    L.push(
      `| ${p.n} · ${p.titulo} | ${STATUS[p.status] || p.status} | ${p.aprovadoPor || ''} | ${dia(p.aprovadoEm)} |`
    );

  historico(L, { est, duvidas, decisoes, impactos });
  tarefas(L, cards);
  arquivos(L, { t, spec, aprovado });
  return `${L.filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')}\n`;
}

module.exports = { montar };
