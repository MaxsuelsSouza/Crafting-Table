// @ts-check
// Retomada depois do ⏸ do usuário (pausadoEm, gravado por pausar.js). O cenário pausado já voltou à fila (descartado), então ele reinicia.
//   'mesmo-dia'   a pausa não atravessou o refresh do banco: nada de Etapa 5 em lote; cada cenário valida a própria massa no banco (garantir-massa.js)
//   'outro-dia'   atravessou o refresh: toda massa vale como inválida (medida antes do refresh); Etapa 5 só para os pendentes
//                 (passou e não executável não estão na fila, então não mudam)
//   null          não era uma retomada de ⏸
const aoVivo = require('../../../componentes/ao-vivo');
const { estado, mudar } = require('../estado');
const { ultimoRefresh } = require('../etapas/05-massa/regras/validade');

function retomada(dir, d, agora = new Date()) {
  const em = estado(dir).pausadoEm;
  if (!em) return null;
  mudar(dir, { pausadoEm: null });
  const pausa = new Date(em),
    min = Math.round((agora.getTime() - pausa.getTime()) / 60000);
  const outroDia = ultimoRefresh(agora, d.horaRefresh) > pausa;
  aoVivo.anotar(dir, {
    tipo: 'acao',
    texto: outroDia
      ? `Retomada depois do refresh do banco (pausa de ${min} min): massas inválidas, Etapa 5 para os cenários pendentes`
      : `Retomada no mesmo dia (pausa de ${min} min): o cenário pausado reinicia validando só a massa dele`
  });
  return outroDia ? 'outro-dia' : 'mesmo-dia';
}

module.exports = { retomada };
