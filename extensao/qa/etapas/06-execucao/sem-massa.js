// @ts-check
const aoVivo = require('../../../componentes/ao-vivo');
const { pausado } = require('../../orquestrador/rodando');
const { absorverPausa } = require('../../orquestrador/pausa');
const { bloquearFluxo, pausarPorApi } = require('../../orquestrador/zero-skip');
const { semMassa } = require('../05-massa/regras/validade');
const { levantarMassa } = require('../05-massa');

// Etapa 6 → Etapa 5: a massa do cenário ficou inválida (sem-massa). Uma volta por cenário na rodada (retentou); na 2ª, pausa pedindo instrução.
// Devolve true quando parou (pausa, bloqueio, erro da API); false = segue a fila.
async function voltarParaMassa(dir, d, amb, c, retentou) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  if (pausado(dir)) return false;
  if (retentou.has(c.id)) {
    bloquearFluxo(
      dir,
      d,
      c,
      'sem massa válida mesmo depois de refazer a Etapa 4 (levante a massa na aba Massa e responda para tentar de novo)'
    );
    return true;
  }
  retentou.add(c.id);
  vivo('aviso', `Etapa 5 → voltando para a Etapa 4: massa de ${c.id} inválida`);
  vivo('etapa', 'QA · Massa de dados');
  const r4 = await levantarMassa(dir, d, amb, [c]);
  if (absorverPausa(dir)) return true;
  if (r4.erro && !pausado(dir) && semMassa(dir, [c.id], new Date(), d.horaRefresh).length) {
    pausarPorApi(dir, d, r4.erro, c);
    return true;
  }
  if (!pausado(dir) && semMassa(dir, [c.id], new Date(), d.horaRefresh).length) {
    bloquearFluxo(dir, d, c, 'a Etapa 4 não achou massa válida para o cenário');
    return true;
  } else vivo('fim', `Etapa 4 refeita para ${c.id}: retomando a Etapa 5`);
  vivo('etapa', 'QA · Execução');
  return false;
}

module.exports = { voltarParaMassa };
