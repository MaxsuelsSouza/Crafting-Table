// @ts-check
// Memória do passo e os prompts que a usam (ajuste, respostas): cada execução nova lê do disco o que a anterior deixou.
const fs = require('fs');
const path = require('path');
const { areaIA } = require('../../infra/agentes/area-ia');
const { pasta } = require('../../infra/ticket/pasta-ticket');
const { arquivoPasso, estadoSpec } = require('../locais');
const { GRAVAR } = require('./ferramentas');

// ── Memória do passo: cada execução de passo deixa em disco o que a próxima precisa (ajuste e respostas rodam em execução nova, sem --resume).
const memoriaPasso = (t, n) => path.join(areaIA(pasta(t.chave)), `.memoria-passo-${n}.md`);
const pedirMemoria = (t, n, ajuste) =>
  ` Ao terminar, grave com ${GRAVAR} .memoria-passo-${n}.md (vai para ${memoriaPasso(t, n)}) a memória do passo, curta (até 40 linhas): decisões tomadas e por quê, alternativas descartadas, o que ficou pendente e arquivos tocados.` +
  (ajuste
    ? ` Esse arquivo já pode existir: ATUALIZE-o acrescentando a seção "Ajuste ${new Date().toISOString().slice(0, 10)}".`
    : '');
// Contexto que a conversa antiga daria: passo, artefato, memória (ou como reconstruir sem ela) e o protocolo de retomada.
const retomada = (t, n, titulo) => {
  const mem = memoriaPasso(t, n);
  return (
    ` Passo ${n} (${titulo}). Artefato do passo: ${arquivoPasso(t, n)}. ` +
    (fs.existsSync(mem)
      ? `Memória do passo (decisões e pendências da execução anterior): ${mem}. Leia-a antes de começar.`
      : `Não há memória deste passo (feito antes desta mudança): leia o artefato do passo e reconstrua o contexto por ele e pelo status.`) +
    ' Siga o protocolo de retomada da skill sdd (rode status), aplique só o que foi pedido sem refazer o que está certo'
  );
};
const promptAjuste = (t, n, texto, titulo = estadoSpec(t)?.passos[n]?.titulo || '') =>
  `O humano pediu ajuste.${retomada(t, n, titulo)} e rode concluir ${n} de novo. Pedido de ajuste: "${texto}".${pedirMemoria(t, n, true)}`;
const promptRespostas = (t, n, lista, titulo = estadoSpec(t)?.passos[n]?.titulo || '') =>
  `Respostas do humano na aba (também registradas no estado, sdd-state pergunta responder): ${lista.join('; ')}.${retomada(t, n, titulo)} e continue o passo ${n} com elas.${pedirMemoria(t, n, false)}`;

module.exports = { memoriaPasso, pedirMemoria, retomada, promptAjuste, promptRespostas };
