// @ts-check
// 6.0 · Gerar: UMA sessão por card escreve camadas (card.json), a receita de massa e o roteiro de cada cenário pendente.
// Depois a extensão roda tudo sem IA; a sessão fica guardada (estado.gerarSid) e as correções voltam nela por --resume.
// Pula quando nada falta (cenário com roteiro atual ou não verificável, receita cobrindo todos). Devolve { ok } | { parou }.
const aoVivo = require('../../../../../componentes/ao-vivo');
const { estado, mudar } = require('../../../estado');
const { claude } = require('../../../orquestrador/claude');
const { lerSid } = require('../../../orquestrador/sid');
const { pausado } = require('../../../orquestrador/rodando');
const { absorverPausa } = require('../../../orquestrador/pausa');
const { bancoDaSessao } = require('../../../orquestrador/banco');
const { cenarios } = require('../../02-cenarios/mapa');
const { lerReceita } = require('../../05-massa/receita');
const { exigenciasDe } = require('../regras/evidencia');
const { camadaDe } = require('../regras/camadas');
const { roteiroDe } = require('../roteiros');
const { fila } = require('../cenario');
const { promptGerar, promptFaltou } = require('../prompt-gerar');

// O que ainda falta para o cenário rodar sem IA.
function faltaDe(dir, c) {
  const cam = camadaDe(dir, c.id),
    rec = lerReceita(dir),
    naReceita =
      !!rec && [...(rec.dispensa || []), ...(rec.papeis || []).flatMap((p) => p.cenarios || [])].includes(c.id);
  if (!cam) return 'camada';
  if (cam.camada === 'nao-verificavel') return '';
  if (!naReceita) return 'receita';
  return roteiroDe(dir, c) ? '' : 'roteiro';
}

/** Roda uma volta da sessão do Gerar: nova (prompt) ou retomada (estado.gerarSid). @returns {Promise<boolean>} true = parou */
async function sessaoGerar(dir, d, amb, prompt, titulo, ids, { retomar = false } = {}) {
  const sid = estado(dir).gerarSid;
  // loteRoteiro: todos os pendentes (a IA pode reescrever um roteiro já registrado); gerarExigir: o que esta volta precisa cobrir
  mudar(dir, { etapa: 'gerar', loteRoteiro: fila(cenarios(dir)).map((c) => c.id), gerarExigir: ids });
  try {
    const r = await claude(
      dir,
      { prompt, titulo, cwd: amb.backend || d.backend, banco: true, ...(retomar && sid ? { sessao: sid } : {}) },
      { ...d, timeoutMin: d.timeoutMin > 0 ? d.timeoutMin * (1 + ids.length / 4) : 0 } // mais cenários, mais tempo
    );
    mudar(dir, { gerarSid: lerSid(dir) || sid || null });
    // Tempo estourado não trava o QA: o que ficou sem roteiro volta ao roteiro próprio (6.1) na execução.
    if (r.estourou)
      aoVivo.anotar(dir, { tipo: 'aviso', texto: 'Gerar passou do tempo: o que faltou segue cenário a cenário' });
    return !!(r.erro || absorverPausa(dir) || pausado(dir) || estado(dir).pausa);
  } finally {
    mudar(dir, { etapa: null, loteRoteiro: null, gerarExigir: null });
  }
}

async function gerar(dir, d, amb) {
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  const pend = () => fila(cenarios(dir)).filter((c) => faltaDe(dir, c));
  let p = pend();
  if (!p.length) return { ok: true };
  vivo('etapa', `QA · 6.0 Gerar: camadas, receita de massa e roteiros de ${p.length} cenário(s) numa sessão só`);
  const banco = bancoDaSessao(dir, d).texto;
  if (
    await sessaoGerar(
      dir,
      d,
      amb,
      promptGerar(
        d.chave,
        p.map((c) => ({ c, exige: exigenciasDe(dir, c) })),
        amb,
        dir,
        banco
      ),
      `QA · Gerando a execução de ${p.length} cenário(s)`,
      p.map((c) => c.id),
      { retomar: true } // já houve um Gerar neste card (cenário novo ou que faltou): continua a mesma conversa
    )
  )
    return { parou: true };
  p = pend();
  if (p.length && estado(dir).gerarSid) {
    vivo(
      'aviso',
      `Gerar: faltou ${p.map((c) => `${c.id} (${faltaDe(dir, c)})`).join(', ')}: pedindo na mesma conversa`
    );
    if (
      await sessaoGerar(
        dir,
        d,
        amb,
        promptFaltou(p.map((c) => `${c.id} (${faltaDe(dir, c)})`)),
        'QA · Gerar: completando',
        p.map((c) => c.id),
        {
          retomar: true
        }
      )
    )
      return { parou: true };
  }
  const resto = pend();
  vivo(
    resto.length ? 'aviso' : 'fim',
    resto.length
      ? `Gerar: ${resto.map((c) => c.id).join(', ')} sem tudo pronto: cada um volta para o roteiro próprio na execução`
      : 'Gerar: tudo pronto. Daqui em diante a extensão executa sem IA'
  );
  return { ok: true };
}

module.exports = { gerar, faltaDe, sessaoGerar };
