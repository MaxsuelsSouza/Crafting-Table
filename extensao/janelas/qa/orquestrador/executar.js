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
const { semMassa } = require('../etapas/05-massa/regras/validade');
const { levantarMassa } = require('../etapas/05-massa');
const { fila } = require('../etapas/06-execucao/cenario');
const execucao = require('../etapas/06-execucao');

// ▶ do QA: tudo em ordem (ambiente → pré-condição → massa → cenários, zero skip). d = { chave, backend, api, horaRefresh, extras, aoMudar, confirmar(texto) → bool, alertar(texto) (diálogo de bloqueio/falha), healthCheck(amb) → { ok, motivo }, gravarTela(dir), pararTela(), avisar(texto) }.
// soMassa (↻ da Etapa 5): move a massa da aba para "Massas mortas" e só levanta massa nova para todos os cenários ativos; não executa cenário.
async function executar(dir, d, { soMassa = false } = {}) {
  if (rodando(dir)) return;
  if (estado(dir).pausa)
    return aoVivo.anotar(dir, {
      tipo: 'aviso',
      texto: `Responda a pergunta antes de retomar: ${estado(dir).pausa.pergunta}`
    });
  reconciliar(dir);
  ativos.add(dir);
  mudar(dir, { execucao: 'rodando', host: process.pid, interrupcao: null });
  d.aoMudar?.();
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  try {
    if (estado(dir).fase !== 'plano_aprovado') return vivo('aviso', 'Aprove o planejamento antes de dar início');
    vivo('etapa', 'QA · 3. Execução');
    const ativosC = () => cenarios(dir).cenarios.filter((c) => !c.arquivado && c.status !== 'dispensado');
    let pend = soMassa ? ativosC() : fila(cenarios(dir));
    if (!pend.length)
      return vivo(
        'fim',
        cenarios(dir).cenarios.length
          ? 'Nenhum cenário pendente. Use ↻ Refazer para executar um de novo'
          : 'Sem cenários para executar'
      );
    if (soMassa) {
      const m = massa(dir);
      gravarJson(path.join(dir, MASSA), {
        ...m,
        itens: [],
        mortas: [...(m.mortas || []), ...m.itens.map((i) => ({ ...i, morreuEm: new Date().toISOString() }))]
      });
      vivo('acao', 'Massa antiga movida para Massas mortas: levantando massa nova para todos os cenários');
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
    const agora = new Date(),
      falta = semMassa(
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
    } else vivo('fim', 'Massa de hoje ainda válida: reaproveitada');
    if (soMassa) return vivo('fim', 'Massa nova levantada: use ▶ para executar os cenários');
    if (await execucao.rodar(dir, d, amb)) return; // Etapa 6: parou (pausa, bloqueio ou erro da API)
    if (!pausado(dir)) {
      const ativosC = cenarios(dir).cenarios.filter((c) => !c.arquivado),
        n = (s) => ativosC.filter((c) => c.status === s).length;
      const fim = `QA concluído: ${n('passou')} passaram, ${n('falhou')} falharam, ${n('bloqueado')} bloqueados`;
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
