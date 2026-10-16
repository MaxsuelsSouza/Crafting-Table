// @ts-check
// Etapa 4 concluída → etapa 5 (etapas/05-reproducao atualiza fase/etapa daí em diante).
const aoVivo = require('../../../componentes/ao-vivo');
const controle = require('../../../infra/controle');
const reproducao = require('../etapas/05-reproducao'); // chamada pelo objeto (os testes trocam executar)
const { mudar } = require('../estado');

const reproduzir = async (s, t, rodada) => {
  const dir = s.pastaAba(t.id);
  mudar(dir, { etapa: 5, fase: 'rodando', pausa: null });
  s.render();
  try {
    await reproducao.executar(s, t, { rodada });
  } catch (e) {
    if (!controle.valida(dir, rodada)) return s.render();
    mudar(dir, { fase: 'erro' });
    aoVivo.anotar(dir, { tipo: 'erro', texto: `Etapa 5 falhou: ${e.message}` });
  }
  s.render();
};

module.exports = { reproduzir };
