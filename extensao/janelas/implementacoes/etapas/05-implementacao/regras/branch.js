// @ts-check
// Branch de trabalho da etapa 5: uma por ticket, <prefixo>/<CHAVE> (CLAUDE.md, "Branches"), em cada repositório das camadas do plano
// ("Repositórios afetados"). A troca e a criação passam por infra/git (proteções: sujo, branch presa em worktree, worktree e execução de outro ticket).
//   1. a branch do ticket já existe (a escolhida antes, ou <qualquer prefixo>/<CHAVE> local ou no origin) → usa, sem perguntar
//   2. senão SEMPRE pausa 'criar': nome no padrão do repositório (nome-branch.js) e a base (base-branch.js: trabalho já feito, pai, avô, principal);
//      a resposta fica em estado.criar[<repositório>] = { nome, base } e a criação é fetch + checkout -b <nome> --no-track <base>
// Grupo de subtarefas em paralelo (estado.worktree): o repositório é um worktree destacado e já está no ponto certo; nada de checkout.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const git = require('../../../../../infra/git');
const dossie = require('../../../../../infra/dossie');
const { ARQ } = require('../..');
const { TENTAR, SEGUIR, estado, mudar, pausar, situacao } = require('../../../estado');
const { ambiente } = require('../../../orquestrador/ambiente');
const { chavesDo, basesDe } = require('./base-branch');
const { OPCOES_TIPO, conhecido, sugerido } = require('./nome-branch');

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

// Recusa do infra/git vira pausa: sujo → 'sujo'; fetch → 'sync' (tentar ou seguir sem buscar); o resto → 'git'.
const pausarRecusa = (dir, n, res) =>
  pausar(dir, n, {
    motivo: res.motivo === 'sujo' ? 'sujo' : res.motivo === 'fetch' ? 'sync' : 'git',
    pergunta: String(res.texto),
    opcoes: res.motivo === 'fetch' ? [TENTAR, SEGUIR] : [TENTAR]
  });

// Pausa 'criar': nome sugerido (o mesmo já escolhido em outro repositório, senão o padrão deste) e as bases.
function pausarCriar(dir, n, r, t, d, c) {
  const e = estado(dir),
    s = sugerido(r, t),
    nome = Object.values(e.criar || {})[0]?.nome || s.nome;
  const b = basesDe(r, nome, d, c);
  const bases = {
    [`Criar ${nome} a partir de ${b.sugerida}`]: b.sugerida,
    ...(b.sugerida !== b.principal ? { [`Partir da principal (${b.principal})`]: b.principal } : {}),
    ...Object.fromEntries(b.outras.map((x) => [`Partir de ${x}`, x]))
  };
  pausar(dir, n, {
    motivo: 'criar',
    repo: r.caminho,
    nome,
    sugerida: b.sugerida,
    bases,
    pergunta: `${path.basename(r.caminho)}: o ticket ainda não tem branch. Criar ${nome} a partir de ${b.sugerida}? (${s.porque}). Escolha a base ou escreva outro nome.`,
    opcoes: Object.keys(bases)
  });
}

// Seleciona ou cria a branch do ticket num repositório. O nome = pronto; null = pausou.
function prepararRepo(dir, r, t, d, c, n) {
  const e = estado(dir),
    dec = (e.criar || {})[r.caminho],
    base = path.basename(r.caminho),
    o = { chave: t.chave, vivo: () => situacao(dir).rodando };
  const existe = (nome) =>
    git.gitOk(r.caminho, ['rev-parse', '--verify', '--quiet', `refs/heads/${nome}`]) ||
    git.gitOk(r.caminho, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${nome}`]);
  const propria = dec?.nome && existe(dec.nome) ? dec.nome : git.propria(r, t.chave)?.nome;
  if (propria) {
    const res = git.trocar(r, propria, o);
    if (!res.ok) return pausarRecusa(dir, n, res), null;
    if (res.trocou) aoVivo.anotar(dir, { tipo: 'acao', texto: `${base}: branch ${propria} (já existia)` });
    return propria;
  }
  if (!dec) return pausarCriar(dir, n, r, t, d, c), null;
  const res = git.criar(r, dec.nome, dec.base, { ...o, buscar: !e.syncOk });
  if (!res.ok) return pausarRecusa(dir, n, res), null;
  aoVivo.anotar(dir, { tipo: 'acao', texto: `${base}: branch ${dec.nome} criada a partir de ${dec.base}` });
  return dec.nome;
}

/**
 * Cria/seleciona a branch do ticket nos repositórios afetados. true = pronto; false = pausou (já gravou a pausa).
 * @param {{ alvo?: any[], etapa?: number }} [o] alvo: estes repositórios em vez dos do plano de mudança (disparo dos grupos); etapa: a da pausa (padrão 5)
 */
async function prepararBranches(s, t, dir, o = {}) {
  const { repos } = ambiente(s, t),
    alvo = o.alvo || afetados(dir, repos),
    n = o.etapa ?? 5,
    feitos = {};
  if (!conhecido(t)) {
    pausar(dir, n, {
      motivo: 'tipo',
      pergunta: `Não reconheci o tipo do ticket ${t.chave}${t.tipo ? ` ("${t.tipo}")` : ''}, e o nome da branch depende dele (<prefixo>/${t.chave}). É uma feature, um bug ou um incidente?`,
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
    // o worktree já está no ponto certo: o nome é o que o pai escolheu (o grupo herda a branch dele)
    const doPai = estado(path.dirname(path.dirname(dir))).branches || {};
    mudar(dir, {
      branches: Object.fromEntries(alvo.map((r) => [r.caminho, Object.values(doPai)[0] || `<prefixo>/${t.chave}`]))
    });
    return true;
  }
  const d = dossie.lerGravado(dir),
    c = chavesDo(t, d, s.cacheJira?.[t.id]);
  for (const r of alvo) {
    if (!r.branchPrincipal) {
      pausar(dir, n, {
        motivo: 'branchPrincipal',
        repo: r.caminho,
        pergunta: `Qual é a branch principal de ${path.basename(r.caminho)} (${r.camada})? A branch do ticket parte dela quando não há outra do ticket, do pai ou do avô. Também dá para definir em Configurações > Geral > Repositórios de código.`,
        opcoes: []
      });
      return false;
    }
    const nome = prepararRepo(dir, r, t, d, c, n);
    if (!nome) return false;
    feitos[r.caminho] = nome;
  }
  mudar(dir, { branches: feitos });
  return true;
}

module.exports = { afetados, prepararBranches };
