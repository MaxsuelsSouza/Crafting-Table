// @ts-check
// Arquivos da Etapa 0 na pasta da aba (impl/) e a pasta de cada grupo. Só dados e leitura (sem lógica de etapa): abas, selos e orquestrador leem daqui.
//   subtarefas.json         [{ key, resumo, status, tipo, situacao: aberta|concluida|fora, grupo?, branch? }] (0.1 e 0.2)
//   subtarefas/<KEY>.md     descrição de cada subtarefa (0.1)
//   plano-subtarefas.md     o plano que o Claude grava e você aprova (0.3; ARQ[0])
//   plano-subtarefas.json   o mesmo plano lido e validado pela extensão (0.4)
//   grupos/<G1>/            a esteira de hoje (1 → 7) de cada grupo, com .contexto-grupo.md
const fs = require('fs');
const path = require('path');
const { ARQ } = require('..');

const SUBS = 'subtarefas.json',
  PASTA_SUBS = 'subtarefas',
  PLANO_MD = ARQ[0],
  PLANO_JSON = 'plano-subtarefas.json',
  CONTEXTO_GRUPO = '.contexto-grupo.md';
const lerJson = (f, vazio) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return vazio;
  }
};
const dirGrupo = (dir, id) => path.join(dir, 'grupos', id);
const arqSub = (dir, key) => path.join(dir, PASTA_SUBS, `${key}.md`);
/** @returns {any[]} */
const lerSubs = (dir) => lerJson(path.join(dir, SUBS), []);
/** @returns {{ execucao: 'unico'|'sequencia'|'paralelo', grupos: { id: string, titulo: string, subtarefas: string[], camadas: string[], arquivos: string[], dependeDe: string[], porque: string }[] } | null} */
const lerPlano = (dir) => lerJson(path.join(dir, PLANO_JSON), null);

module.exports = {
  SUBS,
  PASTA_SUBS,
  PLANO_MD,
  PLANO_JSON,
  CONTEXTO_GRUPO,
  lerJson,
  dirGrupo,
  arqSub,
  lerSubs,
  lerPlano
};
