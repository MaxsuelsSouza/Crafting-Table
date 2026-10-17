// @ts-check
// 1.6 · Veredito (código, sem IA): anexa o vídeo da sessão aos cenários, devolve os repositórios ao HEAD de antes e decide pelo fluxo.json
// (infra/reproducao/veredito.js). Grava veredito, ref, commit e ambiente no reproducao.md e em .esteira.json (repro).
//   REPRODUZIDO      → etapa 2
//   SEM_EVIDENCIA    → pausa repro-evidencia: Tentar de novo · Seguir sem confirmar
//   NAO_REPRODUZIDO  → pausa repro-nao: Tentar de novo · Pedir mais dados no Jira · Seguir sem confirmar · Encerrar
//   INCONCLUSIVO     → pausa repro-inconclusivo (com o motivo): Tentar de novo · Pedir mais dados no Jira · Seguir sem confirmar
// Pausa pedida pela IA na 1.5: vira a pausa da esteira (a resposta vai para .respostas.md e a reprodução retoma).
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const fluxo = require('../../../../../componentes/fluxo-passos');
const { veredito, VEREDITOS, ROTULO } = require('../../../../../infra/reproducao');
const { SEM_CONFIRMAR, TENTAR, estado, mudar, pausar } = require('../../../estado');
const { lerPausa, limparPausa } = require('../../../orquestrador/pausa');
const { rodarEtapa } = require('../../../orquestrador/rodar-etapa');
const { provas, gravarResumo } = require('../reproducao/resultado');
const { anexarVideo } = require('../regras/video-cenarios');
const { restaurar } = require('../regras/head');
const { PEDIR, ENCERRAR } = require('../regras/responder');
const { SESSAO } = require('./1.5-reproduzir');
const { deps } = require('../dependencias');

/** c: { roteiro: { motivo }, amb: { motivo, nome? }, midia: string[] } */
async function concluir(s, t, d, rodada, c) {
  const dir = s.pastaAba(t.id),
    sessao = path.join(dir, SESSAO);
  aoVivo.anotar(dir, { tipo: 'etapa', texto: 'Reprodução 1.6 · Veredito' });
  if (c.amb.nome && !c.amb.motivo) {
    await deps.esperarVideo(sessao);
    const n = anexarVideo(dir, sessao);
    if (n) aoVivo.anotar(dir, { tipo: 'acao', texto: `Vídeo da sessão anexado a ${n} cenário(s)` });
  }
  restaurar(dir);
  const p = lerPausa(dir);
  if (p?.pergunta) {
    limparPausa(dir);
    pausar(dir, 1, {
      motivo: String(p.motivo || ''),
      pergunta: String(p.pergunta),
      opcoes: (p.opcoes || []).map(String)
    });
    return s.render();
  }
  const passos = fluxo.ler(dir).passos.map((x) => ({ id: x.id, status: x.status, ...provas(dir, x) }));
  const v = veredito({ passos, roteiro: c.roteiro.motivo, ambiente: c.amb.motivo, midia: c.midia });
  const repro = { ...(estado(dir).repro || {}), veredito: v.veredito, motivo: v.motivo };
  mudar(dir, { repro });
  gravarResumo(dir, t.chave, '', repro);
  aoVivo.anotar(dir, {
    tipo: v.veredito === VEREDITOS.REPRODUZIDO ? 'fim' : 'aviso',
    texto: `Veredito: ${ROTULO[v.veredito]} · ${v.motivo}`
  });
  if (v.veredito === VEREDITOS.REPRODUZIDO) {
    mudar(dir, {
      reproducao: 'ok',
      etapa: 2,
      fase: 'parado',
      pausa: null,
      modo: d.modo,
      tentativas: 0,
      correcao: false
    });
    return rodarEtapa(s, t, 2, rodada);
  }
  const PAUSAS = {
    [VEREDITOS.SEM_EVIDENCIA]: {
      motivo: 'repro-evidencia',
      pergunta: `O erro foi confirmado, mas ${v.semEvidencia.join(', ')} falhou sem print e vídeo anexados. A evidência é obrigatória.`,
      opcoes: [TENTAR, SEM_CONFIRMAR]
    },
    [VEREDITOS.NAO_REPRODUZIDO]: {
      motivo: 'repro-nao',
      pergunta: `O erro NÃO foi reproduzido: ${v.motivo} (veja a aba Reprodução). O que fazer?`,
      opcoes: [TENTAR, PEDIR, SEM_CONFIRMAR, ENCERRAR]
    },
    [VEREDITOS.INCONCLUSIVO]: {
      motivo: 'repro-inconclusivo',
      pergunta: `Reprodução inconclusiva: ${v.motivo}. Responda com o que falta (vira resposta para o roteiro) ou escolha:`,
      opcoes: [TENTAR, PEDIR, SEM_CONFIRMAR]
    }
  };
  pausar(dir, 1, PAUSAS[v.veredito]);
  s.render();
}

module.exports = { concluir };
