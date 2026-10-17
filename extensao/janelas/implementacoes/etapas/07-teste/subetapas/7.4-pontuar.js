// @ts-check
// 7.4 · Score (código): junta o plano (criticidade e tipo de cada CT), o fluxo (resultado, evidências e sinais da última execução) e a
// tabela CA × CT, calcula o score (regras/score.js) contra o mínimo (regras/minimo.js) e grava teste.json:
// { score, minimo, entregavel, tetos[], motivos[], cts[], cobertura, minimoDetalhe, ambiente, tentativa, erroAmbiente?, em }.
const fs = require('fs');
const path = require('path');
const fluxo = require('../../../../../componentes/fluxo-passos');
const { nivelCenario } = require('../../../../../infra/testes');
const { dirTeste, lerPlano, gravarResultado } = require('../arquivos');
const { ctsDo } = require('../regras/plano');
const { casDo, cobertura } = require('../regras/cobertura');
const { score } = require('../regras/score');

const IMG = /\.(png|jpe?g|webp)$/i,
  VID = /\.(mp4|webm|mov)$/i;
// Vídeos da sessão inteira (Android: teste/video; web: o recordVideo do MCP em teste/capturas), com a hora em que terminaram.
const videosSessao = (dt) =>
  ['video', 'capturas'].flatMap((p) => {
    try {
      return fs
        .readdirSync(path.join(dt, p))
        .filter((n) => VID.test(n))
        .map((n) => fs.statSync(path.join(dt, p, n)).mtimeMs);
    } catch {
      return [];
    }
  });

/** @param {{ subiu: boolean, min: any, ambiente: string, tentativa: number, erroAmbiente?: string }} o */
function pontuar(dir, { subiu, min, ambiente, tentativa, erroAmbiente }) {
  const dt = dirTeste(dir),
    md = lerPlano(dir),
    meta = new Map(ctsDo(md).map((c) => [c.id, c])),
    sessao = videosSessao(dt);
  // ponytail: o vídeo da sessão vale para todo CT executado antes de ele fechar; vídeo por CT no Android exige gravar por CT
  const cts = fluxo.ler(dt).passos.map((p) => {
    const ex = p.execucoes.at(-1),
      arqs = ex ? fluxo.arquivosDe(dt, ex) : [];
    return {
      id: p.id,
      titulo: p.titulo,
      criticidade: meta.get(p.id)?.criticidade || 'normal',
      tipo: meta.get(p.id)?.tipo || 'aceite',
      nivel: nivelCenario({ status: p.status, execucoes: ex ? [ex] : [] }),
      print: arqs.some((f) => IMG.test(f)),
      video: arqs.some((f) => VID.test(f)) || (!!ex && sessao.some((m) => m >= Date.parse(ex.inicio))),
      sinais: ex?.sinais || null,
      nota: ex?.nota || '',
      evidencias: arqs.map((f) => path.relative(dir, f))
    };
  });
  const cob = cobertura(casDo(md), cts),
    r = score({ subiu, cts, cobertura: cob });
  const res = {
    score: r.score,
    minimo: min.minimo,
    entregavel: r.score >= min.minimo,
    tetos: r.tetos,
    motivos: r.tetos.map((x) => `até ${x.nota}: ${x.motivo}`),
    cts,
    cobertura: cob,
    minimoDetalhe: { base: min.base, ajustes: min.ajustes, exigeRegressao: min.exigeRegressao },
    ambiente,
    tentativa,
    ...(erroAmbiente ? { erroAmbiente } : {})
  };
  gravarResultado(dir, res);
  return res;
}

module.exports = { pontuar };
