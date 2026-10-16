// @ts-check
// Iniciar/Continuar/Retomar: da etapa guardada em diante.
const maestro = require('../../painel/maestro');
const controle = require('../../infra/controle');
const { estado, mudar, situacao, existe } = require('../estado');

const seguir = (s, t) => {
  const dir = s.pastaAba(t.id),
    e = estado(dir);
  if (maestro.rodando(dir) || e.fase === 'aguardando') return; // aguardando: a saída é Aprovar ou Pedir ajuste no card
  if (e.etapa <= 4 && e.fase === 'rodando' && !situacao(dir).rodando && existe(dir, e.etapa))
    return require('./avancar').avancarEtapa(s, t, e.etapa); // interrompida depois de gravar o documento
  const rodada = controle.nova(dir);
  return e.etapa >= 5
    ? require('./reproduzir').reproduzir(s, t, rodada)
    : require('./rodar-etapa').rodarEtapa(s, t, e.etapa, rodada);
};

// ▶ depois de uma pausa: limpa a pausa e segue da etapa em que parou.
const retomar = (s, t) => {
  mudar(s.pastaAba(t.id), { pausa: null });
  return seguir(s, t);
};

module.exports = { seguir, retomar };
