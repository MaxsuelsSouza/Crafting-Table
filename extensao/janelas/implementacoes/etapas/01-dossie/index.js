// @ts-check
// Etapa 1 · Dossiê (extensão, sem IA): o que existe no disco do ticket, com a prontidão e o modo. Ticket só com título pausa pedindo a
// explicação do dev (briefing); ticket do tipo Bug passa pela Reprodução antes da etapa 2 (a etapa fica "1" no estado até confirmar o erro
// ou o usuário aceitar seguir sem confirmar).
//
// Estrutura desta pasta:
//   index.js                     passoDossie: 1.1 → (Bug) 1.2 → etapa 2
//   subetapas/1.1-dossie.js      relê o ticket e grava o dossiê
//   subetapas/1.2-reproducao.js  claude -p da Reprodução e o que fazer quando termina
//   regras/ferramentas.js        ferramentas do claude -p da Reprodução
//   reproducao/                  evidências do ticket, resultado dos cenários (reproducao.md) e prompt
const aoVivo = require('../../../../componentes/ao-vivo');
const controle = require('../../../../infra/controle');
const dossie = require('../../../../infra/dossie');
const { estado, mudar, pausar } = require('../../estado');
const { rodarEtapa } = require('../../orquestrador/rodar-etapa');
const { prepararDossie, briefingExiste } = require('./subetapas/1.1-dossie');
const { rodarReproducao } = require('./subetapas/1.2-reproducao');

async function passoDossie(s, t, rodada) {
  const dir = s.pastaAba(t.id);
  mudar(dir, { etapa: 1, fase: 'rodando', pausa: null });
  aoVivo.anotar(dir, { tipo: 'etapa', texto: 'Esteira · Etapa 1: Dossiê' });
  s.render();
  const d = await prepararDossie(s, t);
  if (!controle.valida(dir, rodada)) return s.render();
  aoVivo.anotar(dir, {
    tipo: 'fala',
    texto: `Dossiê pronto: modo ${dossie.ROTULO_MODO[d.modo]}, prontidão ${d.prontidao}.`,
    detalhe: d.lacunas.join('\n')
  });
  if (d.modo === 'perguntar' && !briefingExiste(dir)) {
    pausar(dir, 1, {
      motivo: 'briefing',
      pergunta:
        'O ticket não tem descrição, documento nem diagnóstico: só o título. Explique o que precisa ser feito (o que o usuário vê, o que deve mudar, como saber que ficou certo). O que você escrever vira a fonte "verbal" do dossiê.',
      opcoes: []
    });
    return s.render();
  }
  // Ticket do tipo Bug: confirma que o erro acontece antes de planejar qualquer mudança (a aba Reprodução).
  if (d.exigeReproducao && !['ok', 'aceita'].includes(estado(dir).reproducao)) return rodarReproducao(s, t, d, rodada);
  mudar(dir, { etapa: 2, fase: 'parado', modo: d.modo, tentativas: 0, correcao: false });
  return rodarEtapa(s, t, 2, rodada);
}

module.exports = { n: 1, passoDossie };
