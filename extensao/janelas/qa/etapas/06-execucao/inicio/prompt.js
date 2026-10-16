// @ts-check
// Prompt do flow padrão de início: a IA escreve uma vez (para todos os tickets) o inicio.yaml e o voltar-inicio.yaml.
const path = require('path');
const { areaIA } = require('../../../../../infra/agentes/area-ia');
const { QA_STATE, REGRAS, citarConhecimentos } = require('../../../orquestrador/prompt-comum');

const pastaInicio = (dir) => path.join(areaIA(dir), 'inicio');

const promptInicio = (chave, amb, dir, tela) =>
  `[segundo plano · Crafting Table · QA de ${chave}] Escreva os DOIS flows Maestro que todo teste do app usa para começar (valem para todos os tickets):\n` +
  `1. ${path.join(pastaInicio(dir), 'inicio.yaml')}: abre o app do zero (launchApp com clearState), faz login com \${MATRICULA} e \${SENHA}, ` +
  `escolhe a filial \${FILIAL} se o app pedir (dropdown ou lista: toque no campo, espere a lista, toque no item; trate a lista que demora a carregar com extendedWaitUntil) ` +
  `e TERMINA com assertVisible de um elemento que só existe na tela de início${tela ? ` ("${tela}")` : ' (a primeira tela depois do login, o menu principal)'}.\n` +
  `2. ${path.join(pastaInicio(dir), 'voltar-inicio.yaml')}: a partir de qualquer tela do app JÁ LOGADO, volta para a tela de início sem login (back até ela, ou o atalho do app), ` +
  'e termina com o MESMO assertVisible. Não use clearState nem launchApp com stopApp.\n' +
  `Cabeçalho dos dois: appId: \${APP_ID}. MATRICULA, SENHA, APP_ID e FILIAL chegam por -e: não declare env: no cabeçalho. name: sem " < > : | ? *.\n` +
  `App: mobile ${amb.mobile || '?'} · emulador ligado · API http://localhost:5111. Ache os seletores lendo o código do mobile (testID, texto) e, se precisar, ` +
  'maestro hierarchy no emulador. Prefira id/testID a texto. Seletor confirmado vai para os Conhecimentos (tipo seletor).\n' +
  `Quando os dois estiverem prontos: ${QA_STATE} inicio <inicio.yaml> <voltar-inicio.yaml> e TERMINE. A extensão roda os dois no emulador; se falhar, ` +
  `ela volta nesta mesma conversa com o erro para você corrigir.${tela ? '' : ` Registre também o nome da tela: ${QA_STATE} inicio-tela "<nome da tela>".`}` +
  `${citarConhecimentos()}\n${REGRAS}`;

const promptCorrigirInicio = (erro) =>
  `A extensão rodou os flows de início e falhou:\n${erro}\nCorrija o(s) flow(s) (mesmos caminhos) e registre de novo com o mesmo comando qa-state inicio. TERMINE em seguida.`;

module.exports = { promptInicio, promptCorrigirInicio, pastaInicio };
