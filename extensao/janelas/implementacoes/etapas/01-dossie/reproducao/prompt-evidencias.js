// @ts-check
// Prompt da 1.2 Evidências (claude -p, só leitura): lê o ticket, os anexos baixados e os quadros dos vídeos (o código já extraiu) e grava
// evidencias-ticket.md. As seções "Massa de dados", "Comportamento relatado" e "Não analisado" são as do Incidentes (infra/reproducao).
const path = require('path');
const { artefatos } = require('../../../../../infra/reproducao');
const { evidenciasDoTicket, PASTA, EVIDENCIAS_MD } = require('./evidencias-ticket');

/**
 * @param {{ dir: string, t: any, contexto: string, gravar: string, quadros: { video: string, arquivos: string[] }[], naoAnalisados: { video: string, motivo: string }[] }} c
 */
function promptEvidencias(c) {
  const ev = evidenciasDoTicket(c.dir),
    rel = (f) => path.relative(c.dir, f);
  return (
    `[segundo plano] [Crafting Table · Implementação ${c.t.chave}] REPRODUÇÃO 1.2 · EVIDÊNCIAS (somente leitura). Ticket ${c.t.link || c.t.chave}${c.t.titulo ? ` · ${c.t.titulo}` : ''}.\n` +
    `Leia ${path.join(c.dir, c.contexto)} (descrição e TODOS os comentários), ${path.join(c.dir, 'dossie.md')} e os anexos baixados em ${path.join(c.dir, PASTA)}: ` +
    `${ev.length ? ev.map((e) => `${e.arquivo}${e.de ? ` (de ${e.de})` : ''}`).join(', ') : 'nenhum'}.\n` +
    `Vídeos: a extensão já tirou os quadros (leia os PNGs com Read e descreva o que o vídeo mostra, na ordem): ` +
    `${c.quadros.length ? c.quadros.map((q) => `${path.basename(q.video)} → ${q.arquivos.map(rel).join(', ')}`).join(' · ') : 'nenhum'}.` +
    `${c.naoAnalisados.length ? ` Vídeos SEM quadros (vão para "Não analisado" com o motivo): ${c.naoAnalisados.map((x) => `${path.basename(x.video)} (${x.motivo})`).join(', ')}.` : ''}\n` +
    `${artefatos.IMAGENS}\n` +
    `Grave ${EVIDENCIAS_MD} com ${c.gravar} ${EVIDENCIAS_MD} <<'FIM' … FIM, com estas seções (o que não constar nas fontes: "não identificado"): ` +
    `${artefatos.MASSA}; ${artefatos.COMPORTAMENTO}; "Fluxo executado" (passo a passo que o usuário fez, na ordem, com a fonte de cada passo: comentário, anexo, quadro); ` +
    `"Esperado × obtido"; "Quando funcionava" (versão, data ou ação que antes dava certo); "Ambiente e plataforma" (produção, homologação/pre-release/hml, coletor Android, navegador, versão do app); ` +
    `"Erros e logs" (mensagens e trechos literais); "Não analisado". ${artefatos.NAO_ANALISADO}\n` +
    `Proibido: alterar código, consultar banco, publicar na ferramenta de tickets. Não pause: o que faltar vai para "Não analisado" ou "não identificado".`
  );
}

module.exports = { promptEvidencias };
