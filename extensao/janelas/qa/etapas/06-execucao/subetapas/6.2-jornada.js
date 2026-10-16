// @ts-check
// 6.2 · Jornada: roda o roteiro do cenário sem Claude (flow no Maestro, bipe, espera, consulta antes × depois).
// Tudo que sai vai para a pasta da execução (saida): junit e saída de cada flow, .txt das consultas, prints e jornada.txt.
// status: passou | falhou (o app, a consulta ou a comparação) | invalido (o roteiro não passou na validação: é do roteiro, não do código).
const fs = require('fs');
const path = require('path');
const { substituir, resolverVars, validarRoteiro } = require('../regras/roteiro');
const { comBinds, comparar, texto } = require('../regras/consulta');

const slug = (s) =>
  String(s)
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .slice(0, 50) || 'etapa';

/**
 * @param {{ roteiro: any, base: string, saida: string, vars?: Record<string,string>, envBase?: Record<string,string>,
 *   deps: { maestro: Function, bipe: Function, esperar: Function, consultar: Function, prints: Function } }} o
 */
async function rodarJornada({ roteiro, base, saida, vars = {}, envBase = {}, deps }) {
  const inicio = new Date(),
    detalhes = [],
    consultas = {};
  fs.mkdirSync(saida, { recursive: true });
  const r = substituir(roteiro, resolverVars(roteiro, vars));
  fs.writeFileSync(path.join(saida, 'roteiro.json'), JSON.stringify({ ...r, base }, null, 2)); // o que rodou, já com a massa
  const erros = validarRoteiro(r, { base, envBase });
  if (erros.length) return fim('invalido', erros);
  let status = 'passou';
  for (const [i, e] of r.etapas.entries()) {
    const n = String(i + 1).padStart(2, '0'),
      rotulo = `${n} ${e.tipo}${e.nome || e.arquivo ? ` ${e.nome || e.arquivo}` : ''}`;
    if (e.tipo === 'flow') {
      const env = { ...envBase, ...(e.env || {}) },
        nome = `${n}-${slug(path.basename(e.arquivo).replace(/\.ya?ml$/, ''))}`;
      const x = await deps.maestro(path.resolve(base, e.arquivo), env, {
        junit: path.join(saida, `${nome}-junit.xml`),
        cwd: saida
      });
      fs.writeFileSync(path.join(saida, `${nome}-saida.txt`), x.saida || '');
      if (x.rc !== 0) return fim('falhou', [...detalhes, `${rotulo}: falhou (rc ${x.rc}). ${ultimas(x.saida)}`]);
      detalhes.push(`${rotulo}: ok`);
    } else if (e.tipo === 'bipe') {
      const x = await deps.bipe(String(e.codigo));
      if (!x.ok) return fim('falhou', [...detalhes, `${rotulo}: broadcast não entregue. ${ultimas(x.saida)}`]);
      await deps.esperar(Number(e.segundos ?? 1));
      detalhes.push(`${rotulo} ${e.codigo}: ok`);
    } else if (e.tipo === 'espera') {
      await deps.esperar(Number(e.segundos ?? 1));
    } else {
      const sql = comBinds(e.sql, e.binds),
        x = await deps.consultar(sql);
      if (!x.ok) return fim('falhou', [...detalhes, `${rotulo}: erro no banco (${x.erro})`]);
      consultas[e.nome] = { nome: e.nome, colunas: x.colunas, itens: x.itens };
      fs.writeFileSync(path.join(saida, `consulta-${slug(e.nome)}.txt`), texto({ ...e, sql, ...x }));
      if (e.comparar_com === undefined) detalhes.push(`${rotulo}: ${x.itens.length} linha(s)`);
      else {
        const c = comparar(consultas[e.comparar_com], consultas[e.nome], e.esperado);
        detalhes.push(`${rotulo}: ${c.texto}${c.ok ? '' : ' ✗'}`);
        if (!c.ok) status = 'falhou'; // segue: as próximas etapas ainda dizem algo
      }
    }
  }
  return fim(status, detalhes);

  function fim(st, det) {
    // Todo print gerado desde o início é deste cenário (a skill dependia do prefixo cen-NN e perdia os subcasos cen-08a).
    for (const p of deps.prints(inicio)) {
      const destino = path.join(saida, path.basename(p));
      if (path.resolve(p) !== path.resolve(destino)) fs.copyFileSync(p, destino);
    }
    fs.writeFileSync(
      path.join(saida, 'jornada.txt'),
      [`# Jornada · ${st} · ${inicio.toISOString()} → ${new Date().toISOString()}`, ...det, ''].join('\n')
    );
    return { status: st, detalhes: det, consultas };
  }
}
const ultimas = (s, n = 600) =>
  String(s || '')
    .trim()
    .slice(-n);

module.exports = { rodarJornada };
