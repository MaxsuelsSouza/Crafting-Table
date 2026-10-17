// @ts-check
// Flow padrão de início: todo teste começa na mesma tela (aba Conhecimentos → Tela de início).
//   inicio.yaml         abre o app do zero, login, filial, para na tela de início (1º cenário ou quando o voltar falha)
//   voltar-inicio.yaml  volta à tela de início já logado (entre um cenário e outro, sem novo login)
// A IA escreve uma vez por ambiente Android (prompt.js), a extensão roda no aparelho (validar.js) e grava nos Conhecimentos (<ambiente>:inicio). Falhou: a IA corrige na
// mesma conversa (--resume), até 3 tentativas; sem jeito, o QA segue com o login dentro de cada roteiro (como antes).
//   prepararInicio  o que a jornada roda antes das etapas de cada cenário
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const { estado, mudar } = require('../../../estado');
const { claude } = require('../../../orquestrador/claude');
const { lerSid } = require('../../../orquestrador/sid');
const { pausado } = require('../../../orquestrador/rodando');
const { absorverPausa } = require('../../../orquestrador/pausa');
const k = require('../../../conhecimentos');
const ambientes = require('../../../../../infra/ambientes');
const { jornada } = require('../dependencias');
const { promptInicio, promptCorrigirInicio } = require('./prompt');
const { validarInicio } = require('./validar');

const TENTATIVAS = 3;
// Conhecimentos por ambiente: <ambiente>:inicio e <ambiente>:voltar-inicio (a chave antiga, sem prefixo, era do emulador: conhecimentos/arquivo.js migra).
const prontos = (nome = 'emulador') => {
  const i = k.flow(`${nome}:inicio`),
    v = k.flow(`${nome}:voltar-inicio`);
  return i?.arquivo && v?.arquivo && fs.existsSync(i.arquivo) && fs.existsSync(v.arquivo)
    ? { inicio: i.arquivo, voltar: v.arquivo }
    : null;
};

// Devolve { ok } (flows prontos) | { ok: false } (segue sem eles) | { parou: true } (pausa ou erro da API).
async function garantirInicio(dir, d, amb) {
  const a = ambientes.obter(amb?.nome || d.ambiente);
  if (a.plataforma !== 'android') return { ok: false }; // flows de início são do Maestro: no web cada spec começa do zero
  if (prontos(a.nome)) return { ok: true };
  const vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto }),
    deps = d.jornada || jornada(d, amb);
  vivo('etapa', 'QA · Flow de início (escrito uma vez, vale para todos os tickets)');
  let sid = null,
    erro = '';
  try {
    for (let n = 0; n < TENTATIVAS; n++) {
      mudar(dir, { etapa: 'inicio', inicioCandidato: null });
      const r = await claude(
        dir,
        {
          prompt: sid ? promptCorrigirInicio(erro) : promptInicio(d.chave, amb, dir, k.ler().telaInicio),
          titulo: sid ? 'QA · Corrigindo o flow de início' : 'QA · Escrevendo o flow de início',
          cwd: amb.mobile || amb.backend || d.backend,
          ...(sid ? { sessao: sid } : {})
        },
        d
      );
      if (r.erro || absorverPausa(dir) || pausado(dir)) return { parou: true };
      sid = lerSid(dir) || sid;
      const cand = estado(dir).inicioCandidato;
      if (!cand) erro = 'você terminou sem registrar os flows (qa-state inicio <inicio.yaml> <voltar-inicio.yaml>)';
      else {
        vivo('acao', `Rodando os flows de início no ${a.rotulo}`);
        const v = await validarInicio(cand, deps, path.join(dir, 'inicio-validacao'));
        if (v.ok) {
          const fonte = `validado no ${a.rotulo} no ${d.chave} (${new Date().toISOString().slice(0, 10)})`;
          k.adicionar({
            tipo: 'flow',
            chave: `${a.nome}:inicio`,
            titulo: `Login até a tela de início (${k.ler().telaInicio || 'menu'})`,
            arquivo: cand.inicio,
            fonte
          });
          k.adicionar({
            tipo: 'flow',
            chave: `${a.nome}:voltar-inicio`,
            titulo: 'Volta à tela de início sem login',
            arquivo: cand.voltar,
            fonte
          });
          vivo('fim', 'Flows de início validados e gravados na aba Conhecimentos: todo teste começa por eles');
          return { ok: true };
        }
        erro = v.erro || 'falhou';
      }
      vivo(
        'aviso',
        `Flow de início: ${erro.split('\n')[0].slice(0, 200)}${n + 1 < TENTATIVAS ? ': pedindo correção' : ''}`
      );
    }
  } finally {
    mudar(dir, { etapa: null });
  }
  vivo(
    'aviso',
    `Flow de início não validou em ${TENTATIVAS} tentativas: os roteiros fazem o próprio login (mais lento)`
  );
  return { ok: false };
}

/** Flows que a jornada roda antes das etapas do cenário: voltar-inicio e, se ele falhar, o inicio. null = sem flows de início. */
const prepararInicio = (nome) => {
  const a = ambientes.obter(nome);
  return a.plataforma === 'android' ? prontos(a.nome) : null;
};

module.exports = { garantirInicio, prepararInicio };
