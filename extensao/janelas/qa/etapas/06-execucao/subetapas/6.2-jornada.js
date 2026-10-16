// @ts-check
// 6.2 · Jornada: roda o roteiro do cenário sem Claude (flow no Maestro, bipe, espera, http na API, consulta antes × depois).
// Tudo que sai vai para a pasta da execução (saida): junit e saída de cada flow, .txt das consultas, prints e jornada.txt.
// status: passou | falhou (o app, a consulta ou a comparação) | invalido (o roteiro não passou na validação: é do roteiro, não do código).
const fs = require('fs');
const path = require('path');
const { substituir, resolverVars, validarRoteiro } = require('../regras/roteiro');
const { comBinds, comparar, texto } = require('../regras/consulta');
const { conferirHttp } = require('../regras/http');

const slug = (s) =>
  String(s)
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .slice(0, 50) || 'etapa';

/**
 * @param {{ roteiro: any, base: string, saida: string, vars?: Record<string,string>, envBase?: Record<string,string>,
 *   deps: { maestro: Function, bipe: Function, esperar: Function, consultar: Function, prints: Function, http?: Function },
 *   inicio?: { inicio: string, voltar: string } | null }} o inicio: flows da tela de início (etapas/06-execucao/inicio), rodados antes das etapas
 */
async function rodarJornada({ roteiro, base, saida, vars = {}, envBase = {}, deps, inicio: flowsInicio = null }) {
  const inicio = new Date(),
    detalhes = [],
    consultas = {};
  fs.mkdirSync(saida, { recursive: true });
  const r = substituir(roteiro, resolverVars(roteiro, vars));
  fs.writeFileSync(path.join(saida, 'roteiro.json'), JSON.stringify({ ...r, base }, null, 2)); // o que rodou, já com a massa
  const erros = validarRoteiro(r, { base, envBase });
  if (erros.length) return fim('invalido', erros);
  // Tela de início (aba Conhecimentos): voltar-inicio já logado; se não der, o inicio do zero (login e filial). Fora das etapas do roteiro.
  if (flowsInicio && r.etapas.some((e) => e.tipo === 'flow' || e.tipo === 'bipe')) {
    // só com app: cenário de API ou banco não abre o app
    const rodarInicio = async (nome, arq) =>
      deps.maestro(arq, envBase, {
        junit: path.join(saida, `00-${nome}-junit.xml`),
        cwd: path.dirname(arq),
        saidaTeste: path.join(saida, 'maestro', `00-${nome}`)
      });
    let x = await rodarInicio('voltar-inicio', flowsInicio.voltar);
    if (x.rc !== 0) x = await rodarInicio('inicio', flowsInicio.inicio);
    fs.writeFileSync(path.join(saida, '00-inicio-saida.txt'), x.saida || '');
    if (x.rc !== 0)
      return fim('falhou', [`00 início do teste: o app não chegou à tela de início (rc ${x.rc}). ${ultimas(x.saida)}`]);
    detalhes.push('00 início do teste: ok');
  }
  let status = 'passou';
  const salvos = {}; // ${VAR} que as etapas http salvam para as seguintes
  for (const [i, eOrig] of r.etapas.entries()) {
    const e = Object.keys(salvos).length ? substituir(eOrig, salvos) : eOrig;
    const n = String(i + 1).padStart(2, '0'),
      rotulo = `${n} ${e.tipo}${e.nome || e.arquivo ? ` ${e.nome || e.arquivo}` : ''}`;
    if (e.tipo === 'flow') {
      const env = { ...envBase, ...(e.env || {}) },
        nome = `${n}-${slug(path.basename(e.arquivo).replace(/\.ya?ml$/, ''))}`;
      const x = await deps.maestro(path.resolve(base, e.arquivo), env, {
        junit: path.join(saida, `${nome}-junit.xml`),
        cwd: saida,
        saidaTeste: path.join(saida, 'maestro', nome)
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
    } else if (e.tipo === 'http') {
      const x = await deps.http(e);
      if (!x.ok) return fim('falhou', [...detalhes, `${rotulo}: a API não respondeu (${x.erro})`]);
      fs.writeFileSync(
        path.join(saida, `http-${slug(e.nome)}.txt`),
        `${String(e.metodo).toUpperCase()} ${e.rota}\n${e.corpo !== undefined ? `${JSON.stringify(e.corpo, null, 2)}\n` : ''}\n-- HTTP ${x.status}\n${typeof x.corpo === 'string' ? x.corpo : JSON.stringify(x.corpo, null, 2)}\n`
      );
      const c = conferirHttp(e, x);
      Object.assign(salvos, c.salvos);
      detalhes.push(`${rotulo}: ${c.texto}${c.ok ? '' : ' ✗'}`);
      if (!c.ok) status = 'falhou'; // segue: as consultas depois ainda dizem algo
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
    // Prints da pasta do Maestro desta execução (--test-output-dir): são deste cenário, sem varrer ~/.maestro/tests nem comparar data.
    for (const p of deps.prints(path.join(saida, 'maestro'))) {
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
