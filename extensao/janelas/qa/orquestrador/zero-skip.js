// @ts-check
const path = require('path');
const aoVivo = require('../../../componentes/ao-vivo');
const { gravarJson, mudar } = require('../estado');
const { cenarios, CENARIOS } = require('../etapas/02-cenarios/mapa');
const { concluirCenario } = require('../etapas/06-execucao/cenario');

// ── Zero skip: nenhum cenário é pulado. Bloqueio de fluxo/tela pausa NO cenário (volta à fila, mesma posição), abre o diálogo e espera o humano.
// Falta de tokens ou erro da API do Claude pausa a fila no ponto exato; o estado fica nos arquivos e a retomada segue do mesmo cenário.
function bloquearFluxo(dir, d, c, motivo) {
  const x = cenarios(dir).cenarios.find((y) => y.id === c.id),
    nota = `Bloqueio: ${motivo}`;
  if (x?.status === 'executando') concluirCenario(dir, c.id, 'descartado', nota);
  else if (x?.status === 'bloqueado') reabrirBloqueado(dir, c.id, nota); // o Claude concluiu como bloqueado: volta para a fila, não fica como resultado
  const pergunta = `${c.id} ficou bloqueado: ${motivo}. A fila parou neste cenário (nenhum é pulado). Resolva o bloqueio e responda para retomar.`;
  mudar(dir, {
    pausa: { motivo: 'bloqueio', pergunta, opcoes: ['Tentar de novo'], etapa: 'Execução', detalhe: motivo },
    execucao: 'pausado'
  });
  aoVivo.anotar(dir, {
    tipo: 'aviso',
    texto: `${c.id} bloqueado (${motivo}): QA pausado neste cenário, aguardando instrução`
  });
  d.alertar?.(`${c.id} · ${c.titulo}\n\nBloqueio: ${motivo}\n\nO QA pausou neste cenário e aguarda a sua instrução.`);
}
function reabrirBloqueado(dir, id, nota) {
  const r = cenarios(dir),
    c = r.cenarios.find((x) => x.id === id),
    ex = c?.execucoes?.at(-1);
  if (!c || c.status !== 'bloqueado') return;
  c.status = 'pendente';
  if (ex) Object.assign(ex, { status: 'descartado', nota: `${ex.nota ? `${ex.nota} · ` : ''}${nota}` });
  gravarJson(path.join(dir, CENARIOS), r);
}
// Limite de sessão do Claude ("resets 11:30am"): quando volta, em hora local (o próximo horário igual a esse).
function voltaDoLimite(erro, agora = new Date()) {
  const m = String(erro).match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (!m[3]) h = Number(m[1]);
  else if (m[3].toLowerCase() === 'pm') h += 12;
  const t = new Date(agora);
  t.setHours(h, Number(m[2] || 0), 0, 0);
  if (t <= agora) t.setDate(t.getDate() + 1);
  return t;
}
// Erro de API/tokens do Claude: o cenário em andamento volta à fila e a fila pausa; `interrupcao` no estado diz onde parou. Sempre devolve false.
// Limite de sessão com horário: a fila retoma sozinha 1 min depois desse horário (se ninguém mexeu no QA até lá).
function pausarPorApi(dir, d, erro, c) {
  if (c && cenarios(dir).cenarios.find((x) => x.id === c.id)?.status === 'executando')
    concluirCenario(dir, c.id, 'descartado', `Erro da API do Claude: ${erro}`);
  const volta = voltaDoLimite(erro),
    voltaEm = volta ? volta.toISOString() : null;
  mudar(dir, {
    execucao: 'pausado',
    etapa: null,
    interrupcao: {
      motivo: 'api-claude',
      cenario: c?.id || null,
      detalhe: String(erro).slice(0, 300),
      em: new Date().toISOString(),
      voltaEm
    }
  });
  if (volta)
    setTimeout(
      () => {
        const { estado } = require('../estado');
        const e = estado(dir);
        if (e.execucao !== 'pausado' || e.pausa || e.interrupcao?.voltaEm !== voltaEm) return; // alguém já retomou ou mexeu
        aoVivo.anotar(dir, { tipo: 'acao', texto: 'Limite de sessão do Claude passou: retomando a fila sozinho' });
        require('./executar').executar(dir, d);
      },
      volta.getTime() - Date.now() + 60000
    ).unref?.();
  aoVivo.anotar(dir, {
    tipo: 'erro',
    texto: `Claude indisponível (${String(erro).slice(0, 120)}): fila pausada${c ? ` em ${c.id}` : ''}; ${volta ? `retoma sozinha às ${volta.toTimeString().slice(0, 5)}` : 'retome quando voltar'}`
  });
  d.alertar?.(
    `O Claude parou por erro de API ou falta de tokens:\n${String(erro).slice(0, 200)}\n\nA fila foi pausada${c ? ` em ${c.id}` : ''} e nenhum cenário seguinte foi pulado. Retome quando voltar.`
  );
  return false;
}

module.exports = { bloquearFluxo, reabrirBloqueado, pausarPorApi, voltaDoLimite };
