// @ts-check
// Depois de cada claude -p da Etapa 6 (roteiro 6.1 ou diagnóstico 6.3): pausa, erro da API, tempo, bloqueio e massa que ficou inválida.
// Devolve 'parou' (pausa, bloqueio, erro da API) | 'sem-massa' (volta à Etapa 5) | 'concluido' (o Claude registrou o resultado) | 'segue' (ainda em execução).
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../componentes/ao-vivo');
const { SID } = require('../../../../infra/agentes/maestro/estado');
const { mudar } = require('../../estado');
const { pausado } = require('../../orquestrador/rodando');
const { absorverPausa } = require('../../orquestrador/pausa');
const { bloquearFluxo, pausarPorApi } = require('../../orquestrador/zero-skip');
const { cenarios } = require('../02-cenarios/mapa');
const { semMassa } = require('../05-massa/regras/validade');
const { concluirCenario } = require('./cenario');

// retomavel: a pergunta do Claude neste ponto (6.1) é respondida na MESMA sessão (--resume), sem reler método nem refazer descobertas.
function depoisDoClaude(dir, d, c, { estourou, erro }, itens, { retomavel = false } = {}) {
  const atual = () => cenarios(dir).cenarios.find((x) => x.id === c.id),
    executando = () => atual()?.status === 'executando';
  if (executando() && absorverPausa(dir)) {
    if (retomavel) {
      let sid = '';
      try {
        sid = fs.readFileSync(path.join(dir, SID), 'utf8').trim();
      } catch {
        /* sem sessão gravada: a retomada abre outra */
      }
      if (sid) mudar(dir, { retomarSessao: { cenario: c.id, sid } });
    }
    concluirCenario(dir, c.id, 'descartado', 'O Claude perguntou antes de concluir: volta à fila depois da resposta');
    return 'parou';
  }
  if (pausado(dir)) {
    if (executando()) {
      concluirCenario(dir, c.id, 'descartado', 'QA pausado no meio do cenário');
      aoVivo.anotar(dir, { tipo: 'aviso', texto: `${c.id} descartado (pausa no meio): volta da fila na retomada` });
    }
    return 'parou';
  }
  // Erro de API/tokens do Claude sem resultado registrado: pausa a fila neste cenário, sem pular os seguintes.
  if (erro && executando()) {
    pausarPorApi(dir, d, erro, c);
    return 'parou';
  }
  // Zero skip: tempo estourado ou bloqueio relatado pelo Claude não pulam o cenário; pausa nele e espera o humano.
  if (estourou && executando()) {
    bloquearFluxo(dir, d, c, `passou de ${d.timeoutMin} min sem concluir`);
    return 'parou';
  }
  if (atual()?.status === 'bloqueado') {
    bloquearFluxo(dir, d, c, atual().execucoes.at(-1)?.nota || 'bloqueio informado pelo Claude');
    return 'parou';
  }
  if (executando() && itens.length && semMassa(dir, [c.id], new Date(), d.horaRefresh).length)
    concluirCenario(dir, c.id, 'sem-massa', 'Massa invalidada e o Claude não registrou o resultado'); // invalidou tudo e parou: é falta de massa, não falha
  if (atual()?.execucoes?.at(-1)?.status === 'sem-massa') return 'sem-massa';
  return executando() ? 'segue' : 'concluido';
}

module.exports = { depoisDoClaude };
