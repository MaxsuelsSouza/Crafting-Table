// @ts-check
// Permissões que o usuário dá ao Claude (Configurações → Permissões): o que está marcado (bloco inteiro, um módulo ou um comando) e as
// regras do --allowedTools que isso libera. O maestro (infra/agentes/maestro/rodar.js) soma estas regras em toda execução em segundo plano.
// Marcadas em ~/.cache/crafting-table/permissoes.json: ["b:leitura", "m:escrita|Shell", "c:escrita|Git|git push"].
//   catalogo.js  chamada de ferramenta → { bloco, modulo, comando, regras }
//   contagem.js  histórico das sessões → quantas vezes cada comando foi tentado
const fs = require('fs');
const path = require('path');
const { RAIZ } = require('../area-ia');
const { BLOCOS, MODULOS } = require('./catalogo');
const contagem = require('./contagem');

const ARQ = path.join(RAIZ, 'permissoes.json');

/** @returns {Set<string>} */
const marcadas = () => {
  try {
    return new Set(JSON.parse(fs.readFileSync(ARQ, 'utf8')));
  } catch {
    return new Set();
  }
};
const gravar = (s) => {
  fs.mkdirSync(RAIZ, { recursive: true });
  fs.writeFileSync(ARQ, JSON.stringify([...s].sort(), null, 1));
};
const alternar = (id) => {
  const s = marcadas();
  s.has(id) ? s.delete(id) : s.add(id);
  gravar(s);
};

// Árvore para a tela: blocos → módulos → comandos, cada um com a contagem; os mais tentados primeiro.
const arvore = (itens = contagem.ler().itens) =>
  BLOCOS.map((b) => {
    const mods = {};
    for (const it of Object.values(itens).filter((x) => x.bloco === b.id)) (mods[it.modulo] ||= []).push(it);
    const modulos = Object.entries(mods)
      .map(([nome, comandos]) => ({ nome, comandos: comandos.sort((a, z) => z.n - a.n), n: comandos.reduce((s, c) => s + c.n, 0) }))
      .sort((a, z) => MODULOS.indexOf(a.nome) - MODULOS.indexOf(z.nome));
    return { ...b, modulos, n: modulos.reduce((s, m) => s + m.n, 0) };
  }).filter((b) => b.modulos.length);

const ids = {
  bloco: (b) => `b:${b}`,
  modulo: (b, m) => `m:${b}|${m}`,
  comando: (b, m, c) => `c:${b}|${m}|${c}`
};

/** Regras do --allowedTools liberadas pelo que está marcado (um bloco libera todos os seus módulos e comandos). */
function regras(itens = contagem.ler().itens, sel = marcadas()) {
  const r = new Set();
  for (const it of Object.values(itens)) {
    const bloco = sel.has(ids.bloco(it.bloco)),
      mod = sel.has(ids.modulo(it.bloco, it.modulo));
    if (bloco || mod || sel.has(ids.comando(it.bloco, it.modulo, it.comando))) it.regras.forEach((x) => r.add(x));
  }
  return [...r];
}

module.exports = { arvore, regras, marcadas, alternar, ids, atualizar: contagem.atualizar, lendo: contagem.lendo };
