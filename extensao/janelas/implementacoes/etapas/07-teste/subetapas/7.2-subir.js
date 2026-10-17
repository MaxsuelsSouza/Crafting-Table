// @ts-check
// 7.2 · Subir a aplicação no ambiente do ticket (infra/ambientes: emulador, aparelho ou web) e conferir a saúde. Idempotente: o que já
// responde segue. Não subiu: devolve o erro (o index grava score 0 e pausa; NUNCA volta para a 5 por causa de ambiente).
const aoVivo = require('../../../../../componentes/ao-vivo');
const { deps } = require('../dependencias');

/** @returns {Promise<{ nome: string, a: any, amb?: any, erro?: string }>} */
async function subirAplicacao(s, t, dir) {
  const { nome, a, ctx } = deps.ambiente(s, t, dir),
    vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  vivo('acao', `Subindo a aplicação (${a.rotulo})`);
  const falta = a.requisitos(ctx);
  if (falta.length) return { nome, a, erro: falta.join('; ') };
  const amb = await a.subir(dir, ctx, vivo);
  if (amb.parou_em) return { nome, a, erro: amb.erro || `parou em ${amb.parou_em}` };
  const sd = await a.saude(amb);
  if (!sd.ok) return { nome, a, erro: sd.motivo || 'a saúde da aplicação falhou' };
  vivo('acao', `Aplicação de pé: ${a.texto(amb)}`);
  return { nome, a, amb };
}

module.exports = { subirAplicacao };
