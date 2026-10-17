// @ts-check
// 1.3 · Roteiro (claude -p, só planeja): os cenários da reprodução no fluxo.json (bin reproducao-fluxo plano), cada passo com a fonte.
// Roteiro já planejado (retomada): não planeja de novo. Sem passo a passo nas fontes, a IA pausa e o veredito fica INCONCLUSIVO com a pergunta dela.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const fluxo = require('../../../../../componentes/fluxo-passos');
const prompts = require('../../../prompts');
const { RESPOSTAS } = require('../../../estado');
const { lerPausa, limparPausa } = require('../../../orquestrador/pausa');
const { promptRoteiro } = require('../reproducao/prompt-roteiro');
const { LEITURA_REPRO } = require('../regras/ferramentas');
const { claude } = require('../regras/claude');

/** @returns {Promise<{ motivo: string }>} motivo vazio = há roteiro */
async function roteiro(s, t) {
  const dir = s.pastaAba(t.id);
  aoVivo.anotar(dir, { tipo: 'etapa', texto: 'Reprodução 1.3 · Roteiro' });
  if (fluxo.ler(dir).passos.length) return { motivo: '' };
  const resp = path.join(dir, RESPOSTAS);
  await claude(s, t, {
    prompt: promptRoteiro({ dir, t, gravar: prompts.GRAVAR, respostas: fs.existsSync(resp) ? resp : '' }),
    titulo: 'Esteira · Reprodução 1.3: roteiro',
    ferramentas: LEITURA_REPRO()
  });
  const p = lerPausa(dir);
  limparPausa(dir);
  if (fluxo.ler(dir).passos.length) return { motivo: '' };
  return {
    motivo: p?.pergunta ? `sem passo a passo: ${p.pergunta}` : 'sem passo a passo: a IA não planejou nenhum cenário'
  };
}

module.exports = { roteiro };
