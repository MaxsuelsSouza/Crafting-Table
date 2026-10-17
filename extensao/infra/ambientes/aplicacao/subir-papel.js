// @ts-check
// Sobe um papel da aplicação pelo Comando das Configurações: o que já responde não roda de novo (idempotente); espera ficar pronto.
// Usado por: infra/ambientes/{emulador,aparelho,web}/subir.js.
// ctx: { comandos: { rodar(nome) }, portaAberta?, esperar?(teste, s), parar?() } (os testes trocam portaAberta e esperar).
const { PAPEIS } = require('./papeis');
const { portaAberta, esperar } = require('./portas');

const portaDe = (ctx) => ctx.portaAberta || portaAberta;
const esperaDe = (ctx) => ctx.esperar || ((teste, s) => esperar(teste, s, ctx.parar || (() => false)));

/** Roda o Comando se o papel ainda não está de pé. pronto: padrão = a porta do papel responde. */
async function rodarPapel(k, botao, ctx, vivo, { porta = PAPEIS[k].porta, pronto } = {}) {
  const p = PAPEIS[k],
    ok = pronto || (() => portaDe(ctx)(porta));
  if (await ok()) vivo('acao', `${p.nome} já responde${porta ? ` na porta ${porta}` : ''}`);
  else {
    vivo('acao', `Rodando “${botao.nome}”${botao.comando ? ` (${botao.comando})` : ''}`);
    ctx.comandos.rodar(botao.nome);
  }
  return ok;
}

/** Espera o papel ficar pronto. null = pronto; senão { parou_em, erro }. */
async function esperarPapel(k, botao, ctx, vivo, ok, { porta = PAPEIS[k].porta } = {}) {
  const p = PAPEIS[k];
  if (await esperaDe(ctx)(ok, p.espera)) {
    vivo('acao', `${p.nome} pronto${porta ? ` na porta ${porta}` : ''}`);
    return null;
  }
  const erro = `${p.nome} não ficou pronto${porta ? ` na porta ${porta}` : ''} em ${p.espera}s (veja o terminal “${botao.nome}”)`;
  if (!ctx.parar?.()) vivo('erro', erro);
  return { parou_em: k, erro };
}

/** Roda e espera (um papel por vez). null = pronto; senão { parou_em, erro }. */
async function subirPapel(k, botao, ctx, vivo, o = {}) {
  const ok = await rodarPapel(k, botao, ctx, vivo, o);
  return esperarPapel(k, botao, ctx, vivo, ok, o);
}

module.exports = { subirPapel, rodarPapel, esperarPapel, portaDe, esperaDe };
