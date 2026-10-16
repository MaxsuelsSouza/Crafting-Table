// @ts-check
// ── Passo 3 em duas subetapas, cada uma numa execução nova que só conta com o que a anterior deixou em disco:
// 3.1 Mapeamento do código (grava mapa-backend.md/mapa-mobile.md na pasta da spec, sem plan.md e sem concluir) e
// 3.2 Plano técnico (lê os mapas, escreve plan.md e roda concluir 3). Estado em .ticket.json › refinamento.sub3 = { mapa, plano }:
// 'pendente' | 'rodando' | 'concluida' | 'erro' | 'pausada' (a IA não grava em ~/.claude; quem grava é a extensão).
const fs = require('fs');
const path = require('path');
const tickets = require('../../../../infra/ticket/tickets');
const { dirSpec, HANDOFF } = require('../../../locais');

const SUBETAPAS3 = [
  { id: 'mapa', nome: 'Mapeamento do código' },
  { id: 'plano', nome: 'Plano técnico' }
];
const mapasDe = (t) =>
  Object.values(HANDOFF)
    .map((f) => path.join(dirSpec(t) || '', f))
    .filter((f) => dirSpec(t) && fs.existsSync(f));
const sub3De = (chave) => tickets.ler(chave)?.refinamento?.sub3 || {};
const gravarSub3 = (chave, parte) => {
  const x = tickets.ler(chave);
  if (x) tickets.gravar({ ...x, refinamento: { ...x.refinamento, sub3: { ...x.refinamento?.sub3, ...parte } } });
};
// Estados das duas subetapas para a tela (passo = o passo 3 do sdd-state; rodando = o Claude está executando agora).
const subetapas3 = (t, passo, rodando) => {
  const sub = sub3De(t.id || t.chave),
    feito = ['aguardando_revisao', 'aprovado'].includes(passo?.status);
  const est = (v, fim) => (fim ? 'concluida' : v === 'rodando' && !rodando ? 'pausada' : v || 'pendente');
  return SUBETAPAS3.map((x) => ({
    nome: x.nome,
    estado: est(sub[x.id], feito || (x.id === 'mapa' && sub.mapa === 'concluida'))
  }));
};

module.exports = { SUBETAPAS3, mapasDe, sub3De, gravarSub3, subetapas3 };
