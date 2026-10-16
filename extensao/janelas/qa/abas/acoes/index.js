// @ts-check
// Cliques do módulo QA (data-acao/data-painel), juntados pelo painel.js pelo registro (janelas/qa/qa.js acoes).
// Contrato: `acoes(servicos)` devolve { nome: handler }; o painel espalha no seu `acoes`. Sem `this`: chamadas entre handlers refazem o objeto.
//   dependencias.js  VS Code, provedor, emulador e Comandos (depsQa, depsPublicar)
//   gerar-plano.js   a IA escreve o plano local
//   execucao · ambiente · plano · responder · publicar · massa · cenarios · conhecimentos  um grupo de cliques por arquivo
const { execucao } = require('./execucao');
const { ambiente } = require('./ambiente');
const { plano } = require('./plano');
const { responder } = require('./responder');
const { publicar } = require('./publicar');
const { massa } = require('./massa');
const { cenarios } = require('./cenarios');
const { conhecimentos } = require('./conhecimentos');
const { botaoPlay } = require('../botao-play');
const { caixaAmbiente, nadaRodando } = require('../rodape');

const acoes = (s) => ({
  ...execucao(s),
  ...ambiente(s),
  ...plano(s),
  ...responder(s),
  ...publicar(s),
  ...massa(s),
  ...cenarios(s),
  ...conhecimentos(s)
});

module.exports = { acoes, botaoPlay, caixaAmbiente, nadaRodando };
