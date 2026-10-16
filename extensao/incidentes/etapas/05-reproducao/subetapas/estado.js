// @ts-check
// Subetapas da etapa 5 e o estado delas em .mergulho.json (sub). Também a pausa da etapa 5.
const fs = require('fs');
const path = require('path');
const aoVivo = require('../../../../componentes/ao-vivo');
const fluxo = require('../../../../componentes/fluxo-passos');
const { mesclar: mudar, lerJson, lerTxt, ESTADO: MERG } = require('../../../estado');

// ── Subetapas da etapa 5, na ordem em que rodam. Cada uma deixa um artefato e a próxima só começa com ele presente.
// Estado guardado em .mergulho.json (sub: { id: 'rodando' | 'concluida' | 'erro' }); concluída só vale com o artefato em disco. A retomada
// recomeça da primeira que não está concluída.
const SUBETAPAS = [
  { id: 'plano', n: '5.1', nome: 'Planejar o fluxo', arq: 'fluxo.json' },
  { id: 'massa', n: '5.2', nome: 'Massa de teste', arq: 'massa-teste.sql' },
  { id: 'ambiente', n: '5.3', nome: 'Subir o ambiente', arq: '.ambiente.ok' },
  { id: 'reproducao', n: '5.4', nome: 'Reproduzir', arq: 'reproducao.json' }
];
const ARTEFATO = {
  plano: (dir) => fluxo.ler(dir).passos.length > 0,
  massa: (dir) =>
    !!lerTxt(path.join(dir, 'massa-teste.sql')).trim() && fs.existsSync(path.join(dir, '.massa-teste.ok')),
  ambiente: (dir) => fs.existsSync(path.join(dir, '.ambiente.ok')),
  reproducao: (dir) => fs.existsSync(path.join(dir, 'reproducao.json'))
};
const marcarSub = (dir, id, st) => mudar(dir, { sub: { ...(lerJson(path.join(dir, MERG), {}).sub || {}), [id]: st } });
// Estado gravado, já conferido com o artefato: 'concluida' sem artefato volta a pendente.
const estadoSubs = (dir) => {
  const g = lerJson(path.join(dir, MERG), {}).sub || {};
  return Object.fromEntries(
    SUBETAPAS.map((x) => [x.id, g[x.id] === 'concluida' && !ARTEFATO[x.id](dir) ? 'pendente' : g[x.id] || 'pendente'])
  );
};
// Primeira subetapa não concluída (retomada); null se as quatro estão prontas.
const proximaSub = (dir) => {
  const e = estadoSubs(dir);
  return SUBETAPAS.find((x) => e[x.id] !== 'concluida') || null;
};
// A próxima só começa com o artefato da anterior: erro claro (vai para o Ao vivo) se faltar.
const exigir = (dir, x) => {
  const ant = SUBETAPAS[SUBETAPAS.indexOf(x) - 1];
  if (ant && !ARTEFATO[ant.id](dir))
    throw new Error(
      `${x.n} ${x.nome} precisa de ${ant.arq}, que a ${ant.n} ${ant.nome} ainda não deixou na pasta do incidente`
    );
  if (!ant && !lerTxt(path.join(dir, '4-diagnostico.md')).trim())
    throw new Error(`${x.n} ${x.nome} precisa de 4-diagnostico.md (etapa 4 aprovada)`);
};

// Pausa: o A mostra motivo/pergunta/opções; a retomada chama executar de novo. Devolve true (a subetapa parou).
function pausar(dir, motivo, pergunta, opcoes = ['Tentar de novo']) {
  aoVivo.anotar(dir, { tipo: 'aviso', texto: `${motivo}. ${pergunta}` });
  mudar(dir, { etapa: 5, fase: 'pausado', pausa: { motivo, pergunta, opcoes } });
  return true;
}

module.exports = { SUBETAPAS, ARTEFATO, marcarSub, estadoSubs, proximaSub, exigir, pausar };
