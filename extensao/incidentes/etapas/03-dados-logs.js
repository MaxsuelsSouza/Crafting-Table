// @ts-check
// Etapa 3 · Dados e logs (base de BKP): a massa real (ticket ou BKP, só SELECT) em massa-real.sql e as tabelas de log com a movimentação.
// Grava 3-dados-logs.md. Antes: repositórios na branch de produção (pausa "branch") e atualizados com a origem (pausa "sync").
// Depois: sem massa-real.sql e sem a pendência registrada, pausa "massa".
const path = require('path');
const { execFileSync } = require('child_process');
const aoVivo = require('../../componentes/ao-vivo');
const { ETAPAS } = require('./index');
const { estado, mudar, lerTxt, OPCOES } = require('../estado');

const { TROCAR, SEGUIR, TENTAR, SEM_MASSA } = OPCOES;

const tarefa = (d) =>
  `ETAPA 3 · DADOS E LOGS (base de BKP). Leia ${d}/${ETAPAS[0].arq} e ${d}/${ETAPAS[1].arq}. (a) MASSA: prioridade 1 é a massa já citada no ticket/comentários/anexos (seção "Massa de dados"). Só se ela não estiver no ticket, procure a massa na base de BKP com mapa-db (somente SELECT; nunca altere nem grave nada no banco). Grave as consultas/estrutura da massa real em ${d}/massa-real.sql. Se não achar a massa (ticket e BKP) ou não houver banco, NÃO deixe o arquivo vazio: registre a seção "Pendência: massa real" em ${d}/${ETAPAS[2].arq}, dizendo o que faltou. (b) LOGS: no código dos repositórios, identifique as tabelas de log ligadas a essa massa/módulo e o caminho do código que grava nelas. No banco, consulte a tabela de log e confira se há registros recentes. Se a tabela achada NÃO tiver uso recente (ou houver mais de uma candidata e você não souber qual), PAUSE e pergunte ao usuário qual tabela consultar. Se estiver ativa, busque a movimentação específica da massa do incidente. Grave em ${d}/${ETAPAS[2].arq}: onde a massa foi achada (ticket ou BKP), tabelas de log (com o caminho do código) e os registros de movimentação encontrados.`;

// ── Branch dos repositórios ──
// O código lido na etapa 3 tem de ser o de produção: backend em master-md, frontend (mobile/web) em main. Outra branch mostra outro cenário.
const BRANCH_DA_CAMADA = { backend: 'master-md', mobile: 'main', web: 'main' };
const git = (cwd, args) =>
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: 20000,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
const branchesErradas = (repos) =>
  repos.flatMap((r) => {
    const esperada = BRANCH_DA_CAMADA[r.camada];
    if (!esperada) return [];
    let atual;
    try {
      atual = git(r.caminho, ['rev-parse', '--abbrev-ref', 'HEAD']);
    } catch {
      atual = '(não é um repositório git)';
    }
    return atual === esperada ? [] : [{ ...r, esperada, atual }];
  });
// Repositórios já na branch de produção ficam iguais a origin/<branch> (fetch + pull --ff-only). Devolve os problemas ("repo: motivo"); vazio = tudo certo.
const sincronizarRepos = (repos, anotar = () => {}) =>
  repos.flatMap((r) => {
    const esperada = BRANCH_DA_CAMADA[r.camada],
      nome = path.basename(r.caminho);
    if (!esperada) return [];
    try {
      if (git(r.caminho, ['rev-parse', '--abbrev-ref', 'HEAD']) !== esperada) return []; // "Continuar assim mesmo" em outra branch: não mexe
      git(r.caminho, ['fetch', 'origin', esperada]);
      if (!Number(git(r.caminho, ['rev-list', '--count', `${esperada}..origin/${esperada}`]))) return [];
      git(r.caminho, ['pull', '--ff-only', 'origin', esperada]);
      anotar(`${nome}: pull de origin/${esperada}`);
      return [];
    } catch (x) {
      return [
        `${nome} (${esperada}): ${
          String(x.stderr || x.message)
            .trim()
            .split('\n')[0]
        }`
      ];
    }
  });

// A etapa lê código: confere master-md / main e atualiza com a origem antes.
const antes = ({ s, t, dir }) => {
  if (!estado(dir).branchOk) {
    const erradas = branchesErradas(s.reposDe(t));
    if (erradas.length)
      return {
        motivo: 'branch',
        pergunta: `Repositório fora da branch correta: ${erradas.map((r) => `${path.basename(r.caminho)} (${r.camada}) está em ${r.atual}, o esperado é ${r.esperada}`).join('; ')}. Em outra branch o código pode mostrar um cenário diferente do incidente.`,
        opcoes: [TROCAR, SEGUIR],
        aviso: `Mergulho pausado: ${erradas.map((r) => `${path.basename(r.caminho)} em ${r.atual} (esperado ${r.esperada})`).join(', ')}`
      };
  }
  if (!estado(dir).syncOk) {
    const falhas = sincronizarRepos(s.reposDe(t), (texto) => aoVivo.anotar(dir, { tipo: 'acao', texto }));
    if (falhas.length)
      return {
        motivo: 'sync',
        pergunta: `Não consegui atualizar com a origem: ${falhas.join('; ')}. Código desatualizado pode não refletir o que está em produção.`,
        opcoes: [TENTAR, SEGUIR],
        aviso: `Mergulho pausado: ${falhas.join(', ')}`
      };
  }
  return null;
};

// Sem a Massa Real a reprodução não consegue proteger a prova: exige massa-real.sql ou a pendência registrada.
const depois = ({ dir }) => {
  const massaReal = !!lerTxt(path.join(dir, 'massa-real.sql')).trim();
  if (massaReal || estado(dir).massaOk || /pend[êe]ncia/i.test(lerTxt(path.join(dir, ETAPAS[2].arq)))) return null;
  return {
    motivo: 'massa',
    pergunta:
      'A etapa 3 terminou sem massa-real.sql e sem registrar a pendência da massa em 3-dados-logs.md. Sem a Massa Real a reprodução não consegue proteger a prova (a trava de DML fica vazia).',
    opcoes: [TENTAR, SEM_MASSA],
    aviso: 'Mergulho pausado na etapa 3: sem massa real e sem pendência registrada'
  };
};

// Pausas que a extensão resolve (não vão para as respostas do Claude). Devolve 'seguir' | 'avancar' | 'render' | null (ignora) ou undefined (não é desta etapa).
const responder = ({ s, t, dir, e, resposta }) => {
  const m = e.pausa.motivo;
  if (m === 'branch') {
    if (resposta === TROCAR) {
      for (const r of branchesErradas(s.reposDe(t))) {
        try {
          git(r.caminho, ['checkout', r.esperada]);
          aoVivo.anotar(dir, { tipo: 'acao', texto: `${path.basename(r.caminho)}: branch ${r.esperada}` });
        } catch (x) {
          aoVivo.anotar(dir, {
            tipo: 'erro',
            texto: `Não consegui trocar ${path.basename(r.caminho)} para ${r.esperada}: ${
              String(x.stderr || x.message)
                .trim()
                .split('\n')[0]
            }`
          });
          return 'render';
        } // segue pausado: troque à mão e continue
      }
      mudar(dir, { pausa: null });
    } else if (resposta === SEGUIR) mudar(dir, { pausa: null, branchOk: true });
    else return null; // texto livre não resolve a pausa de branch
    return 'seguir';
  }
  if (m === 'massa') {
    if (resposta === TENTAR) {
      mudar(dir, { pausa: null });
      return 'seguir';
    }
    if (resposta === SEM_MASSA) {
      mudar(dir, { pausa: null, massaOk: true });
      return 'avancar';
    }
    return null;
  }
  if (m === 'sync') {
    if (resposta === SEGUIR) mudar(dir, { pausa: null, syncOk: true });
    else if (resposta === TENTAR) mudar(dir, { pausa: null });
    else return null;
    return 'seguir';
  }
  return undefined;
};

module.exports = { n: 3, tarefa, antes, depois, responder, branchesErradas, sincronizarRepos, BRANCH_DA_CAMADA };
