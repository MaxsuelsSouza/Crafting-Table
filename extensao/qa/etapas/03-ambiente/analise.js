// @ts-check
const path = require('path');
const maestro = require('../../../painel/maestro');
const { gravarJson } = require('../../estado');
const { claude } = require('../../orquestrador/claude');
const { AMBIENTE, ambiente } = require('./estado');
const { promptAnalise, FERRAMENTAS_ANALISE } = require('./prompt');

function analisarAmbiente(dir, d) {
  const a = ambiente(dir);
  if (!a?.parou_em || maestro.rodando(dir)) return Promise.resolve();
  gravarJson(path.join(dir, AMBIENTE), { ...a, analise: { analisando: true, em: new Date().toISOString() } });
  return claude(
    dir,
    {
      prompt: promptAnalise(d.chave, dir, a),
      titulo: 'QA · Analisando por que o ambiente parou',
      ferramentas: FERRAMENTAS_ANALISE,
      cwd: d.backend || dir
    },
    d
  ).then(() => {
    const b = ambiente(dir);
    if (b?.analise?.analisando)
      gravarJson(path.join(dir, AMBIENTE), {
        ...b,
        analise: { texto: 'O Claude terminou sem gravar a análise. Veja o log.', em: new Date().toISOString() }
      });
  });
}
function analiseVista(dir) {
  const a = ambiente(dir);
  if (a?.analise?.texto && !a.analise.vista)
    gravarJson(path.join(dir, AMBIENTE), { ...a, analise: { ...a.analise, vista: true } });
}
function gravarAnalise(dir, texto) {
  const a = ambiente(dir);
  if (!a) throw new Error('nenhum preparo de ambiente registrado');
  gravarJson(path.join(dir, AMBIENTE), {
    ...a,
    analise: { texto: String(texto).trim(), em: new Date().toISOString() }
  });
}

module.exports = { analisarAmbiente, analiseVista, gravarAnalise };
