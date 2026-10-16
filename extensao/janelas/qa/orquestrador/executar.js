// @ts-check
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const { gravarJson, estado, mudar } = require('../estado');
const { ativos, pausado, rodando } = require('./rodando');
const { reconciliar } = require('./reconciliar');
const { absorverPausa } = require('./pausa');
const { pausarPorApi } = require('./zero-skip');
const { cenarios } = require('../etapas/02-cenarios/mapa');
const { donoAmbiente, travar } = require('../etapas/03-ambiente/estado');
const { preparar } = require('../etapas/03-ambiente');
const { analisarAmbiente } = require('../etapas/03-ambiente/analise');
const { preCondicao } = require('../etapas/04-precondicao');
const { massa, MASSA } = require('../etapas/05-massa/estado');
const { semMassa, massaValida } = require('../etapas/05-massa/regras/validade');
const { validarMassa } = require('../etapas/05-massa/validar');
const { retomada } = require('./retomada');
const { prepararBanco } = require('./banco');
const { levantarMassa } = require('../etapas/05-massa');
const { fila } = require('../etapas/06-execucao/cenario');
const execucao = require('../etapas/06-execucao');
const { garantirInicio } = require('../etapas/06-execucao/inicio');
const { gerar } = require('../etapas/06-execucao/subetapas/6.0-gerar');

// ▶ do QA: tudo em ordem (ambiente → pré-condição → massa → cenários, zero skip). d = { chave, backend, api, horaRefresh, extras, aoMudar, confirmar(texto) → bool, alertar(texto) (diálogo de bloqueio/falha), healthCheck(amb) → { ok, motivo }, gravarTela(dir), pararTela(), avisar(texto) }.
// soMassa (↻ da Etapa 5): valida no banco a massa dos cenários PENDENTES, move para "Massas mortas" só a que não serve mais
// (inválida, consumida ou vencida) e levanta massa só para quem ficou sem; não executa cenário. Passou e não executável não entram.
async function executar(dir, d, { soMassa = false } = {}) {
  if (rodando(dir)) return;
  if (estado(dir).pausa)
    return aoVivo.anotar(dir, {
      tipo: 'aviso',
      texto: `Responda a pergunta antes de retomar: ${estado(dir).pausa.pergunta}`
    });
  reconciliar(dir);
  const volta = retomada(dir, d); // ⏸ do usuário: mesmo dia (só a massa do cenário pausado) ou depois do refresh (Etapa 5 para os pendentes)
  ativos.add(dir);
  mudar(dir, { execucao: 'rodando', host: process.pid, interrupcao: null });
  d.aoMudar?.();
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  try {
    if (estado(dir).fase !== 'plano_aprovado') return vivo('aviso', 'Aprove o planejamento antes de dar início');
    vivo('etapa', 'QA · 3. Execução');
    let pend = fila(cenarios(dir));
    if (!pend.length)
      return vivo(
        'fim',
        cenarios(dir).cenarios.length
          ? 'Nenhum cenário pendente. Use ↻ Refazer para executar um de novo'
          : 'Sem cenários para executar'
      );
    if (!(await prepararBanco(dir, d))) return; // MCP do SQLcl; fora do ar, o mapa-db só com o seu ok
    if (soMassa) {
      const ids = pend.map((c) => c.id),
        dosPendentes = (i) => (i.cenarios || []).some((x) => ids.includes(x));
      await validarMassa(
        dir,
        d,
        massa(dir)
          .itens.filter((i) => dosPendentes(i) && massaValida(i, new Date(), d.horaRefresh))
          .map((i) => i.id)
      );
      const m = massa(dir),
        serve = (i) => massaValida(i, new Date(), d.horaRefresh),
        mortas = m.itens.filter((i) => dosPendentes(i) && !serve(i));
      gravarJson(path.join(dir, MASSA), {
        ...m,
        itens: m.itens.filter((i) => !mortas.includes(i)),
        mortas: [...(m.mortas || []), ...mortas.map((i) => ({ ...i, morreuEm: new Date().toISOString() }))]
      });
      vivo(
        'acao',
        `Massa dos ${ids.length} pendente(s) validada no banco: ${mortas.length} movida(s) para Massas mortas; levantando só para quem ficou sem`
      );
    }
    const dono = donoAmbiente();
    if (
      dono &&
      dono.chave !== d.chave &&
      !(await d.confirmar(`O ambiente de testes (API, Metro, emulador) está com o ${dono.chave}. Usar no ${d.chave}?`))
    ) {
      return vivo('aviso', `Ambiente em uso pelo ${dono.chave}: QA não iniciado`);
    }
    travar(d.chave);
    const amb = await preparar(dir, d.chave, d.backend, d);
    if (!amb && !pausado(dir)) {
      vivo('acao', 'Pedindo ao Claude uma análise do erro (aparece ao clicar em Ambiente parou, no rodapé)');
      await analisarAmbiente(dir, d);
    }
    if (!amb || pausado(dir)) return;
    if (!(await preCondicao(dir, d, amb))) return; // falhou (motivo reportado) ou pausou: a suíte não começa
    if (!soMassa) {
      if ((await garantirInicio(dir, d, amb)).parou) return; // flows da tela de início: uma vez para todos os tickets
      // 6.0: UMA sessão escreve camadas, receita de massa e roteiros do card (d.gerar === false: o caminho antigo, cenário a cenário)
      if (d.gerar !== false && (await gerar(dir, d, amb)).parou) return;
      pend = fila(cenarios(dir));
    }
    // Massa vencida só pelo horário do refresh: confere no banco antes de ir à Etapa 5 (o registro costuma continuar servindo).
    if (volta !== 'mesmo-dia') {
      const ids = pend.map((c) => c.id),
        vencidas = massa(dir).itens.filter(
          (i) =>
            i.estado === 'valida' &&
            !massaValida(i, new Date(), d.horaRefresh) &&
            (i.cenarios || []).some((x) => ids.includes(x))
        );
      if (vencidas.length) {
        const r = await validarMassa(
          dir,
          d,
          vencidas.map((i) => i.id)
        );
        const n = Object.values(r).filter((v) => v === true).length;
        if (n) vivo('acao', `${n} massa(s) de antes do refresh conferida(s) no banco e reaproveitada(s)`);
      }
    }
    const agora = new Date(),
      falta =
        volta === 'mesmo-dia'
          ? []
          : semMassa(
              dir,
              pend.map((c) => c.id),
              agora,
              d.horaRefresh
            );
    vivo('etapa', 'QA · Massa de dados');
    if (falta.length) {
      vivo(
        'acao',
        `Sem massa válida para ${falta.join(', ')} (refresh do banco às ${d.horaRefresh || '06:00'}): levantando`
      );
      const rm = await levantarMassa(
        dir,
        d,
        amb,
        pend.filter((c) => falta.includes(c.id))
      );
      if (absorverPausa(dir) || pausado(dir)) return;
      if (
        rm.erro &&
        semMassa(
          dir,
          pend.map((c) => c.id),
          new Date(),
          d.horaRefresh
        ).length
      )
        return pausarPorApi(dir, d, rm.erro, null);
    } else
      vivo(
        'fim',
        volta === 'mesmo-dia'
          ? 'Retomada no mesmo dia: a massa é validada no banco cenário a cenário'
          : 'Massa de hoje ainda válida: reaproveitada'
      );
    if (soMassa) return vivo('fim', 'Massa nova levantada: use ▶ para executar os cenários');
    if (await execucao.rodar(dir, d, amb)) return; // Etapa 6: parou (pausa, bloqueio ou erro da API)
    if (!pausado(dir)) {
      const ativosC = cenarios(dir).cenarios.filter((c) => !c.arquivado),
        n = (s) => ativosC.filter((c) => c.status === s).length;
      const fim = `QA concluído: ${n('passou')} passaram, ${n('falhou')} falharam, ${n('bloqueado')} bloqueados, ${n('nao-executavel')} não executáveis`;
      vivo('fim', fim);
      d.avisar?.(fim);
    }
  } catch (e) {
    if (process.env.QA_DEBUG) console.error(e);
    vivo('erro', `QA parou: ${e.message}`);
  } finally {
    ativos.delete(dir);
    if (estado(dir).execucao === 'rodando') mudar(dir, { execucao: 'parado' });
    d.aoMudar?.();
  }
}

module.exports = { executar };
