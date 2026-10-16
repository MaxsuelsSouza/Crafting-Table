// @ts-check
// Etapa 5 com receita: roda a receita (sem IA); erro de SQL ou papel sem jeito → a IA corrige a receita na conversa do Gerar
// (--resume, uma vez por chamada) e a receita roda de novo; o que ainda ficar sem massa desiste (não executável) e a fila segue.
// Devolve o mesmo que levantarMassa: { ok } | { erro }.
const aoVivo = require('../../../../../componentes/ao-vivo');
const { estado, mudar } = require('../../../estado');
const { claude } = require('../../../orquestrador/claude');
const { pausado } = require('../../../orquestrador/rodando');
const { absorverPausa } = require('../../../orquestrador/pausa');
const { semMassa } = require('../regras/validade');
const { rodarReceita, desistir } = require('.');

async function levantarPorReceita(dir, d, amb, cens) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto }),
    precisam = () =>
      cens
        .map((c) => c.id)
        .filter((id) => !estado(dir).massaDesfecho?.[id] && semMassa(dir, [id], new Date(), d.horaRefresh).length);
  let r = await rodarReceita(dir, d, precisam());
  if (r.erro) return { erro: `banco: ${r.erro}` };
  if (r.proposta || absorverPausa(dir)) return { ok: true }; // lote de UPDATE à espera da sua aprovação: o ▶ volta depois
  const problemas = [...r.problemas, ...r.semJeito.map((s) => `${s.cenarios.join(', ')}: ${s.motivo}`)];
  const sid = estado(dir).gerarSid;
  if (problemas.length && sid) {
    vivo('aviso', `Receita de massa não resolveu (${problemas.length}): a IA corrige na conversa do Gerar`);
    const { promptReceita } = require('../../06-execucao/prompt-gerar'); // o prompt é do Gerar (6.0), que escreveu a receita
    mudar(dir, { etapa: 'receita', loteRoteiro: cens.map((c) => c.id) });
    let rc;
    try {
      rc = await claude(
        dir,
        {
          prompt: promptReceita(problemas),
          titulo: 'QA · Corrigindo a receita de massa',
          cwd: amb.backend || d.backend,
          banco: true,
          sessao: sid
        },
        d
      );
    } finally {
      mudar(dir, { etapa: null, loteRoteiro: null });
    }
    if (rc.erro) return { erro: rc.erro };
    if (absorverPausa(dir) || pausado(dir)) return { ok: true };
    r = await rodarReceita(dir, d, precisam());
    if (r.erro) return { erro: `banco: ${r.erro}` };
    if (r.proposta || absorverPausa(dir)) return { ok: true };
  }
  desistir(dir, r.semJeito);
  return { ok: true };
}

module.exports = { levantarPorReceita };
