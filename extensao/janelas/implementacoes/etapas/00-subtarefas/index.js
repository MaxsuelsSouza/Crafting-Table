// @ts-check
// Etapa 0 · Subtarefas: só no ticket com subtarefas abertas (sem elas o ticket segue como hoje, etapa 1). Planeja até 2 grupos de
// subtarefas, você aprova e cada grupo roda a esteira 1 → 7 na mesma branch <tipo>/<CHAVE> (orquestrador/grupos/).
//   0.1 Coleta      (extensão)  subtarefas abertas, concluídas e fora; descrição de cada uma
//   0.2 Dossiê      (extensão)  dossiê do pai e a branch onde está o código das concluídas
//   0.3 Plano       (claude -p) plano-subtarefas.md (orquestrador/rodar-etapa.js, tarefa em prompt.js)
//   0.4 Validação   (extensão)  confere e grava plano-subtarefas.json; inválido volta ao Claude uma vez
//   0.5 Portão      (você)      sempre (orquestrador/avancar.js)
//   0.6 Disparo     (extensão)  pastas dos grupos, branch, worktree e a fila
//
// Estrutura desta pasta:
//   index.js                  passoSubtarefas e o que as outras partes chamam
//   arquivos.js               nomes dos arquivos e leitura (subtarefas.json, plano, pasta do grupo)
//   prompt.js                 tarefa do 0.3
//   subetapas/                0.1-coleta.js, 0.2-dossie.js, 0.4-validacao.js, 0.6-disparo.js
//   regras/                   filtro.js, ler-plano.js, validar-plano.js, contexto-grupo.js, worktree.js
const aoVivo = require('../../../../componentes/ao-vivo');
const controle = require('../../../../infra/controle');
const { mudar } = require('../../estado');
const { coletar } = require('./subetapas/0.1-coleta');
const { dossiePai } = require('./subetapas/0.2-dossie');
const { aposPlano } = require('./subetapas/0.4-validacao');
const { disparar } = require('./subetapas/0.6-disparo');
const { tarefa } = require('./prompt');

const SUBETAPAS = [
  'Coleta das subtarefas',
  'Dossiê e trabalho já feito',
  'Plano dos grupos',
  'Validação',
  'Sua aprovação',
  'Disparo dos grupos'
];

// Ticket sem subtarefa aberta: segue como ticket simples (01-dossie).
async function passoSubtarefas(s, t, rodada) {
  const { passoDossie } = require('../01-dossie'),
    { rodarEtapa } = require('../../orquestrador/rodar-etapa'); // ciclo: rodar-etapa → etapas
  const dir = s.pastaAba(t.id);
  const sep = await coletar(s, t);
  if (!controle.valida(dir, rodada)) return s.render();
  if (!sep) {
    mudar(dir, { subtarefas: 'nao' });
    return passoDossie(s, t, rodada);
  }
  mudar(dir, { etapa: 0, fase: 'rodando', pausa: null, subtarefas: 'sim', planoAprovado: false });
  aoVivo.anotar(dir, { tipo: 'etapa', texto: 'Esteira · Etapa 0: Subtarefas' });
  s.render();
  await dossiePai(s, t);
  if (!controle.valida(dir, rodada)) return s.render();
  return rodarEtapa(s, t, 0, rodada);
}

module.exports = { n: 0, SUBETAPAS, tarefa, passoSubtarefas, aposPlano, disparar };
