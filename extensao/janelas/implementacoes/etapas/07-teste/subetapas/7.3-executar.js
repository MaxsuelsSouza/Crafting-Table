// @ts-check
// 7.3 · Executar os CTs (claude -p): a IA dirige a aplicação CT a CT e registra pelo reproducao-fluxo (iniciar, evidencia, sinais, acao,
// concluir) em teste/fluxo.json. Prova de cada CT: print + vídeo. No Android a extensão grava a tela durante toda a execução
// (teste/video/); no web o Playwright MCP grava a sessão em teste/capturas/ e a IA grava um vídeo por CT. Na retomada só os pendentes.
const path = require('path');
const fluxo = require('../../../../../componentes/fluxo-passos');
const controle = require('../../../../../infra/controle');
const vagas = require('../../../../../infra/agentes/etapas');
const { pausar } = require('../../../estado');
const { ambiente } = require('../../../orquestrador/ambiente');
const { dirTeste } = require('../arquivos');
const { deps } = require('../dependencias');
const { rodarClaude } = require('../claude');
const { promptExecutar } = require('../prompt');
const { FERRAMENTAS_EXECUTAR } = require('../regras/ferramentas');

/** @returns {Promise<boolean>} true = terminou (segue para o score); false = pausou ou foi interrompida */
async function executar(s, t, dir, rodada, { a, amb }) {
  const dt = dirTeste(dir);
  fluxo.descartarEmAndamento(dt);
  if (!fluxo.ler(dt).passos.some((p) => p.status === 'pendente')) return true;
  deps.gravarTela(a, path.join(dt, 'video'), amb, t.chave);
  const p = await rodarClaude(s, t, dir, {
    prompt: promptExecutar({ dir, t, repos: ambiente(s, t).repos, a, amb }),
    titulo: 'Esteira · Etapa 7.3: Teste na aplicação (executar os CTs)',
    ferramentas: FERRAMENTAS_EXECUTAR(vagas.raiz('impl.mapa') || '', a),
    mcp: a.mcp?.(path.join(dt, 'capturas')) || null
  });
  deps.pararTela(a);
  if (a.plataforma !== 'web') await deps.esperarVideo(path.join(dt, 'video'));
  if (!controle.valida(dir, rodada)) return false;
  fluxo.descartarEmAndamento(dt); // caiu no meio de um CT: ele volta para a fila
  if (p) {
    pausar(dir, 7, { motivo: 'teste-ia', pergunta: String(p.pergunta), opcoes: (p.opcoes || []).map(String) });
    return false;
  }
  return true;
}

module.exports = { executar };
