// @ts-check
// Iniciar, continuar e retomar a esteira da etapa em que parou (0 subtarefas, 1 dossiê, 6 verificação, 7 teste na aplicação, as outras com IA).
// Ticket com subtarefas (estado.subtarefas 'sim'): o pai segue por orquestrador/grupos/seguir-pai.js; cada grupo passa por aqui com t.grupo.
const maestro = require('../../../infra/agentes/maestro');
const controle = require('../../../infra/controle');
const aoVivo = require('../../../componentes/ao-vivo');
const { filhos } = require('../dependencias');
const { estado, mudar, situacao, existe } = require('../estado');
const { passoDossie } = require('../etapas/01-dossie');
const { passoSubtarefas } = require('../etapas/00-subtarefas');
const { verificar } = require('../etapas/06-verificacao');
const { rodarEtapa } = require('./rodar-etapa');
const { avancar, proxima } = require('./avancar');

const seguir = async (s, t) => {
  const dir = s.pastaAba(t.id),
    e = estado(dir);
  if (!t.grupo && (e.subtarefas === 'sim' || e.etapa === 0)) return require('./grupos').seguirPai(s, t); // ticket com subtarefas
  if (maestro.rodando(dir) || filhos.has(dir) || e.fase === 'aguardando') return; // aguardando: a saída é Aprovar ou Pedir ajuste no card
  if (e.fase === 'concluido') return;
  if (
    e.fase === 'rodando' &&
    !situacao(dir).rodando &&
    e.etapa >= 2 &&
    e.etapa !== 5 &&
    e.etapa !== 6 &&
    e.etapa !== 7 &&
    existe(dir, e.etapa)
  )
    return avancar(s, t, e.etapa, controle.nova(dir)); // interrompida depois de gravar
  const rodada = controle.nova(dir);
  try {
    if (e.etapa <= 1) return await (t.grupo ? passoDossie(s, t, rodada) : passoSubtarefas(s, t, rodada)); // etapa 0 decide se há subtarefas
    if (e.etapa === 6) return await verificar(s, t, rodada);
    if (e.etapa === 7) return await proxima(s, t, 6, rodada); // a 7 recomeça pelo testar (o fluxo dos CTs continua de onde parou)
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
