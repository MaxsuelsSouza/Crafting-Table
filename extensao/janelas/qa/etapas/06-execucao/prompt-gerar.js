// @ts-check
// Prompts do 6.0 Gerar: UMA sessão por card escreve tudo de uma vez (camadas, receita de massa, roteiros); a extensão executa sem IA.
// As correções (receita vazia, roteiro recusado, diagnóstico) voltam nesta mesma conversa (--resume): o contexto já está em cache.
const vagas = require('../../../../infra/agentes/etapas');
const ambientes = require('../../../../infra/ambientes');
const {
  SKILL,
  QA_STATE,
  REGRAS,
  citarRespostas,
  citarDossie,
  citarCodigo,
  citarConhecimentos
} = require('../../orquestrador/prompt-comum');
const { ROTEIRO, inicioTexto } = require('./prompt');

const HTTP =
  `- Cenário de API: etapas {"tipo":"http","nome":"<único>","metodo":"GET|POST|PUT|PATCH|DELETE","rota":"/api/…/\${VAR}","corpo":{…},"status":200,` +
  `"esperado":{"data.campo":<valor exato>|"*"},"salvar":{"VAR":"data.id"}}: a extensão faz o login da API (Bearer, matriculaUsuario, filial) e grava requisição e resposta. ` +
  'Valor de rota vindo de código bipado: já codificado (encodeURIComponent). Junte consultas antes/depois quando a API grava.\n';

/** cens: [{ c, exige }] dos cenários pendentes; banco: texto de orquestrador/banco.js */
const promptGerar = (chave, cens, amb, dir, banco) =>
  `[segundo plano · Crafting Table · QA de ${chave}] Prepare a execução de TODOS os cenários abaixo NESTA sessão (você escreve; a extensão executa sem você). ` +
  `Método: skill testes-funcionais; leia só o que precisar: ${SKILL()}/references/plano-para-suite.md (camadas) e ${SKILL()}/references/jornada-mobile-maestro.md (flows). ` +
  `NÃO execute os cenários.${vagas.aviso('qa.execucao')}${citarRespostas(dir)}${citarDossie(dir)}${citarCodigo(dir)}${citarConhecimentos()}\n\n` +
  `Ambiente já preparado: backend ${amb.backend || '?'} · mobile ${amb.mobile || '?'} · ref ${amb.ref || '?'} · ${ambientes.obter(amb.nome).texto(amb)}. ${ambientes.obter(amb.nome).guia()}. Banco: ${banco}.\n\n` +
  `Faça NESTA ORDEM e registre cada peça (o qa-state valida na hora; recusou, corrija e registre de novo):\n` +
  `1. CAMADAS: arquivo JSON { "cenarios": { "CT01": { "camada": "app|api|banco|nao-verificavel", "porque": "<1 frase>" } } } → ${QA_STATE} card <arquivo>. ` +
  'Escolha a camada mais barata que PROVA o cenário: banco (só consultas) < api (http) < app (emulador). app só quando o que se prova é a tela ou o fluxo do operador. ' +
  'nao-verificavel só com motivo concreto (falta ambiente, dado impossível).\n' +
  `2. RECEITA DE MASSA (o que cada cenário precisa no banco; a extensão roda as buscas sempre que precisar, sem você): arquivo JSON ` +
  '{ "papeis": [{ "papel": "<o que o registro é>", "cenarios": ["CT01"], "por_cenario": true, "busca": "SELECT <colunas com alias claro> FROM … WHERE <o estado que o cenário exige>", ' +
  '"produzir": { "base": "SELECT … (registros que podem virar a massa)", "chave": ["COL"], "sql": "UPDATE … SET … WHERE COL = ${COL}", "desfazer": "UPDATE … SET <valores originais> WHERE COL = ${COL}" } }], "dispensa": ["CT09"] } ' +
  `→ ${QA_STATE} receita <arquivo>. A extensão roda as buscas e devolve quantos registros cada uma acha e as colunas: as colunas viram \${COLUNA} nos roteiros. ` +
  'por_cenario true = um registro por cenário (o cenário consome); false = um registro para todos. produzir é opcional (só UPDATE, só se a busca puder vir vazia; o humano aprova); ${COL} sem aspas (a extensão põe). ' +
  'Busca que volta vazia: ajuste o filtro ou ponha produzir. Todo cenário entra num papel ou em dispensa.\n' +
  `3. ROTEIROS: um por cenário (menos nao-verificavel) → ${QA_STATE} roteiro <CT> <arquivo.json>.\n` +
  ROTEIRO({ id: '<CT>' }, amb, dir) +
  HTTP +
  inicioTexto(amb.nome) +
  '- Reaproveite: flows comuns em roteiros/comum/ (runFlow); o que descobrir (seletor, tela, endpoint, coluna) vai para os Conhecimentos.\n' +
  `4. TERMINE com um resumo de 1 linha por cenário (camada e o que o roteiro prova).\n\n` +
  cens
    .map(
      ({ c, exige }) =>
        `### ${c.id} · ${c.titulo}\n${c.texto}` +
        (c.instrucao ? `\nINSTRUÇÃO DO HUMANO: ${c.instrucao}` : '') +
        (exige.length ? `\nGrava em tabela (${exige.join(', ')}): consulta antes e depois obrigatória no roteiro.` : '')
    )
    .join('\n\n') +
  `\n\n${REGRAS}`;

// Correções na mesma conversa (--resume).
const promptFaltou = (ids) =>
  `Faltou registrar: ${ids.join(', ')}. Registre (card, receita ou roteiro, o que faltar) e TERMINE. Se um cenário não cabe em roteiro, marque nao-verificavel no card com o motivo.`;
const promptReceita = (problemas) =>
  `A receita de massa não resolveu:\n${problemas.map((p) => `- ${p}`).join('\n')}\n` +
  `Corrija a busca (ou acrescente produzir) e registre de novo com ${QA_STATE} receita <arquivo> (ele mostra quantos registros cada busca acha). TERMINE em seguida.`;
const promptRoteiro = (c, motivo) =>
  `O roteiro de ${c.id} não serviu: ${motivo}\nCorrija só o que falhou (flow, espera, consulta ou etapa http) e registre de novo com ${QA_STATE} roteiro ${c.id} <arquivo.json>. TERMINE em seguida.`;

module.exports = { promptGerar, promptFaltou, promptReceita, promptRoteiro };
