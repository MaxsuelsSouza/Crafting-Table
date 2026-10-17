// @ts-check
// 1.5 · Reproduzir (claude -p): executa o roteiro no ambiente que a 1.4 subiu, com as ferramentas do ambiente (no web, o Playwright MCP).
// A tela é gravada durante toda a sessão em <aba>/evidencias/sessao/ (Android: evidencia.gravar/parar do ambiente; web: o vídeo do MCP);
// a 1.6 anexa o vídeo a cada cenário. O print de cada cenário, a IA tira (comoPrint) e anexa pelo bin.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const fluxo = require('../../../../../componentes/fluxo-passos');
const vagas = require('../../../../../infra/agentes/etapas');
const prompts = require('../../../prompts');
const { ambiente } = require('../../../orquestrador/ambiente');
const reproducao = require('../reproducao/prompt');
const { FERRAMENTAS_REPRO } = require('../regras/ferramentas');
const { claude } = require('../regras/claude');
const { deps } = require('../dependencias');

const SESSAO = path.join('evidencias', 'sessao');

/** amb: o que a 1.4 devolveu ({ nome, pronto, refs }). */
async function reproduzir(s, t, d, amb) {
  const dir = s.pastaAba(t.id),
    a = deps.obter(amb.nome),
    sessao = path.join(dir, SESSAO);
  aoVivo.anotar(dir, { tipo: 'etapa', texto: `Reprodução 1.5 · Reproduzir no ${a.rotulo}` });
  fluxo.descartarEmAndamento(dir); // caiu no meio de um cenário: ele volta para a fila
  const retomada = fluxo.ler(dir).passos.some((p) => p.status !== 'pendente');
  fs.mkdirSync(sessao, { recursive: true });
  a.evidencia.gravar(sessao, { chave: t.chave, serial: amb.pronto?.serial });
  try {
    await claude(s, t, {
      prompt: reproducao.prompt({
        dir,
        t,
        d,
        repos: ambiente(s, t).repos,
        gravar: prompts.GRAVAR,
        retomada,
        a,
        pronto: amb.pronto,
        refs: amb.refs
      }),
      titulo: `Esteira · Reprodução 1.5: reproduzir no ${a.rotulo}`,
      ferramentas: FERRAMENTAS_REPRO(vagas.raiz('impl.mapa') || '', a.ferramentas || []),
      mcp: a.mcp?.(sessao) || null
    });
  } finally {
    a.evidencia.parar();
  }
  fluxo.descartarEmAndamento(dir);
}

module.exports = { reproduzir, SESSAO };
