// @ts-check
// Branch de trabalho da etapa 5: uma por ticket, <tipo>/<CHAVE> (feature, bugfix ou hotfix: nome-branch.js; CLAUDE.md, "Branch de trabalho"), criada ou selecionada em cada
// repositório das camadas do plano ("Repositórios afetados"). De onde ela parte: base-branch.js (a que já existe, a do trabalho já feito ou
// origin/<principal>). Não mexe em trabalho seu: alteração não commitada, fetch ou pull que falha viram pausa.
// Grupo de subtarefas em paralelo (estado.worktree): o repositório é um worktree destacado e já está no ponto certo; nada de checkout.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const dossie = require('../../../../../infra/dossie');
const { ARQ } = require('../..');
const { deps } = require('../../../dependencias');
const { TENTAR, SEGUIR, estado, mudar, pausar } = require('../../../estado');
const { ambiente } = require('../../../orquestrador/ambiente');
const { PRINCIPAL, baseDaBranch } = require('./base-branch');

const { ramo, OPCOES_TIPO } = require('./nome-branch');
// Camadas do plano ("Repositórios afetados: backend, mobile"); sem a linha, todos os repositórios.
const afetados = (dir, repos) => {
  let txt = '';
  try {
    txt = fs.readFileSync(path.join(dir, ARQ[4]), 'utf8');
  } catch {
    /* sem plano */
  }
  const linha = txt.match(/^\W*Reposit[óo]rios afetados:\s*(.+)$/im)?.[1];
  const alvo = linha
    ? linha
        .toLowerCase()
        .split(/[,;]| e /)
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
  const sel = alvo.length
    ? repos.filter((r) => alvo.some((a) => a === r.camada || a === path.basename(r.caminho).toLowerCase()))
    : repos;
  return sel.length ? sel : repos;
};
const primeiraLinha = (x) =>
  String(x.stderr || x.message)
    .trim()
    .split('\n')[0];

// origin/<principal> atualizada na checkout da principal (fetch + pull --ff-only). false = pausou.
function sincronizarPrincipal(dir, r, atual, n) {
  const base = path.basename(r.caminho),
    syncOk = estado(dir).syncOk;
  const passo = (args, msg) => {
    try {
      deps.git(r.caminho, args);
      return true;
    } catch (x) {
      pausar(dir, n, { motivo: 'sync', pergunta: `${base}: ${msg}: ${primeiraLinha(x)}`, opcoes: [TENTAR, SEGUIR] });
      return false;
    }
  };
  if (!syncOk && !passo(['fetch', 'origin', r.branchPrincipal], `não consegui buscar origin/${r.branchPrincipal}`))
    return false;
  if (atual !== r.branchPrincipal) deps.git(r.caminho, ['checkout', r.branchPrincipal]);
  return (
    syncOk ||
    passo(
      ['pull', '--ff-only', 'origin', r.branchPrincipal],
      `não consegui atualizar ${r.branchPrincipal} com a origem`
    )
  );
}

// Seleciona ou cria <tipo>/<CHAVE> num repositório. true = pronto; false = pausou.
function prepararRepo(dir, r, nome, d, n) {
  const base = path.basename(r.caminho),
    atual = deps.git(r.caminho, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (atual === nome) return true;
  if (deps.git(r.caminho, ['status', '--porcelain'])) {
    pausar(dir, n, {
      motivo: 'sujo',
      pergunta: `${base} tem alterações não commitadas em ${atual}. Guarde ou commite e continue: a esteira não mexe em trabalho seu.`,
      opcoes: [TENTAR]
    });
    return false;
  }
  const b = baseDaBranch(r, nome, d, estado(dir).bases);
  if (b.tipo === 'escolher') {
    pausar(dir, n, {
      motivo: 'base',
      repo: r.caminho,
      pergunta: `${base}: achei mais de uma branch com trabalho deste ticket. De qual delas a ${nome} deve partir? (a escolhida fica intacta)`,
      opcoes: [...(b.candidatas || []), PRINCIPAL]
    });
    return false;
  }
  if (b.tipo === 'local') deps.git(r.caminho, ['checkout', nome]);
  else if (b.tipo === 'remota') deps.git(r.caminho, ['checkout', '-b', nome, '--track', String(b.ref)]);
  else if (b.tipo === 'trabalho') deps.git(r.caminho, ['checkout', '-b', nome, String(b.ref)]);
  else if (!sincronizarPrincipal(dir, r, atual, n)) return false;
  else deps.git(r.caminho, ['checkout', '-b', nome]);
  const de = { local: 'já existia', remota: `a partir de ${b.ref}`, trabalho: `a partir de ${b.ref}` }[b.tipo];
  aoVivo.anotar(dir, { tipo: 'acao', texto: `${base}: branch ${nome} (${de || `a partir de ${r.branchPrincipal}`})` });
  return true;
}

/**
 * Cria/seleciona <tipo>/<CHAVE> nos repositórios afetados. true = pronto; false = pausou (já gravou a pausa).
 * @param {{ alvo?: any[], etapa?: number }} [o] alvo: estes repositórios em vez dos do plano de mudança (disparo dos grupos); etapa: a da pausa (padrão 5)
 */
async function prepararBranches(s, t, dir, o = {}) {
  const { repos } = ambiente(s, t),
    alvo = o.alvo || afetados(dir, repos),
    nome = ramo(t),
    n = o.etapa ?? 5,
    feitos = {};
  if (!nome) {
    pausar(dir, n, {
      motivo: 'tipo',
      pergunta: `Não reconheci o tipo do ticket ${t.chave}${t.tipo ? ` ("${t.tipo}")` : ''}, e o nome da branch depende dele (<tipo>/${t.chave}). É uma feature, um bug ou um incidente?`,
      opcoes: Object.keys(OPCOES_TIPO)
    });
    return false;
  }
  if (!alvo.length) {
    pausar(dir, n, {
      motivo: 'repos',
      pergunta:
        'Nenhum repositório de código configurado. Adicione em Configurações > Geral > Repositórios de código e continue.',
      opcoes: [TENTAR]
    });
    return false;
  }
  if (estado(dir).worktree) {
    mudar(dir, { branches: Object.fromEntries(alvo.map((r) => [r.caminho, nome])) });
    return true;
  }
  const d = dossie.lerGravado(dir);
  for (const r of alvo) {
    if (!r.branchPrincipal) {
      pausar(dir, n, {
        motivo: 'branchPrincipal',
        repo: r.caminho,
        pergunta: `Qual é a branch principal de ${path.basename(r.caminho)} (${r.camada})? A branch de trabalho ${nome} parte dela quando não há outra do ticket. Também dá para definir em Configurações > Geral > Repositórios de código.`,
        opcoes: []
      });
      return false;
    }
    try {
      if (!prepararRepo(dir, r, nome, d, n)) return false;
      feitos[r.caminho] = nome;
    } catch (x) {
      pausar(dir, n, {
        motivo: 'git',
        pergunta: `${path.basename(r.caminho)}: erro de git: ${primeiraLinha(x)}`,
        opcoes: [TENTAR]
      });
      return false;
    }
  }
  mudar(dir, { branches: feitos });
  return true;
}

module.exports = { ramo, afetados, prepararBranches };
