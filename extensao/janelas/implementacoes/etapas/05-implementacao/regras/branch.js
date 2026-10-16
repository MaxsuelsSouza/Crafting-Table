// @ts-check
// Branch de trabalho da etapa 5: impl/<CHAVE>-<slug>, criada ou selecionada a partir de origin/<principal> em cada repositório das camadas do
// plano ("Repositórios afetados"). Não mexe em trabalho seu: alteração não commitada, fetch ou pull que falha viram pausa.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { ARQ } = require('../..');
const { deps } = require('../../../dependencias');
const { TENTAR, SEGUIR, estado, mudar, pausar } = require('../../../estado');
const { ambiente } = require('../../../orquestrador/ambiente');

const slug = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
const ramo = (t) => {
  const s = slug(t.titulo || t.documento?.nome);
  return `impl/${t.chave}${s ? `-${s}` : ''}`;
};
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
/** Cria/seleciona a branch de trabalho a partir de origin/<principal>. true = pronto; false = pausou (já gravou a pausa). */
async function prepararBranches(s, t, dir) {
  const { repos } = ambiente(s, t),
    alvo = afetados(dir, repos),
    nome = ramo(t),
    feitos = {};
  if (!alvo.length) {
    pausar(dir, 5, {
      motivo: 'repos',
      pergunta:
        'Nenhum repositório de código configurado. Adicione em Configurações > Geral > Repositórios de código e continue.',
      opcoes: [TENTAR]
    });
    return false;
  }
  for (const r of alvo) {
    const base = path.basename(r.caminho);
    if (!r.branchPrincipal) {
      pausar(dir, 5, {
        motivo: 'branchPrincipal',
        repo: r.caminho,
        pergunta: `Qual é a branch principal de ${base} (${r.camada})? A branch de trabalho ${nome} parte dela. Também dá para definir em Configurações > Geral > Repositórios de código.`,
        opcoes: []
      });
      return false;
    }
    try {
      const atual = deps.git(r.caminho, ['rev-parse', '--abbrev-ref', 'HEAD']);
      if (atual !== nome) {
        if (deps.git(r.caminho, ['status', '--porcelain'])) {
          pausar(dir, 5, {
            motivo: 'sujo',
            pergunta: `${base} tem alterações não commitadas em ${atual}. Guarde ou commite e continue: a esteira não mexe em trabalho seu.`,
            opcoes: [TENTAR]
          });
          return false;
        }
        if (!estado(dir).syncOk) {
          try {
            deps.git(r.caminho, ['fetch', 'origin', r.branchPrincipal]);
          } catch (x) {
            pausar(dir, 5, {
              motivo: 'sync',
              pergunta: `${base}: não consegui buscar origin/${r.branchPrincipal}: ${
                String(x.stderr || x.message)
                  .trim()
                  .split('\n')[0]
              }`,
              opcoes: [TENTAR, SEGUIR]
            });
            return false;
          }
        }
        if (atual !== r.branchPrincipal) deps.git(r.caminho, ['checkout', r.branchPrincipal]);
        if (!estado(dir).syncOk) {
          try {
            deps.git(r.caminho, ['pull', '--ff-only', 'origin', r.branchPrincipal]);
          } catch (x) {
            pausar(dir, 5, {
              motivo: 'sync',
              pergunta: `${base}: não consegui atualizar ${r.branchPrincipal} com a origem: ${
                String(x.stderr || x.message)
                  .trim()
                  .split('\n')[0]
              }`,
              opcoes: [TENTAR, SEGUIR]
            });
            return false;
          }
        }
        let jaExiste = true;
        try {
          deps.git(r.caminho, ['rev-parse', '--verify', '--quiet', `refs/heads/${nome}`]);
        } catch {
          jaExiste = false;
        }
        deps.git(r.caminho, jaExiste ? ['checkout', nome] : ['checkout', '-b', nome]);
        aoVivo.anotar(dir, { tipo: 'acao', texto: `${base}: branch ${nome} (a partir de ${r.branchPrincipal})` });
      }
      feitos[r.caminho] = nome;
    } catch (x) {
      pausar(dir, 5, {
        motivo: 'git',
        pergunta: `${base}: erro de git: ${
          String(x.stderr || x.message)
            .trim()
            .split('\n')[0]
        }`,
        opcoes: [TENTAR]
      });
      return false;
    }
  }
  mudar(dir, { branches: feitos });
  return true;
}

module.exports = { slug, ramo, afetados, prepararBranches };
