// @ts-check
// API e Metro pelos Comandos (comum a emulador e aparelho): um por vez, o que já responde segue. Metro de pé = /status responde
// packager-status:running (porta aberta sozinha não prova). null = prontos; senão { parou_em, erro }.
// ctx.metroStatus: os testes trocam a ida ao Metro.
const { PAPEIS } = require('../aplicacao/papeis');
const { subirPapel, portaDe } = require('../aplicacao/subir-papel');

const metroStatus = async () => {
  try {
    return (await (await fetch(`http://127.0.0.1:${PAPEIS.metro.porta}/status`)).text()).includes(
      'packager-status:running'
    );
  } catch {
    return false;
  }
};

async function subirApiMetro(achou, ctx, vivo) {
  const f = await subirPapel('api', achou.api, ctx, vivo);
  if (f) return f;
  return subirPapel('metro', achou.metro, ctx, vivo, {
    pronto: async () => (await portaDe(ctx)(PAPEIS.metro.porta)) && (await (ctx.metroStatus || metroStatus)())
  });
}

module.exports = { subirApiMetro, metroStatus };
