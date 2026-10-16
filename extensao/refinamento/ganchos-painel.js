// @ts-check
// O que o painel comum (painel/painel.js e painel/moldura.js) pede ao Refinamento, lido pelo registro (refinamento.js).
// O código veio de painel.js (render) e moldura.js (cabecalho) como estava.
const fs = require('fs');
const path = require('path');
const { sddState } = require('../configuracao/configuracao');
const { pasta, pastaDe } = require('../infra/ticket/pastas');
const { lerTexto } = require('../infra/ticket/pasta-ticket');
const { dirSpec, arqHandoff, tarefasDe, estadoSpec } = require('../infra/ticket/spec');
const { SEM_TICKET } = require('../componentes/card-ticket');
const { duvidasDe, impactosDe } = require('./locais');
const { emRefino } = require('./estado');
const { abertos, modo, pillRefino } = require('./abas/spec');

// Todos os passos aprovados: o modo refinamento termina sozinho.
const aoDesenhar = (t) => {
  if (t && emRefino(t) && t.specPronta && estadoSpec(t).proximoPasso > 6)
    t = { ...t, refinamento: modo(t.id, 'concluido') };
  return t;
};

// Confere os arquivos da spec antes de desenhar: edição depois de aprovado volta o passo para revisão.
const antesDaAba = (aba, t) => {
  if (aba === 'spec' && dirSpec(t) && fs.existsSync(path.join(dirSpec(t), 'sdd-state.json')) && sddState()) {
    try {
      require('child_process').execFileSync(sddState(), ['check', '--ref', pasta(t.id)], {
        timeout: 5000,
        stdio: 'ignore'
      });
    } catch {}
  }
};

// Dados das abas Spec, Análise, Tarefas e Dúvidas (entram no `d` do painel.js).
const dadosAba = (t, dir) => ({
  abertos,
  handoffs:
    t.id === SEM_TICKET
      ? {}
      : { backend: lerTexto(arqHandoff(t, 'backend')), mobile: lerTexto(arqHandoff(t, 'mobile')) },
  tarefas: t.id === SEM_TICKET ? [] : tarefasDe(dir),
  duvidas: duvidasDe(dir),
  impactos: t.id === SEM_TICKET ? [] : impactosDe(dir),
  estado: dirSpec(t) ? estadoSpec(t) : null
});

// O Claude grava o estado da spec por fora: redesenha quando muda (obs = os observadores do painel, fechados por ele).
const observar = (t, depois, obs) => {
  if (dirSpec(t) && fs.existsSync(dirSpec(t))) {
    try {
      obs.push(
        fs.watch(dirSpec(t), (_, nome) => {
          if (nome && !nome.endsWith('.tmp')) depois(400);
        })
      );
    } catch {}
    try {
      obs.push(
        fs.watch(t.spec.repo, (_, nome) => {
          if (nome === 'constitution.md') depois(400);
        })
      );
    } catch {}
  }
};

// Cabeçalho do ticket (moldura.js): pill do modo, faixa roxa (modo ligado e não pausado) e o contador das abas Dúvidas e Tarefas.
const pill = (t) => (emRefino(t) ? pillRefino(t) : '');
const faixa = (t) => (emRefino(t) && t.refinamento.estado !== 'pausado' ? '<div class="ct-roxo"></div>' : '');
const contadorAba = (id, t) =>
  id === 'duvidas'
    ? [
        duvidasDe(pastaDe(t.id)).filter((x) => !x.resposta).length,
        'dúvida(s) em aberto: a spec só avança quando todas forem respondidas'
      ]
    : id === 'tarefas'
      ? [
          tarefasDe(pastaDe(t.id)).filter((x) => x.status === 'pendente' || x.revisao).length,
          'tarefa(s) esperando sua decisão'
        ]
      : [0, ''];

module.exports = { aoDesenhar, antesDaAba, dadosAba, observar, pill, faixa, contadorAba };
