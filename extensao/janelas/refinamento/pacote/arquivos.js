// @ts-check
// Seções com os arquivos de cada passo embutidos (spec, plano, tarefas, análise, testes), os mapas do código e a constituição.
const fs = require('fs');
const path = require('path');
const { HANDOFF, arquivoPasso } = require('../locais');
const { lerTexto, secao, embutir } = require('./comum');

/** L = linhas do refinamento.md (montar.js); aprovado(n) = o passo n foi aprovado. */
const arquivos = (L, { t, spec, aprovado }) => {
  const PARTES = [
    [1, 'spec.md', 'Especificação'],
    [3, 'plan.md', 'Plano técnico'],
    [4, 'tasks.md', 'Tarefas (detalhe)'],
    [5, 'analise.md', 'Análise de cobertura'],
    [6, 'testes.md', 'Plano de testes']
  ];
  for (const [n, arq, titulo] of PARTES) {
    const txt = lerTexto(path.join(spec, arq));
    L.push(secao(`${titulo} (${arq}${aprovado(n) ? '' : ', ainda não aprovado'})`, txt ? embutir(txt) : ''));
  }
  const mapas = Object.values(HANDOFF).filter((f) => fs.existsSync(path.join(spec, f)));
  L.push(
    secao(
      'Mapeamento do código',
      mapas.map((f) => `- \`${f}\` (na pasta da spec): onde cada requisito toca o código, com evidências.`).join('\n')
    )
  );
  const constituicao = fs.existsSync(arquivoPasso(t, 0))
    ? 'constitution.md na raiz do repositório de specs: regras que o plano precisa respeitar.'
    : '';
  L.push(secao('Constituição', constituicao));
};

module.exports = { arquivos };
