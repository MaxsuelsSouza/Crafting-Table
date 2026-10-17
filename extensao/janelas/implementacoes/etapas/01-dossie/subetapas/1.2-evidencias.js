// @ts-check
// 1.2 · Evidências (código + IA): baixa os anexos do ticket, do pai e dos irmãos que parecem evidência (print, vídeo, log), tira os quadros dos
// vídeos (ffmpeg, infra/reproducao/quadros-video.js) e um claude -p só leitura grava evidencias-ticket.md (massa, comportamento relatado,
// fluxo executado, esperado × obtido, quando funcionava, ambiente/plataforma, erros e logs, não analisado).
// Já gravado (retomada): não roda a IA de novo. Devolve os vídeos não analisados (mídia essencial: o veredito conta).
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const prompts = require('../../../prompts');
const { deps: depsEsteira } = require('../../../dependencias');
const { CONTEXTO, estado, mudar } = require('../../../estado');
const { limparPausa } = require('../../../orquestrador/pausa');
const { evidenciasDoTicket, PASTA, EVIDENCIAS_MD } = require('../reproducao/evidencias-ticket');
const { promptEvidencias } = require('../reproducao/prompt-evidencias');
const { LEITURA_REPRO } = require('../regras/ferramentas');
const { claude } = require('../regras/claude');
const { deps } = require('../dependencias');

/** @returns {Promise<{ midia: string[] }>} */
async function evidencias(s, t) {
  const dir = s.pastaAba(t.id),
    j = s.cacheJira?.[t.id];
  aoVivo.anotar(dir, { tipo: 'etapa', texto: 'Reprodução 1.2 · Evidências' });
  if (j?.anexos?.length) {
    const achados = await depsEsteira.coletarEvidencias(dir, j.anexos, s);
    aoVivo.anotar(dir, {
      tipo: 'fala',
      texto: achados.length
        ? `Evidências encontradas no ticket, no pai ou nos irmãos: ${achados.length}`
        : 'Nenhuma evidência (print, vídeo ou log) nos anexos do ticket, do pai e dos irmãos'
    });
  }
  const videos = evidenciasDoTicket(dir).map((e) => path.join(dir, e.arquivo));
  const q = deps.quadros(path.join(dir, PASTA), videos);
  for (const x of q.naoAnalisados)
    aoVivo.anotar(dir, { tipo: 'aviso', texto: `Vídeo não analisado: ${path.basename(x.video)} (${x.motivo})` });
  const midia = q.naoAnalisados.map((x) => path.basename(x.video));
  mudar(dir, { repro: { ...(estado(dir).repro || {}), midia } });
  if (fs.existsSync(path.join(dir, EVIDENCIAS_MD))) return { midia };
  await claude(s, t, {
    prompt: promptEvidencias({ dir, t, contexto: CONTEXTO, gravar: prompts.GRAVAR, ...q }),
    titulo: 'Esteira · Reprodução 1.2: evidências',
    ferramentas: LEITURA_REPRO()
  });
  limparPausa(dir); // a 1.2 não pausa: o que falta vai para "Não analisado"
  if (!fs.existsSync(path.join(dir, EVIDENCIAS_MD)))
    aoVivo.anotar(dir, { tipo: 'aviso', texto: `A IA não gravou ${EVIDENCIAS_MD}: o roteiro usa só o ticket` });
  return { midia };
}

module.exports = { evidencias };
