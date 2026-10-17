// @ts-check
// Sobe o ambiente web pelos Comandos das Configurações: API (5111) e o front (Comando com nome web/front, ou rspack/npm run dev),
// os dois ao mesmo tempo; o que já responde na porta segue. URL do front: craftingTable.webUrl (padrão http://localhost:9009).
// ctx: { webUrl?, comandos, parar?, backend?, portaAberta?, esperar? }. Devolve o ambiente pronto ou { parou_em, erro, falta? }.
const { acharComandos } = require('../aplicacao/comandos');
const { rodarPapel, esperarPapel } = require('../aplicacao/subir-papel');
const { portaDaUrl } = require('../aplicacao/portas');
const { shaDe } = require('../aplicacao/sha');

const URL_PADRAO = 'http://localhost:9009';

async function subir(dir, ctx, vivo) {
  const url = ctx.webUrl || URL_PADRAO,
    porta = portaDaUrl(url);
  const c = acharComandos(ctx, vivo, ['api', 'web']);
  if (!('achou' in c)) return c;
  const { achou } = c,
    terminais = [achou.api.nome, achou.web.nome];
  const okApi = await rodarPapel('api', achou.api, ctx, vivo),
    okWeb = await rodarPapel('web', achou.web, ctx, vivo, { porta });
  const f =
    (await esperarPapel('api', achou.api, ctx, vivo, okApi)) ||
    (await esperarPapel('web', achou.web, ctx, vivo, okWeb, { porta }));
  if (f) return { ...f, fonte: 'comandos', terminais };
  vivo('acao', `Front pronto em ${url}`);
  const backend = achou.api.pasta || ctx.backend,
    web = achou.web.pasta || null;
  return {
    nome: 'web',
    fonte: 'comandos',
    terminais,
    url,
    parou_em: null,
    itens: [],
    backend,
    web,
    sha: { backend: shaDe(backend), web: shaDe(web) }
  };
}

module.exports = { subir, URL_PADRAO };
