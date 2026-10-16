// @ts-check
// Antes de cada cenário: "Validar massa" no banco só da massa dele (é também o que a retomada depois de uma pausa faz).
//   válida (ou sem como conferir)       → segue com ela
//   inválida, 1º cenário seguido         → renova só a deste cenário (Etapa 5 restrita a ele: busca 5 min, depois UPDATE aprovado)
//   inválida, 2º cenário seguido         → Etapa 5 de novo para todos os pendentes (valida a massa deles antes, para só ir ao banco quem precisa)
//   não achou nem gerou                  → não executável e a fila segue
// seguidas = { invalidas } (contador da rodada, vive no laço do index.js).
// Devolve { itens } | { parou: true } | { naoExecutavel: true }.
const aoVivo = require('../../../../componentes/ao-vivo');
const { estado } = require('../../estado');
const { pausado } = require('../../orquestrador/rodando');
const { absorverPausa } = require('../../orquestrador/pausa');
const { pausarPorApi } = require('../../orquestrador/zero-skip');
const { cenarios } = require('../02-cenarios/mapa');
const { massa } = require('../05-massa/estado');
const { massaValida } = require('../05-massa/regras/validade');
const { validarMassa } = require('../05-massa/validar');
const { desistirMassa } = require('../05-massa/desistir');
const { levantarMassa } = require('../05-massa');
const { fila, NAO_EXECUTAVEL } = require('./cenario');

const validosDe = (dir, d, ids) =>
  massa(dir).itens.filter(
    (i) => (i.cenarios || []).some((x) => ids.includes(x)) && massaValida(i, new Date(), d.horaRefresh)
  );

async function garantirMassa(dir, d, amb, c, seguidas) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const doCenario = massa(dir).itens.filter((i) => (i.cenarios || []).includes(c.id));
  if (!doCenario.length) return { itens: [] }; // cenário que não precisa de massa (ou dispensado na Etapa 5)
  const candidatos = validosDe(dir, d, [c.id]);
  if (candidatos.length) {
    const r = await validarMassa(
      dir,
      d,
      candidatos.map((i) => i.id)
    );
    const ok = candidatos.filter((i) => r[i.id] !== false);
    if (ok.length) {
      seguidas.invalidas = 0;
      if (Object.values(r).some((v) => v === true)) vivo('acao', `${c.id}: massa validada no banco`);
      return { itens: validosDe(dir, d, [c.id]).filter((i) => ok.some((o) => o.id === i.id)) };
    }
  }
  seguidas.invalidas++;
  let alvo = [c];
  if (seguidas.invalidas >= 2) {
    seguidas.invalidas = 0;
    alvo = fila(cenarios(dir));
    vivo(
      'aviso',
      `${c.id}: 2º cenário seguido com massa inválida: refazendo a Etapa 5 para os ${alvo.length} pendente(s)`
    );
    await validarMassa(
      dir,
      d,
      validosDe(
        dir,
        d,
        alvo.map((x) => x.id)
      ).map((i) => i.id)
    );
  } else vivo('aviso', `${c.id}: massa inválida: renovando só a deste cenário`);
  const r5 = await levantarMassa(dir, d, amb, alvo);
  if (absorverPausa(dir) || estado(dir).pausa || pausado(dir)) return { parou: true };
  const itens = validosDe(dir, d, [c.id]);
  if (itens.length) return { itens };
  if (r5.erro) {
    pausarPorApi(dir, d, r5.erro, c);
    return { parou: true };
  }
  if (cenarios(dir).cenarios.find((x) => x.id === c.id)?.status !== NAO_EXECUTAVEL)
    desistirMassa(dir, c.id, 'massa inválida e a Etapa 5 não achou nem gerou outra');
  return { naoExecutavel: true };
}

module.exports = { garantirMassa };
