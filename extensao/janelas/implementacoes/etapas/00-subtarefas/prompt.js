// @ts-check
// Prompt da Etapa 0 · Subtarefas (claude -p, só leitura, vaga impl.mapa): lê o pai, cada subtarefa e o código e grava plano-subtarefas.md
// no formato que regras/ler-plano.js lê (texto simples, sem JSON). A extensão valida (0.4) e você aprova antes de qualquer código.
const { MAX_GRUPOS } = require('./regras/validar-plano');
const { SUBS, PASTA_SUBS, PLANO_MD } = require('./arquivos');
const { CONTEXTO } = require('../../estado');
const { rotulo } = require('../05-implementacao/regras/nome-branch');

const tarefa = (c) =>
  `ETAPA 0 · PLANO DAS SUBTAREFAS (não implemente nada). O ticket ${c.t.chave} tem subtarefas. Leia ${c.dir}/${SUBS} (cada subtarefa com a situação: "aberta" = implementar; "concluida" = já feita, com a branch onde o código foi achado, se achou), ` +
  `cada ${c.dir}/${PASTA_SUBS}/<CHAVE>.md (a descrição de cada uma), ${c.dir}/dossie.md e ${c.dir}/${CONTEXTO} (o ticket pai) e, se existir, ${c.dir}/trabalho-existente.md (branches e commits já feitos). ` +
  `Olhe o código dos repositórios (só leitura) o suficiente para saber quais arquivos cada subtarefa aberta toca e se o código das concluídas existe mesmo. ` +
  `Monte NO MÁXIMO ${MAX_GRUPOS} grupos com TODAS as subtarefas abertas (cada uma em exatamente um grupo; as concluídas não entram em grupo): junte as que mexem nos mesmos arquivos ou dependem uma da outra. ` +
  `Poucos grupos: um grupo só quando é tudo do mesmo assunto. Cada grupo vira uma esteira inteira (entendimento, varredura, plano de mudança, implementação, verificação), então mais grupos custam mais. ` +
  `Execução: "unico" (1 grupo), "sequencia" (o G2 precisa do código do G1: "Depende de: G1") ou "paralelo" (independentes E sem nenhum arquivo em comum: dois agentes trabalham ao mesmo tempo, na mesma branch ${rotulo(c.t)}, o segundo num worktree). Na dúvida, "sequencia". ` +
  `Grave ${c.dir}/${PLANO_MD} (texto simples, SEM JSON), exatamente neste formato:\n` +
  `# Plano das subtarefas · ${c.t.chave}\nExecução: <unico|sequencia|paralelo>\n\n## G1 · <título curto>\n- Subtarefas: <CHAVE>, <CHAVE>\n- Camadas: <backend, mobile…>\n- Arquivos: <caminho relativo ao repositório>, <outro>\n- Depende de: nenhum\n- Por que: <por que estas juntas>\n\n` +
  `## G2 · <título> (só se houver)\n- Subtarefas: …\n- Camadas: …\n- Arquivos: …\n- Depende de: <nenhum ou G1>\n- Por que: …\n\n` +
  `## Ordem\n<a ordem e o que roda em paralelo ou em sequência, e por quê>\n\n## Já feito\n<cada subtarefa concluída: a branch e os arquivos onde está o código, ou "não achei o código" (vira risco)>\n\n## Riscos\n<o que pode dar errado>\n` +
  `Se a divisão depende de uma decisão que muda o comportamento, PAUSE com as opções em vez de gravar o plano.`;

module.exports = { tarefa };
