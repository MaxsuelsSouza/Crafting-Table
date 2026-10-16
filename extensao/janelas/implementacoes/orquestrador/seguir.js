// @ts-check
// Iniciar, continuar e retomar a esteira da etapa em que parou (1 dossiê, 6 verificação, as outras com IA).
const maestro = require('../../../infra/agentes/maestro');
const controle = require('../../../infra/controle');
const aoVivo = require('../../../componentes/ao-vivo');
const { filhos } = require('../dependencias');
const { estado, mudar, situacao, existe } = require('../estado');
const { passoDossie } = require('../etapas/01-dossie');
const { verificar } = require('../etapas/06-verificacao');
const { rodarEtapa } = require('./rodar-etapa');
const { avancar } = require('./avancar');

const seguir = async (s, t) => {
  const dir = s.pastaAba(t.id),
    e = estado(dir);
  if (maestro.rodando(dir) || filhos.has(dir) || e.fase === 'aguardando') return; // aguardando: a saída é Aprovar ou Pedir ajuste no card
  if (e.fase === 'concluido') return;
  if (
    e.fase === 'rodando' &&
    !situacao(dir).rodando &&
    e.etapa >= 2 &&
    e.etapa !== 5 &&
    e.etapa !== 6 &&
    existe(dir, e.etapa)
  )
    return avancar(s, t, e.etapa, controle.nova(dir)); // interrompida depois de gravar
  const rodada = controle.nova(dir);
  try {
    if (e.etapa <= 1) return await passoDossie(s, t, rodada);
    if (e.etapa === 6) return await verificar(s, t, rodada);
    return await rodarEtapa(s, t, e.etapa, rodada);
  } catch (x) {
    if (!controle.valida(dir, rodada)) return s.render();
    mudar(dir, { fase: 'erro' });
    aoVivo.anotar(dir, { tipo: 'erro', texto: `Esteira falhou na etapa ${estado(dir).etapa}: ${x.message}` });
    s.render();
  }
};
const retomar = (s, t) => {
  mudar(s.pastaAba(t.id), { pausa: null });
  return seguir(s, t);
};

module.exports = { seguir, retomar };
