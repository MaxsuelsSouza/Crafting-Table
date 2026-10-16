// @ts-check
// Evidência obrigatória para "passou" e, se a implementação grava em tabela, a consulta SQL com o resultado.
const fs = require('fs');
const path = require('path');

// Passou só com evidência anexada por `qa-state evidencia` nesta execução. Se a implementação grava em tabela (plano de mudança / implementacao.md),
// o cenário que cita a tabela precisa também da consulta SQL e do resultado dela.
const tabelasDe = (texto) => [
  ...new Set(
    [...String(texto).matchAll(/\btabela\s+[`"']?([A-Za-z_][\w.]*)[`"']?/gi)]
      .map((m) => m[1].toLowerCase())
      .filter((n) => n.length > 2)
  )
];
function exigenciasDe(dir, c) {
  const raiz = path.dirname(dir);
  let tx = '';
  for (const f of ['plano-mudanca.md', 'implementacao.md']) {
    try {
      tx += `\n${fs.readFileSync(path.join(raiz, 'impl', f), 'utf8')}`;
    } catch {
      /* sem implementação */
    }
  }
  const gravam = tx.split('\n').filter((l) => /\b(grav|insert|registr|log|auditor|hist[óo]rico)/i.test(l));
  return tabelasDe(gravam.join('\n')).filter((tb) => `${c.titulo} ${c.texto}`.toLowerCase().includes(tb));
}
function faltaEvidencia(dir, c, ex) {
  const anexos = ex.anexos || [];
  if (!anexos.length)
    return `${c.id} não pode passar sem evidência: anexe prints, logs ou o resultado com qa-state evidencia ${c.id} <arquivo...> e conclua de novo`;
  const tabelas = exigenciasDe(dir, c);
  for (const tb of tabelas) {
    const sql = anexos.find(
      (n) =>
        /\.sql$/i.test(n) &&
        fs
          .readFileSync(path.join(dir, ex.evidencias, n), 'utf8')
          .toLowerCase()
          .includes(tb)
    );
    const res = anexos.find((n) => /resultado|result/i.test(n) && !/\.sql$/i.test(n));
    if (!sql || !res)
      return `${c.id} grava na tabela ${tb} (implementação): anexe a consulta SQL (arquivo .sql com a tabela) e o resultado dela (arquivo resultado-*.txt|csv) com qa-state evidencia ${c.id} <arquivo...>`;
  }
  return '';
}

module.exports = { tabelasDe, exigenciasDe, faltaEvidencia };
