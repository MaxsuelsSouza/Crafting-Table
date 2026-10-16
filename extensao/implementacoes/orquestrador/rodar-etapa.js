// @ts-check
// Etapas com IA (2 Entendimento, 3 Varredura, 4 Plano de mudança, 5 Implementação, 7 Resumo): cada uma é um `claude -p` (maestro.rodar) que
// grava o seu arquivo; ao terminar, apos-etapa.js decide. Ferramentas: só leitura, mais Edit/Write na 5. A 5 prepara a branch antes.
const fs = require('fs');
const path = require('path');
const maestro = require('../../painel/maestro');
const controle = require('../../infra/controle');
const vagas = require('../../agentes/etapas');
const dossie = require('../../infra/dossie');
const prompts = require('../prompts');
const { ETAPAS, ARQ } = require('../etapas');
const { estado, mudar, lerJson } = require('../estado');
const { limparPausa } = require('./pausa');
const { ambiente, textoBanco } = require('./ambiente');
const { prepararDossie } = require('../etapas/01-dossie/subetapas/1.1-dossie');
const { prepararBranches } = require('../etapas/05-implementacao');
const { resumoGit } = require('../etapas/07-resumo');

const { GRAVAR } = prompts;
const LEITURA = (mapa) => [
  'Read',
  'Glob',
  'Grep',
  `Bash(${GRAVAR}:*)`,
  `Bash(${mapa}/bin/mapa-db:*)`,
  `Bash(${mapa}/bin/mapa-git:*)`,
  `Bash(${mapa}/bin/mapa-conferir:*)`,
  'Bash(ls:*)',
  'Bash(cat:*)',
  'Bash(head:*)',
  'Bash(tail:*)',
  'Bash(grep:*)',
  'Bash(git status:*)',
  'Bash(git log:*)',
  'Bash(git diff:*)'
];
const FERRAMENTAS = (n, mapa) => (n === 5 ? [...LEITURA(mapa), 'Edit', 'Write'] : LEITURA(mapa));

const rodarEtapa = async (s, t, n, rodada, ajuste = false) => {
  const dir = s.pastaAba(t.id);
  const { aposEtapa } = require('./apos-etapa'); // ciclo: apos-etapa → avancar → rodar-etapa
  if (!controle.valida(dir, rodada)) return;
  if (!dossie.lerGravado(dir)) await prepararDossie(s, t);
  if (n === 5 && !(await prepararBranches(s, t, dir))) return s.render();
  const env = ambiente(s, t),
    mapa = vagas.raiz('impl.mapa') || '',
    e0 = estado(dir),
    d = dossie.lerGravado(dir);
  const arqEtapa = path.join(dir, ETAPAS[n - 1].arq),
    antes = ajuste && fs.existsSync(arqEtapa) ? fs.statSync(arqEtapa).mtimeMs : 0;
  if (!ajuste && n !== 5) fs.rmSync(arqEtapa, { force: true });
  if (n === 5) fs.rmSync(arqEtapa, { force: true }); // o log de cada tentativa é novo
  limparPausa(dir);
  mudar(dir, { etapa: n, fase: 'rodando', pausa: null, aprovacao: null });
  let falhas = '';
  if (n === 5 && e0.correcao) {
    const v = lerJson(path.join(dir, ARQ[6]), {});
    falhas = (v.rodadas || [])
      .filter((r) => r.codigo !== 0)
      .map((r) => `- ${r.nome} (${r.comando}):\n${String(r.saida || '').slice(-1500)}`)
      .join('\n');
  }
  let tratou = false;
  const ok = maestro.rodar(dir, {
    prompt:
      prompts.prompt(n, {
        dir,
        t,
        d,
        repos: env.repos,
        banco: textoBanco(env.banco),
        branches: e0.branches,
        correcao: e0.correcao,
        falhas,
        ajuste,
        gitResumo: n === 7 ? resumoGit(env.repos, e0.branches) : ''
      }) + vagas.aviso('impl.mapa'),
    titulo: `Esteira · Etapa ${n}: ${ETAPAS[n - 1].nome}${ajuste ? ' (ajuste)' : e0.correcao && n === 5 ? ` (correção ${e0.tentativas})` : ''}`,
    ferramentas: FERRAMENTAS(n, mapa),
    env: {
      MAPA_DB_CONEXAO: env.banco.conexao,
      MAPA_DB_AMBIENTE: env.banco.ambiente,
      MAPA_DB_SQLCL: env.banco.sqlcl,
      MAPA_DB_SENSIVEIS: env.banco.sensiveis.join(','),
      MAPA_DB_LOG: path.join(dir, '.mapa-db.jsonl'),
      IMPLEMENTACAO_DIR: dir
    },
    extras: [
      ...(env.modelo ? ['--model', env.modelo] : []),
      ...vagas.pluginDirs('impl.mapa'),
      '--settings',
      JSON.stringify({ enabledPlugins: { 'i-have-adhd@i-have-adhd': false } }),
      '--add-dir',
      dir,
      '--add-dir',
      s.pasta(t.id),
      ...env.repos.map((r) => r.caminho)
    ],
    aoMudar: () => {
      s.render();
      if (!tratou && !maestro.rodando(dir)) {
        tratou = true;
        aposEtapa(s, t, n, rodada, antes);
      }
    }
  });
  if (!ok) mudar(dir, { fase: 'parado' });
  s.render();
};

module.exports = { LEITURA, FERRAMENTAS, rodarEtapa };
