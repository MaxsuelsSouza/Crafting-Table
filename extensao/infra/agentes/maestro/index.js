// @ts-check
// Maestro do modo refinamento: roda o Claude em segundo plano (`claude -p`, uma execução por etapa) e grava o que ele
// faz em <pasta do ticket>/.ao-vivo.jsonl ({ em, tipo, texto }), que a aba Spec mostra ao vivo.
// Sem AskUserQuestion (não existe em -p): perguntas passam pelo sdd-state e pela aba.
// A sessão fica em .ao-vivo.sid para continuar a mesma conversa (--resume) quando precisar.
// Usado por todos os módulos (Refinamento, Implementações, QA, Incidentes), pelo ⚡ e pelo vigia (vigia.js).
//
// Um arquivo por regra:
//   estado.js     execuções desta janela (processos, erros, últimas opções), pid/sid e o executável do claude
//   textos.js     textos do Ao vivo: o que o usuário lê de cada ferramenta e do sdd-state
//   decisoes.js   pedido de decisão no prompt, falas do Claude e o modo de teste das decisões
//   linhas.js     evento do stream-json → linhas do Ao vivo
//   rodar.js      roda uma etapa (claude -p) e para; git só de leitura liberado
//   instruir.js   ⚡ instrução direta: retoma a mesma sessão com a mensagem
const { erros, rodandoEm, vivo, claudeBin } = require('./estado');
const { GIT_LEITURA, rodar, parar } = require('./rodar');
const { podeInstruir, VIGIA_MS, instruir } = require('./instruir');
const { DECISOES_DE_TESTE, falas } = require('./decisoes');
const { linhas } = require('./linhas');
const { fraseSdd, linhaFerramenta } = require('./textos');

module.exports = { rodar, parar, erroDe: (dir) => erros.get(dir) || null, instruir, podeInstruir, rodando: rodandoEm, vivo, claudeBin, _teste: { GIT_LEITURA, VIGIA_MS, DECISOES_DE_TESTE, falas, linhas, linhaFerramenta, fraseSdd } };
