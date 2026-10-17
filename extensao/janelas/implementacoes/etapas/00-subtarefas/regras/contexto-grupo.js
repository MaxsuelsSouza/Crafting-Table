// @ts-check
// .contexto-grupo.md na pasta do grupo: o que o grupo implementa (as subtarefas dele, com a descrição de cada uma) e, no paralelo, os
// arquivos do outro grupo (que outro agente está mexendo ao mesmo tempo). Os prompts das etapas 2 a 7 do grupo citam este arquivo (prompts.js).
const fs = require('fs');
const path = require('path');
const { CONTEXTO_GRUPO, arqSub } = require('../arquivos');

const ler = (f) => {
  try {
    return fs.readFileSync(f, 'utf8').trim();
  } catch {
    return '';
  }
};

function escreverContextoGrupo(dirPai, dirG, g, plano) {
  const outros = plano.grupos.filter((x) => x.id !== g.id);
  const md = [
    `# Grupo ${g.id} · ${g.titulo}`,
    '',
    `Implemente SÓ estas subtarefas do ticket pai: ${g.subtarefas.join(', ')}. O ticket pai e as outras subtarefas são contexto.`,
    `Camadas: ${g.camadas.join(', ') || 'não informadas'} · Arquivos previstos: ${g.arquivos.join(', ') || 'não informados'}`,
    g.porque ? `Por que juntas: ${g.porque}` : '',
    '',
    ...outros.map((o) =>
      plano.execucao === 'paralelo'
        ? `O grupo ${o.id} (${o.subtarefas.join(', ')}) está sendo implementado POR OUTRO AGENTE AO MESMO TEMPO. Não toque nos arquivos dele: ${o.arquivos.join(', ')}.`
        : `O grupo ${o.id} (${o.subtarefas.join(', ')}) ${g.dependeDe.includes(o.id) ? 'já foi implementado antes deste: o código dele está na branch' : 'vem depois deste'}.`
    ),
    '',
    ...g.subtarefas.map((k) => ler(arqSub(dirPai, k)) || `# ${k}\n(sem descrição)`)
  ];
  fs.mkdirSync(dirG, { recursive: true });
  fs.writeFileSync(path.join(dirG, CONTEXTO_GRUPO), md.join('\n').replace(/\n{3,}/g, '\n\n') + '\n');
}

module.exports = { escreverContextoGrupo };
