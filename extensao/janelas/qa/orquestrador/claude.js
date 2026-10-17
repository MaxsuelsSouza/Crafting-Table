// @ts-check
const path = require('path');
const maestro = require('../../../infra/agentes/maestro');
const ambientes = require('../../../infra/ambientes');
const aoVivo = require('../../../componentes/ao-vivo');
const { argsEnxutos } = require('../../../infra/agentes/enxuto');
const { FERRAMENTAS_EXEC, PROIBIDAS } = require('./ferramentas');
const { bancoDaSessao } = require('./banco');

// Claude em segundo plano até terminar (maestro.rodar), com o contexto enxuto (infra/agentes/enxuto.js: sem MCP (fora o do SQLcl com opts.banco), skills e plugins; só as ferramentas da etapa;
// modelo e esforço do QA: d.modelo/d.esforco, ou opts.modelo/opts.esforco por etapa). d.extras/d.aoMudar vêm do painel. Resolve { estourou, erro } (limite de tempo: d.timeoutMin; erro: is_error/saída com código do Claude, ex.: limite de tokens ou API fora).
const claude = (dir, opts, d) =>
  new Promise((ok) => {
    let estourou = false,
      timer = null;
    const fim = () => {
      clearTimeout(timer);
      ok({ estourou, erro: maestro.erroDe?.(dir) || null });
    };
    const { modelo = d.modelo, esforco = d.esforco, banco, ...resto } = opts,
      bk = banco ? bancoDaSessao(dir, d) : null, // opts.banco: a sessão consulta o banco (MCP do SQLcl ou, autorizado, o mapa-db)
      // ambiente com servidor MCP (web: Playwright MCP gravando vídeo e prints em evidencias/ia): vai junto com o do SQLcl
      amb = ambientes.obter(d.ambiente),
      mcpAmb = amb.mcp?.(path.join(dir, 'evidencias', 'ia')) || null,
      ferramentas = [
        ...(opts.ferramentas || FERRAMENTAS_EXEC),
        ...(bk?.ferramentas || []),
        ...(mcpAmb ? amb.ferramentas : [])
      ];
    const foi = maestro.rodar(dir, {
      ...resto,
      proibidas: [...PROIBIDAS, ...(bk?.proibidas || [])],
      ferramentas,
      mcp: mcpAmb,
      env: { QA_DIR: dir, ...(bk?.env || {}), ...(opts.env || {}) },
      extras: [
        ...argsEnxutos(ferramentas, { modelo, esforco, hooks: bk?.hooks || undefined }),
        ...(bk?.extras || []),
        ...(d.extras || []),
        ...(opts.extras || [])
      ],
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
