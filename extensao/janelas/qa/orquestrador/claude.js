// @ts-check
const maestro = require('../../../infra/agentes/maestro');
const aoVivo = require('../../../componentes/ao-vivo');
const { argsEnxutos } = require('../../../infra/agentes/enxuto');
const { FERRAMENTAS_EXEC, PROIBIDAS } = require('./ferramentas');

// Claude em segundo plano até terminar (maestro.rodar), com o contexto enxuto (infra/agentes/enxuto.js: sem MCP, skills e plugins; só as ferramentas da etapa;
// modelo e esforço do QA: d.modelo/d.esforco, ou opts.modelo/opts.esforco por etapa). d.extras/d.aoMudar vêm do painel. Resolve { estourou, erro } (limite de tempo: d.timeoutMin; erro: is_error/saída com código do Claude, ex.: limite de tokens ou API fora).
const claude = (dir, opts, d) =>
  new Promise((ok) => {
    let estourou = false,
      timer = null;
    const fim = () => {
      clearTimeout(timer);
      ok({ estourou, erro: maestro.erroDe?.(dir) || null });
    };
    const { modelo = d.modelo, esforco = d.esforco, ...resto } = opts,
      ferramentas = opts.ferramentas || FERRAMENTAS_EXEC;
    const foi = maestro.rodar(dir, {
      proibidas: PROIBIDAS,
      ...resto,
      ferramentas,
      env: { QA_DIR: dir, ...(opts.env || {}) },
      extras: [...argsEnxutos(ferramentas, { modelo, esforco }), ...(d.extras || []), ...(opts.extras || [])],
      aoMudar: () => {
        d.aoMudar?.();
        if (!maestro.rodando(dir)) fim();
      }
    });
    if (!foi) return fim();
    if (d.timeoutMin > 0)
      timer = setTimeout(() => {
        estourou = true;
        aoVivo.anotar(dir, { tipo: 'aviso', texto: `Passou de ${d.timeoutMin} min: parando o Claude` });
        maestro.parar(dir);
      }, d.timeoutMin * 60000);
  });

module.exports = { claude };
