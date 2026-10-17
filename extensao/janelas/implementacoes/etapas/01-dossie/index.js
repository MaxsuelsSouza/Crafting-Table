// @ts-check
// Etapa 1 · Dossiê (extensão) e, para bug/incidente, a Reprodução: confirmar o cenário antes de corrigir. Ticket só com título pausa pedindo a
// explicação do dev (briefing); tipo não reconhecido pausa perguntando (motivo 'tipo', o mesmo da etapa 5) antes de decidir se reproduz; o
// Mergulho (Incidentes) já reproduziu → segue sem reproduzir. A etapa fica "1" no estado até o veredito liberar ou o dev decidir.
//
// Estrutura desta pasta:
//   index.js                         passoDossie: 1.1 → (bug/incidente) 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → etapa 2
//   subetapas/1.1-dossie.js          relê o ticket e grava o dossiê
//   subetapas/1.2-evidencias.js      anexos + quadros dos vídeos (código) + evidencias-ticket.md (IA, só leitura)
//   subetapas/1.3-roteiro.js         cenários com a fonte de cada passo (IA, só planeja)
//   subetapas/1.4-ref-ambiente.js    ref da reprodução, checkout --detach e ambiente de pé (código)
//   subetapas/1.5-reproduzir.js      executa o roteiro com a tela gravada (IA)
//   subetapas/1.6-veredito.js        anexa o vídeo, volta o HEAD e decide (código, infra/reproducao/veredito.js)
//   regras/                          ferramentas, claude -p, HEAD original, vídeo nos cenários, Mergulho, pedido de dados, respostas às pausas
//   reproducao/                      evidências do ticket, resultado (reproducao.md) e prompts
//   dependencias.js                  ambiente, ffmpeg e ferramenta de tickets (os testes trocam)
const aoVivo = require('../../../../componentes/ao-vivo');
const controle = require('../../../../infra/controle');
const dossie = require('../../../../infra/dossie');
const { estado, mudar, pausar } = require('../../estado');
const { limparPausa } = require('../../orquestrador/pausa');
const { rodarEtapa } = require('../../orquestrador/rodar-etapa');
const { OPCOES_TIPO } = require('../05-implementacao/regras/nome-branch');
const { prepararDossie, briefingExiste } = require('./subetapas/1.1-dossie');
const { evidencias } = require('./subetapas/1.2-evidencias');
const { roteiro } = require('./subetapas/1.3-roteiro');
const { refAmbiente } = require('./subetapas/1.4-ref-ambiente');
const { reproduzir } = require('./subetapas/1.5-reproduzir');
const { concluir } = require('./subetapas/1.6-veredito');
const { restaurar } = require('./regras/head');
const { mergulhoReproduziu } = require('./regras/mergulho');

const SEM_REPRODUZIR = ['ok', 'aceita', 'mergulho'];

async function passoDossie(s, t, rodada) {
  const dir = s.pastaAba(t.id);
  if (estado(dir).repro?.head) restaurar(dir); // a reprodução caiu no meio: os repositórios voltam ao HEAD de antes
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
  // Grupo de subtarefas não reproduz: as subtarefas são desenvolvimento, e o bug (se houver) é do pai.
  if (!t.grupo && !d.categoria) {
    pausar(dir, 1, {
      motivo: 'tipo',
      pergunta: `Não reconheci o tipo do ticket ${t.chave}${t.tipo ? ` ("${t.tipo}")` : ''}: bug e incidente passam pela reprodução antes de corrigir (e o nome da branch depende do tipo). É uma feature, um bug ou um incidente?`,
      opcoes: Object.keys(OPCOES_TIPO)
    });
    return s.render();
  }
  if (d.exigeReproducao && !t.grupo && !SEM_REPRODUZIR.includes(estado(dir).reproducao)) {
    const m = mergulhoReproduziu(t);
    if (!m) return rodarReproducao(s, t, d, rodada);
    mudar(dir, { reproducao: 'mergulho' });
    aoVivo.anotar(dir, {
      tipo: 'fala',
      texto: 'O Mergulho (Incidentes) já reproduziu o problema: a esteira não reproduz de novo',
      detalhe: m.acao
    });
  }
  mudar(dir, { etapa: 2, fase: 'parado', modo: d.modo, tentativas: 0, correcao: false });
  return rodarEtapa(s, t, 2, rodada);
}

// Reprodução (1.2 → 1.6). Cada subetapa confere a rodada (⏸ no meio: a etapa recomeça ao retomar; o que já foi feito é reaproveitado).
async function rodarReproducao(s, t, d, rodada) {
  const dir = s.pastaAba(t.id),
    vale = () => controle.valida(dir, rodada);
  limparPausa(dir);
  mudar(dir, { etapa: 1, fase: 'rodando', pausa: null });
  aoVivo.anotar(dir, { tipo: 'etapa', texto: 'Esteira · Reprodução do bug' });
  s.render();
  const { midia } = await evidencias(s, t);
  if (!vale()) return s.render();
  const rot = await roteiro(s, t);
  if (!vale()) return s.render();
  let amb = /** @type {any} */ ({ motivo: '' });
  if (!rot.motivo) {
    amb = await refAmbiente(s, t, d);
    if (amb.pausou) return s.render();
    if (!vale()) return s.render();
    if (!amb.motivo) await reproduzir(s, t, d, amb);
    if (!vale()) return s.render();
  }
  return concluir(s, t, d, rodada, { roteiro: rot, amb, midia });
}

module.exports = { n: 1, passoDossie, rodarReproducao };
