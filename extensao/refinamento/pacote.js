// @ts-check
// Pacote do refinamento: um único refinamento.md na pasta da spec (repositório de specs, versionável) para quem pega a atividade sem ter
// participado. Junta o que hoje mora em lugares diferentes: os arquivos de cada passo (spec, plano, tarefas, análise, testes) e o que só existia
// na pasta do ticket desta máquina (perguntas e respostas, dúvidas ao time, decisões, mudanças pedidas em comentário, cards).
// Só lê disco e escreve um arquivo: sem IA, sem vscode. Gerado de novo a cada aprovação e quando a spec conclui; não edite à mão.
const fs = require('fs');
const path = require('path');
const tickets = require('../infra/tickets');
const { dirSpec, estadoSpec, tarefasDe, duvidasDe, impactosDe, decisoesDe, ticketDe, HANDOFF, arquivoPasso } = require('./locais');

const ARQUIVO = 'refinamento.md';
// Decisão "de rotina": no modo de teste do maestro todo Read/Bash vira decisão; aqui ficam só as que o Claude escreveu como DECISÃO: ou que vieram de você.
const ROTINA = /^(\p{L}+ndo\b|Passo \d+ ·|Pergunta para você|Dúvida registrada|Análise do comentário|Mudança aplicada|Tarefa \w+:|Achado |Comentário classificado|Tentou aprovar)/u;
const STATUS = { pendente: 'Pendente', em_andamento: 'Em andamento', aguardando_revisao: 'Aguardando revisão', aprovado: 'Aprovado', desatualizado: 'Desatualizado' };
const dia = (v) => (v ? String(v).slice(0, 10) : '');
const lerTexto = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return ''; } };
const secao = (titulo, corpo) => (corpo ? `\n## ${titulo}\n\n${corpo}\n` : '');
// Títulos do arquivo embutido descem um nível para não brigar com os do pacote.
const embutir = (texto) => texto.replace(/^(#{1,5}) /gm, '#$1 ');

/** @param {any} t ticket com spec { repo, dir } (ticketDe). */
function montar(t) {
  const dir = tickets.pasta(t.chave), spec = dirSpec(t), est = estadoSpec(t);
  if (!spec || !est) return null;
  const doc = tickets.ler(t.chave) || t;
  const aprovado = (n) => est.passos[n]?.status === 'aprovado';
  const pendencias = [];
  const abertas = (est.perguntas || []).filter((q) => q.status === 'aberta');
  const duvidas = duvidasDe(dir), semResposta = duvidas.filter((x) => !x.resposta);
  const impactos = impactosDe(dir), cards = tarefasDe(dir);
  const decisoes = decisoesDe(dir).slice().reverse().filter((x) => x.origem !== 'claude' || !ROTINA.test(String(x.titulo || '')));
  est.passos.filter((p) => p.n <= 6 && p.status !== 'aprovado').forEach((p) => pendencias.push(`Passo ${p.n} (${p.titulo}): ${STATUS[p.status] || p.status}`));
  if (abertas.length) pendencias.push(`${abertas.length} pergunta(s) do Claude sem resposta: ${abertas.map((q) => q.id).join(', ')}`);
  if (semResposta.length) pendencias.push(`${semResposta.length} dúvida(s) ao time sem resposta: ${semResposta.map((x) => x.id).join(', ')}`);
  const aguardando = impactos.filter((i) => i.status === 'aguardando_decisao');
  if (aguardando.length) pendencias.push(`${aguardando.length} mudança(s) pedida(s) em comentário esperando decisão: ${aguardando.map((i) => `${i.autor} (${dia(i.data)})`).join(', ')}`);
  const semDecisao = cards.filter((c) => ['pendente', 'em_alteracao'].includes(c.status));
  if (semDecisao.length) pendencias.push(`${semDecisao.length} tarefa(s) sem decisão: ${semDecisao.map((c) => c.id).join(', ')}`);

  const L = [];
  L.push(`# Refinamento ${t.chave}${doc.titulo ? ` · ${doc.titulo}` : ''}`);
  L.push(`\n> Gerado pela Crafting Table em ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC${doc.refinamento?.iniciadoPor ? `, refinamento de ${doc.refinamento.iniciadoPor}` : ''}. `
    + 'Reúne tudo o que é preciso para implementar sem ter participado do refinamento. Não edite este arquivo: ele é gerado de novo a cada aprovação.');
  L.push(`\n- Ticket: ${doc.link || doc.documento?.arquivo || t.chave}`);
  L.push(`- Pasta da spec: \`${path.basename(spec)}\` (arquivos ao lado deste)`);
  L.push(`- Situação: ${est.proximoPasso > 6 ? 'refinamento concluído, todos os passos aprovados' : `próximo passo: ${est.proximoPasso} · ${est.passos[est.proximoPasso]?.titulo || ''}`}`);

  L.push('\n## Antes de começar');
  L.push('\nOrdem de leitura: Spec (o quê e por quê) → Plano técnico (como e onde no código) → Tarefas → Plano de testes. As decisões e respostas abaixo valem mais que a primeira versão do texto: o que mudou depois está nelas.');
  L.push(pendencias.length ? `\n**Pendências abertas** (não implemente em cima disso sem resolver):\n${pendencias.map((p) => `- ${p}`).join('\n')}` : '\nSem pendências abertas: todos os passos aprovados e nada esperando resposta.');

  L.push('\n## Passos do refinamento\n\n| Passo | Estado | Aprovado por | Em |\n|---|---|---|---|');
  for (const p of est.passos.filter((x) => x.n <= 6)) L.push(`| ${p.n} · ${p.titulo} | ${STATUS[p.status] || p.status} | ${p.aprovadoPor || ''} | ${dia(p.aprovadoEm)} |`);

  const respondidas = (est.perguntas || []).filter((q) => q.status === 'respondida');
  L.push(secao('Perguntas do Claude e respostas', respondidas.map((q) => `- **${q.id}** (passo ${q.passo ?? '?'}): ${q.pergunta}\n  - Resposta: ${q.resposta}${q.respondidaEm ? ` (${dia(q.respondidaEm)})` : ''}`).join('\n')));
  const respDuvidas = duvidas.filter((x) => x.resposta);
  L.push(secao('Dúvidas ao time e respostas', respDuvidas.map((x) => `- **${x.id}**: ${x.texto}${x.contexto ? ` _(contexto: ${x.contexto})_` : ''}\n  - Resposta${x.resposta.autor ? ` de ${x.resposta.autor}` : ''}: ${x.resposta.texto}${x.resposta.link ? ` (${x.resposta.link})` : ''}`).join('\n')));
  L.push(secao('Decisões registradas', decisoes.map((x) => `- **${dia(x.data)} · ${x.titulo}** (${{ claude: 'Claude', usuario: 'você', pergunta: 'pergunta', chat: 'conversa' }[x.origem] || x.origem}): ${String(x.resumo || '').slice(0, 600)}`).join('\n')));
  const mud = impactos.filter((i) => !['triagem', 'triando', 'na_fila', 'analisando'].includes(i.status));
  L.push(secao('Mudanças pedidas em comentários', mud.map((i) => `- **${dia(i.data)} · ${i.autor}**${i.nivel ? ` (impacto ${i.nivel})` : ''}: ${i.resumo || String(i.texto || '').slice(0, 200)}\n  - Desfecho: ${i.status}${i.decisao ? ` · ${typeof i.decisao === 'string' ? i.decisao : i.decisao.rotulo || ''}` : ''}${i.link ? ` · ${i.link}` : ''}`).join('\n')));

  L.push(secao('Tarefas', cards.length ? ['| Id | Título | Camada | Estimativa | Depende de | Estado | Subtarefa |', '|---|---|---|---|---|---|---|',
    ...cards.map((c) => `| ${c.id} | ${String(c.titulo || '').replace(/\|/g, '/')} | ${c.camada || ''} | ${c.estimativa || ''} | ${[].concat(c.depende || []).join(', ')} | ${c.status || ''} | ${c.ticket || ''} |`)].join('\n') : ''));

  const PARTES = [[1, 'spec.md', 'Especificação'], [3, 'plan.md', 'Plano técnico'], [4, 'tasks.md', 'Tarefas (detalhe)'], [5, 'analise.md', 'Análise de cobertura'], [6, 'testes.md', 'Plano de testes']];
  for (const [n, arq, titulo] of PARTES) {
    const txt = lerTexto(path.join(spec, arq));
    L.push(secao(`${titulo} (${arq}${aprovado(n) ? '' : ', ainda não aprovado'})`, txt ? embutir(txt) : ''));
  }
  const mapas = Object.values(HANDOFF).filter((f) => fs.existsSync(path.join(spec, f)));
  L.push(secao('Mapeamento do código', mapas.map((f) => `- \`${f}\` (na pasta da spec): onde cada requisito toca o código, com evidências.`).join('\n')));
  const constituicao = fs.existsSync(arquivoPasso(t, 0)) ? 'constitution.md na raiz do repositório de specs: regras que o plano precisa respeitar.' : '';
  L.push(secao('Constituição', constituicao));
  return `${L.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

/** Grava refinamento.md na pasta da spec. Devolve o caminho ou null (sem spec). Nunca lança: o refinamento não depende do pacote. */
function gravar(chave) {
  try {
    const t = ticketDe(chave);
    const md = t && montar(t);
    if (!md) return null;
    const arq = path.join(dirSpec(t), ARQUIVO);
    const semData = (x) => x.replace(/^> Gerado pela Crafting Table.*$/m, '').trim();
    if (semData(lerTexto(arq)) === semData(md)) return arq; // só a data mudou: não regrava (não suja o git)
    fs.writeFileSync(arq, md);
    return arq;
  } catch { return null; }
}

module.exports = { ARQUIVO, montar, gravar };
