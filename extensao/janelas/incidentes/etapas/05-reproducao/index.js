// @ts-check
// Etapa 5 · Ambiente e reprodução. Grava reproducao.json e, ao terminar, chama o fecho da etapa 6 (06-evidencias.js).
// Contrato: janelas/incidentes/CONTRATO.md. Prova preservada: só INSERT em linhas novas (Massa de Teste); a trava recusa DML que cite chave da Massa Real.
//
// Estrutura desta pasta:
//   index.js                  executar (5.1 → 5.2 → 5.3 → 5.4 → fecho da 6) e responder (Aceitar como não reproduzido)
//   dependencias.js           dependências reais: VS Code, emulador, comandos, banco (SQLcl), claude, gravação de tela
//   subetapas/estado.js       SUBETAPAS, artefato de cada uma, estado em .mergulho.json (sub), exigir e pausar
//   subetapas/5.1-plano.js    planejar o fluxo (fluxo.json)
//   subetapas/5.2-massa.js    massa de teste: prompt, aprovação (hash) e execução no banco
//   subetapas/5.3-ambiente.js subir emulador, API, Metro e app
//   subetapas/5.4-reproduzir.js reproduzir no emulador e gravar reproducao.json
//   regras/trava-dml.js       trava de prova (chaves da Massa Real)
//   regras/ferramentas.js     ferramentas do claude -p, regras do prompt e a skill
const aoVivo = require('../../../../componentes/ao-vivo');
const controle = require('../../../../infra/controle');
const { mesclar: mudar } = require('../../estado');
const evidencias = require('../06-evidencias');
const { depsPadrao } = require('./dependencias');
const { FERRAMENTAS } = require('./regras/ferramentas');
const { travaDml, chavesReais } = require('./regras/trava-dml');
const { SUBETAPAS, ARTEFATO, marcarSub, estadoSubs, proximaSub, exigir } = require('./subetapas/estado');
const plano = require('./subetapas/5.1-plano');
const massa = require('./subetapas/5.2-massa');
const ambiente = require('./subetapas/5.3-ambiente');
const reproduzir = require('./subetapas/5.4-reproduzir');

const { ACEITAR, aceitarSemResultado } = reproduzir;

// Resposta à pausa da 5.4 sem resultado: "Aceitar como não reproduzido" fecha a 5.4 e o Mergulho segue para o resumo (protocolo em orquestrador/responder.js).
const responder = ({ dir, resposta }) => {
  if (resposta !== ACEITAR) return undefined;
  aceitarSemResultado(dir);
  aoVivo.anotar(dir, { tipo: 'aviso', texto: 'Reprodução aceita como não reproduzida (sem resultado do Claude)' });
  mudar(dir, { pausa: null });
  return 'seguir';
};

// d: dependências injetáveis (testes). Etapa 5 + resumo; fecha com etapa 6/concluido ou pausa/erro.
async function executar(s, t, d = {}) {
  const dir = s.pastaAba(t.id),
    vivo = (tipo, texto) => aoVivo.anotar(dir, { tipo, texto });
  d = { ...(d.semPadrao ? {} : depsPadrao(s, t, dir)), ...d };
  // Pausar (⏸): a rodada deixa de valer; confere entre os passos e dentro das esperas, e para sem marcar erro.
  /** @type {any} */ let atualSub = null; // subetapa em andamento (vira "erro" se a execução cair)
  const ponto = () => {
    if (!controle.valida(dir, d.rodada)) throw new Error(controle.CANCELADO);
  };
  const esperarOrig = d.esperar;
  d = {
    ...d,
    esperar: (teste, seg) =>
      esperarOrig(async () => {
        ponto();
        return teste();
      }, seg)
  };
  try {
    mudar(dir, { etapa: 5, fase: 'rodando', pausa: null });
    const comecar = (x) => {
      exigir(dir, x);
      atualSub = x;
      marcarSub(dir, x.id, 'rodando');
      vivo('etapa', `Incidente · ${x.n} ${x.nome}`);
    };
    const concluirSub = (x) => {
      marcarSub(dir, x.id, 'concluida');
      atualSub = null;
    };
    const ctx = { s, t, dir, d, vivo, ponto, comecar, concluirSub };
    // Cada subetapa devolve true quando parou (pausa ou aguardando aprovação).
    if (await plano.rodar(ctx)) return;
    if (await massa.rodar(ctx)) return;
    if (estadoSubs(dir).reproducao !== 'concluida') {
      // já concluída (ex.: aceita sem resultado): não sobe nem reproduz de novo
      if (await ambiente.rodar(ctx)) return;
      if (await reproduzir.rodar(ctx)) return;
    }

    await evidencias.fechar(t, dir, d, ponto); // etapa 6: resumo analítico e Mergulho concluído
  } catch (e) {
    if (e.message === controle.CANCELADO) return; // pausado por você: o orquestrador já guardou a pausa
    vivo('erro', `Reprodução parou: ${e.message}`);
    if (atualSub) marcarSub(dir, atualSub.id, 'erro');
    mudar(dir, { etapa: 5, fase: 'erro', pausa: null });
  } finally {
    s.render?.();
  }
}

module.exports = {
  n: 5,
  executar,
  responder,
  SUBETAPAS,
  estadoSubs,
  proximaSub,
  aprovarMassa: massa.aprovarMassa,
  aceitarSemResultado,
  ACEITAR,
  _teste: {
    massaAprovada: massa.massaAprovada,
    hashSql: massa.hashSql,
    FERRAMENTAS,
    ARTEFATO,
    exigir,
    marcarSub,
    travaDml,
    chavesReais,
    subirAmbiente: ambiente.subirAmbiente,
    gravarReproducao: reproduzir.gravarReproducao,
    acharComando: ambiente.acharComando,
    PAPEIS: ambiente.PAPEIS,
    promptPlano: plano.promptPlano,
    promptReproduzir: reproduzir.promptReproduzir
  }
};
