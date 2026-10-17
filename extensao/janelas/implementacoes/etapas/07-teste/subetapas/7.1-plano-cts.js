// @ts-check
// 7.1 · Plano de CTs: reaproveita o plano local do QA (<ticket>/qa/qa-plano.md) quando ele já serve; senão um claude -p monta pelo
// METODO_ENTREGA (com o do QA como base, se existir) e grava teste/plano-cts.md. A extensão valida (regras/plano.js): sem CT crítico,
// sem tabela CA × CT ou diff grande sem regressão → pausa. Serviu: cria o fluxo dos CTs (teste/fluxo.json, ids CT01…). Na retomada,
// com o fluxo já criado, não refaz nada.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../../componentes/ao-vivo');
const fluxo = require('../../../../../componentes/fluxo-passos');
const controle = require('../../../../../infra/controle');
const vagas = require('../../../../../infra/agentes/etapas');
const { estado, mudar, pausar } = require('../../../estado');
const { ambiente } = require('../../../orquestrador/ambiente');
const { PLANO, dirTeste, lerPlano } = require('../arquivos');
const { deps } = require('../dependencias');
const { rodarClaude } = require('../claude');
const { promptPlano } = require('../prompt');
const { ctsDo, errosDoPlano } = require('../regras/plano');
const { FERRAMENTAS_PLANO } = require('../regras/ferramentas');
const { REFAZER_PLANO, ABAIXO } = require('../opcoes');

// Fontes do que mudou: no ticket simples os artefatos da aba; no pai com subtarefas, os de cada grupo.
const fontes = (dir) => {
  const { gruposDe } = require('../../../estado');
  return [dir, ...gruposDe(dir)]
    .flatMap((d) => ['plano-mudanca.md', 'implementacao.log.md'].map((n) => path.join(d, n)))
    .filter((f) => fs.existsSync(f));
};

/** @returns {Promise<any[]|null>} os CTs (null = pausou ou foi interrompida) */
async function planoCts(s, t, dir, rodada, min) {
  const dt = dirTeste(dir);
  if (fluxo.ler(dt).passos.length && lerPlano(dir)) return ctsDo(lerPlano(dir)); // retomada: o fluxo já existe
  const ajuste = estado(dir).testeAjuste || '',
    qa = deps.qaPlano(t.chave),
    regra = { exigeRegressao: min.exigeRegressao };
  fs.mkdirSync(dt, { recursive: true });
  const md = qa && !ajuste ? fs.readFileSync(qa, 'utf8') : '';
  if (md && !errosDoPlano(md, regra).length) {
    fs.writeFileSync(path.join(dir, PLANO), md);
    aoVivo.anotar(dir, { tipo: 'fala', texto: `Plano de CTs: o do QA (${qa}) já serve` });
  } else {
    fs.rmSync(path.join(dir, PLANO), { force: true });
    const p = await rodarClaude(s, t, dir, {
      prompt: promptPlano({
        dir,
        t,
        repos: ambiente(s, t).repos,
        fontes: fontes(dir),
        qa,
        exigeRegressao: min.exigeRegressao,
        ajuste
      }),
      titulo: 'Esteira · Etapa 7.1: Teste na aplicação (plano de CTs)',
      ferramentas: FERRAMENTAS_PLANO(vagas.raiz('impl.mapa') || '')
    });
    if (!controle.valida(dir, rodada)) return null;
    if (p) {
      pausar(dir, 7, { motivo: 'teste-ia', pergunta: String(p.pergunta), opcoes: (p.opcoes || []).map(String) });
      return null;
    }
  }
  const final = lerPlano(dir),
    erros = errosDoPlano(final, regra);
  if (erros.length) {
    pausar(dir, 7, {
      motivo: 'teste',
      pergunta: `O plano de CTs (${PLANO}) não serve para o teste na aplicação: ${erros.join('; ')}. Gere de novo, escreva abaixo o que ajustar ou siga sem testar (abaixo do mínimo).`,
      opcoes: [REFAZER_PLANO, ABAIXO]
    });
    return null;
  }
  const cts = ctsDo(final);
  fluxo.plano(
    dt,
    cts.map((c) => ({ id: c.id, titulo: c.titulo, texto: c.resumo || c.texto.slice(0, 600) }))
  );
  mudar(dir, { testeAjuste: undefined });
  aoVivo.anotar(dir, {
    tipo: 'fala',
    texto: `Plano de CTs: ${cts.length} CT(s), ${cts.filter((c) => c.criticidade === 'critica').length} crítico(s), ${cts.filter((c) => c.tipo === 'regressao').length} de regressão`
  });
  return cts;
}

module.exports = { planoCts, fontes };
