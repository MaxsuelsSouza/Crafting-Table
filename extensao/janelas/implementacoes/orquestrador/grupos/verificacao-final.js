// @ts-check
// Verificação final do pai (extensão, sem IA), só depois de integrar o grupo do worktree: os mesmos comandos de build e teste da etapa 6,
// agora com os dois grupos juntos na checkout. Grava verificacao.json do pai. Falhou: pausa (corrigir pelo G1, que roda na checkout, ou seguir).
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../componentes/ao-vivo');
const controle = require('../../../../infra/controle');
const { ARQ } = require('../../etapas');
const { deps } = require('../../dependencias');
const { CORRIGIR, RESUMIR, mudar, pausar } = require('../../estado');
const { verificacaoComandos } = require('../../etapas/06-verificacao');

/** true = passou (ou sem comandos); false = pausou ou foi interrompida. */
async function verificacaoFinal(s, t, rodada) {
  const dirPai = s.pastaAba(t.id),
    cmds = verificacaoComandos(),
    rodadas = [];
  aoVivo.anotar(dirPai, { tipo: 'etapa', texto: 'Esteira · Verificação final (grupos juntos)' });
  for (const c of cmds) {
    aoVivo.anotar(dirPai, {
      tipo: 'acao',
      texto: `${c.papel === 'build' ? 'Build' : 'Teste'}: ${c.nome} (${c.comando})`
    });
    const r = await deps.executar(c.comando, c.pasta, dirPai);
    if (!controle.valida(dirPai, rodada)) return false;
    rodadas.push({
      nome: c.nome,
      papel: c.papel,
      comando: c.comando,
      pasta: c.pasta,
      codigo: r.codigo,
      saida: r.saida
    });
  }
  const ok = rodadas.every((r) => r.codigo === 0);
  fs.writeFileSync(
    path.join(dirPai, ARQ[6]),
    JSON.stringify({ ok, final: true, em: new Date().toISOString(), rodadas }, null, 2)
  );
  if (ok) {
    mudar(dirPai, { verificadoFinal: 'ok' });
    aoVivo.anotar(dirPai, { tipo: 'fim', texto: `Verificação final passou (${rodadas.length} comando(s))` });
    return true;
  }
  const falhas = rodadas.filter((r) => r.codigo !== 0).map((r) => r.nome);
  pausar(dirPai, 0, {
    motivo: 'verificacao-final',
    pergunta: `A verificação final, com os grupos juntos, falhou: ${falhas.join(', ')} (veja ${ARQ[6]}). ${CORRIGIR}: o G1 roda a correção na branch com tudo junto.`,
    opcoes: [CORRIGIR, RESUMIR]
  });
  return false;
}

module.exports = { verificacaoFinal };
