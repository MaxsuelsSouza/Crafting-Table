// @ts-check
// Onde está o código do ticket (antes de preparar o ambiente): infra/git localizar + escolher em cada repositório, pela chave do ticket e das
// subtarefas. Só leitura: o QA nunca faz checkout para ler; a ref vai para a skill (--ref/--ref-mobile) e para os prompts (mapa-git show/log -p).
//   1 achado (ou mesma família) → usa e anota no Ao vivo; 0 → pausa (Informar a ref · Seguir na principal); empate real → pausa com as refs.
// Grava estado.codigo[camada] = { ref, via, commits }. A resposta da pausa (responderCodigo) fixa a ref: as próximas execuções não buscam de novo.
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const git = require('../../../../../infra/git');
const { estado, mudar } = require('../../../estado');

const PRINCIPAL = 'Seguir na principal';
const nomeDe = (r) => r.camada || path.basename(r.caminho);
const resumo = (a) => ({ ref: a.ref, via: a.via, commits: a.commits.length });

async function chavesDo(d) {
  const subs = await Promise.resolve(d.filhos?.(d.chave)).catch(() => []);
  return [d.chave, ...(subs || []).map((s) => s.key)].filter(Boolean);
}

/** @returns {Promise<boolean>} true = segue; false = pausou */
async function localizarCodigo(dir, d) {
  const repos = (d.repos || []).filter((r) => r?.caminho);
  if (!repos.length || !d.chave) return true;
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const chaves = await chavesDo(d);
  for (const r of repos) {
    const nome = nomeDe(r);
    if (estado(dir).codigo?.[nome]?.fixo) continue; // você escolheu na pausa
    const res = git.localizar(r, chaves, { candidatas: d.candidatas?.length ? d.candidatas : undefined });
    if (res.aviso) vivo('aviso', `${nome}: ${res.aviso}`);
    const e = git.escolher(res.achados);
    const cands = (d.candidatas?.length ? d.candidatas : git.CANDIDATAS_PADRAO).join(', ');
    if (!e || Array.isArray(e)) {
      const achados = (e || []).slice(0, 4).map(resumo);
      mudar(dir, {
        execucao: 'pausado',
        pausa: {
          motivo: 'codigo',
          repo: nome,
          caminho: r.caminho,
          achados,
          principal: git.refPrincipal(r.caminho, r.branchPrincipal) || r.branchPrincipal || 'HEAD',
          etapa: 'Ambiente',
          pergunta: e
            ? `${nome}: o código de ${d.chave} está em mais de um lugar (${achados.map((a) => `${a.ref}, ${a.commits} commit(s)`).join(' · ')}). Qual eu testo?`
            : `${nome}: não achei código de ${d.chave} em ${cands} nem na principal. Informe a ref (Responder…) ou siga na principal.`,
          opcoes: [...achados.map((a) => a.ref), PRINCIPAL]
        }
      });
      vivo('aviso', `${nome}: ${e ? 'código em mais de um lugar' : 'código do ticket não encontrado'}: QA pausado`);
      return false;
    }
    mudar(dir, { codigo: { ...(estado(dir).codigo || {}), [nome]: { ...resumo(e), caminho: r.caminho } } });
    vivo('acao', `${nome}: código em ${e.ref} (${e.commits.length} commit${e.commits.length === 1 ? '' : 's'})`);
    if (res.faltando.length) vivo('aviso', `${nome}: sem commit de ${res.faltando.join(', ')} em ${e.ref}`);
  }
  return true;
}

/** Resposta à pausa 'codigo': uma das refs, "Seguir na principal" ou texto livre (a ref). @returns {boolean} tratou */
function responderCodigo(dir, pausa, resposta) {
  if (pausa?.motivo !== 'codigo') return false;
  const r = String(resposta || '').trim(),
    achado = (pausa.achados || []).find((a) => a.ref === r);
  const v =
    r === PRINCIPAL
      ? { ref: pausa.principal || 'HEAD', via: 'principal', commits: 0 }
      : achado || { ref: r, via: 'informado', commits: 0 };
  mudar(dir, {
    pausa: null,
    codigo: { ...(estado(dir).codigo || {}), [pausa.repo]: { ...v, caminho: pausa.caminho, fixo: true } }
  });
  aoVivo.anotar(dir, { tipo: 'acao', texto: `${pausa.repo}: código em ${v.ref} (sua escolha)` });
  return true;
}

module.exports = { localizarCodigo, responderCodigo, PRINCIPAL };
