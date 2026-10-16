// @ts-check
// Etapa 6 · Execução de cada cenário: um claude -p por cenário, na ordem da fila (zero skip). Devolve true quando parou (pausa, bloqueio, erro da API).
//   cenario.js           execuções de um cenário (abrir, concluir), a fila e o bloqueio sem massa
//   sem-massa.js         a massa do cenário ficou inválida: volta uma vez à Etapa 5
//   evidencias.js        anexos da execução em andamento
//   regras/evidencia.js  evidência obrigatória (e a consulta da tabela que a implementação grava)
//   prompt.js            prompt do cenário
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const { pausado } = require('../../orquestrador/rodando');
const { claude } = require('../../orquestrador/claude');
const { absorverPausa } = require('../../orquestrador/pausa');
const { bloquearFluxo, pausarPorApi } = require('../../orquestrador/zero-skip');
const { cenarios } = require('../02-cenarios/mapa');
const { massa } = require('../05-massa/estado');
const { massaValida, semMassa } = require('../05-massa/regras/validade');
const { fila, iniciarCenario, concluirCenario } = require('./cenario');
const { exigenciasDe } = require('./regras/evidencia');
const { promptCenario } = require('./prompt');
const { voltarParaMassa } = require('./sem-massa');

async function rodar(dir, d, amb) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  let pend;
  const retentou = new Set(); // cenários que já voltaram à Etapa 4 nesta rodada (1 volta por cenário; na 2ª pausa pedindo instrução, nunca pula)
  while (!pausado(dir) && (pend = fila(cenarios(dir))).length) {
    const c = pend[0],
      ex = iniciarCenario(dir, c.id, amb.sha);
    const itens = massa(dir).itens.filter(
      (i) => (i.cenarios || []).includes(c.id) && massaValida(i, new Date(), d.horaRefresh)
    );
    d.gravarTela?.(path.join(dir, ex.evidencias));
    const exige = exigenciasDe(dir, c);
    const { estourou, erro } = await claude(
      dir,
      {
        prompt: promptCenario(d.chave, c, amb, itens, dir, exige),
        titulo: `QA · ${c.id} · ${c.titulo}`,
        cwd: amb.backend || d.backend
      },
      d
    );
    d.pararTela?.();
    if (cenarios(dir).cenarios.find((x) => x.id === c.id)?.status === 'executando' && absorverPausa(dir)) {
      concluirCenario(dir, c.id, 'descartado', 'O Claude perguntou antes de concluir: volta à fila depois da resposta');
      return true;
    }
    const statusAgora = () => cenarios(dir).cenarios.find((x) => x.id === c.id)?.status;
    if (pausado(dir)) {
      if (statusAgora() === 'executando') {
        concluirCenario(dir, c.id, 'descartado', 'QA pausado no meio do cenário');
        vivo('aviso', `${c.id} descartado (pausa no meio): volta da fila na retomada`);
      }
      return true;
    }
    // Erro de API/tokens do Claude sem resultado registrado: pausa a fila neste cenário, sem pular os seguintes.
    if (erro && statusAgora() === 'executando') {
      pausarPorApi(dir, d, erro, c);
      return true;
    }
    // Zero skip: tempo estourado ou bloqueio relatado pelo Claude não pulam o cenário; pausa nele e espera o humano.
    if (estourou && statusAgora() === 'executando') {
      bloquearFluxo(dir, d, c, `passou de ${d.timeoutMin} min sem concluir`);
      return true;
    }
    if (statusAgora() === 'bloqueado') {
      bloquearFluxo(
        dir,
        d,
        c,
        cenarios(dir)
          .cenarios.find((x) => x.id === c.id)
          .execucoes.at(-1)?.nota || 'bloqueio informado pelo Claude'
      );
      return true;
    }
    if (
      cenarios(dir).cenarios.find((x) => x.id === c.id)?.status === 'executando' &&
      itens.length &&
      semMassa(dir, [c.id], new Date(), d.horaRefresh).length
    ) {
      concluirCenario(dir, c.id, 'sem-massa', 'Massa invalidada e o Claude não registrou o resultado'); // invalidou tudo e parou: é falta de massa, não falha
    }
    if (
      cenarios(dir)
        .cenarios.find((x) => x.id === c.id)
        ?.execucoes?.at(-1)?.status === 'sem-massa'
    ) {
      if (await voltarParaMassa(dir, d, amb, c, retentou)) return true;
      continue;
    }
    if (cenarios(dir).cenarios.find((x) => x.id === c.id)?.status === 'executando') {
      bloquearFluxo(dir, d, c, 'o Claude terminou sem registrar o resultado');
      return true;
    }
  }
  return false;
}

module.exports = { n: 6, rodar };
