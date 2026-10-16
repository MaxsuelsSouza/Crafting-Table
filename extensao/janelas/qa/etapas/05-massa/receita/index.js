// @ts-check
// Etapa 5 pela receita (qa/massa-receita.json, escrita pela IA no 6.0 Gerar): sem IA na rodada normal.
//   1. roda todas as buscas numa chamada ao banco e distribui um registro por cenário (buscar.js)
//   2. o que faltou e tem "produzir": um lote só de UPDATEs para você aprovar (produzir.js, proposta.js)
//   3. erro de SQL ou papel sem jeito: a IA corrige a receita na MESMA conversa do Gerar (--resume), uma vez; depois desiste do cenário
//   formato.js   o formato e a validação
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { lerJson, gravarJson, estado, mudar } = require('../../../estado');
const { liberado } = require('../../../../../infra/agentes/banco');
const { massa, massaAdd } = require('../estado');
const { proporMassa } = require('../proposta');
const { desistirMassa } = require('../desistir');
const { ARQUIVO, validarReceita } = require('./formato');
const { distribuir } = require('./buscar');
const { montarProducao } = require('./produzir');

const lerReceita = (dir) => lerJson(path.join(dir, ARQUIVO), null);
const temReceita = (dir) => fs.existsSync(path.join(dir, ARQUIVO));

/** Grava a receita depois de validar (qa-state receita). @returns {string[]} erros */
function registrarReceita(dir, r, ids, exigir = ids) {
  const erros = validarReceita(r, ids, exigir);
  if (!erros.length) gravarJson(path.join(dir, ARQUIVO), { ...r, em: new Date().toISOString() });
  return erros;
}

const consultarCom = (d) => (sqls) => (d.consultarBanco || require('../dependencias').consultar)(d.banco, sqls);

/**
 * Massa para os cenários dados, pela receita. Não chama IA.
 * @returns {Promise<{ ok?: boolean, erro?: string, proposta?: boolean, problemas: string[], semJeito: { cenarios: string[], motivo: string }[] }>}
 */
async function rodarReceita(dir, d, ids) {
  const rec = lerReceita(dir),
    vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const dispensa = (rec.dispensa || []).filter((c) => ids.includes(c));
  if (dispensa.length)
    mudar(dir, {
      massaDesfecho: {
        ...estado(dir).massaDesfecho,
        ...Object.fromEntries(dispensa.map((c) => [c, { tipo: 'dispensa' }]))
      }
    });
  const alvo = rec.papeis.map((p, i) => i).filter((i) => rec.papeis[i].cenarios.some((c) => ids.includes(c)));
  if (!alvo.length) return { ok: true, problemas: [], semJeito: [] };
  const consultar = consultarCom(d),
    t0 = Date.now();
  const res = await consultar(alvo.map((i) => rec.papeis[i].busca));
  if (res.erro) return { erro: res.erro, problemas: [], semJeito: [] };
  const resultados = [];
  alvo.forEach((i, k) => (resultados[i] = res.resultados[k]));
  const m = massa(dir),
    usados = [...m.itens, ...(m.mortas || [])].map((i) => i.dados || {});
  const dist = distribuir(rec, resultados, ids, usados);
  const novos = dist.registros.map((r) => massaAdd(dir, r));
  vivo(
    'acao',
    `Receita de massa: ${alvo.length} busca(s) em ${((Date.now() - t0) / 1000).toFixed(1)} s, sem IA: ${novos.length} registro(s) (${novos.join(', ') || 'nenhum'})`
  );
  if (!dist.faltam.length) return { ok: true, problemas: dist.erros, semJeito: [] };
  if (!liberado(d.banco || {}))
    return {
      ok: true,
      problemas: dist.erros,
      semJeito: dist.faltam.map((f) => ({ cenarios: f.cenarios, motivo: 'busca vazia e banco sem escrita liberada' }))
    };
  const prod = await montarProducao(rec, dist.faltam, consultar);
  if (prod.proposta) {
    proporMassa(dir, prod.proposta);
    vivo(
      'aviso',
      `Massa: ${prod.proposta.receita.length} registro(s) a produzir por UPDATE: aguardando sua aprovação (um lote só)`
    );
  }
  return { ok: true, proposta: !!prod.proposta, problemas: dist.erros, semJeito: prod.semJeito };
}

// Sem jeito mesmo depois da correção: o cenário fica não executável e a fila segue (zero skip vale para cenário com massa possível).
function desistir(dir, semJeito) {
  for (const s of semJeito) for (const c of s.cenarios) desistirMassa(dir, c, s.motivo);
}

module.exports = { ARQUIVO, lerReceita, temReceita, registrarReceita, rodarReceita, desistir, validarReceita };
