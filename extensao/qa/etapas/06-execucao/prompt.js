// @ts-check
const vagas = require('../../../infra/agentes/etapas');
const { SKILL, QA_STATE, REGRAS, citarRespostas, citarDossie } = require('../../orquestrador/prompt-comum');

const promptCenario = (chave, c, amb, itens, dir = '', exige = []) =>
  `[segundo plano · Crafting Table · QA de ${chave}] Execute SÓ o cenário ${c.id} do planejamento de QA, ` +
  `seguindo o método da skill testes-funcionais (${SKILL()}/SKILL.md).${vagas.aviso('qa.execucao')}${citarRespostas(dir)}${citarDossie(dir)}\n\nCenário ${c.id} · ${c.titulo}\n${c.texto}\n\n` +
  (c.instrucao ? `INSTRUÇÃO DO HUMANO para esta nova tentativa (siga): ${c.instrucao}\n\n` : '') +
  `Ambiente já preparado (não rode preparar-ambiente): backend ${amb.backend || '?'} · mobile ${amb.mobile || '?'} · ref ${amb.ref || '?'} · API http://localhost:5111 · Metro 8081 · emulador ligado.\n` +
  `Massa válida para este cenário: ${itens.length ? JSON.stringify(itens.map((i) => ({ id: i.id, papel: i.papel, dados: i.dados }))) : 'nenhuma registrada'}. ` +
  `Use SÓ essa massa (a da Etapa 4): nunca procure nem registre massa nova (massa add é recusado aqui). Antes de usar, confira que o registro ainda está no estado esperado; ` +
  `se não estiver, ${QA_STATE} massa <ID> invalida e use outro item válido da lista; se não houver outro, NÃO falhe o cenário: conclua com --status sem-massa --nota "<o que mudou no registro>" ` +
  `(a extensão refaz o levantamento e volta aqui). Cenário que não precisa de massa segue sem ela. ` +
  `Se o cenário alterar o registro, ${QA_STATE} massa <ID> consumida.\n` +
  `Evidências (OBRIGATÓRIAS para passou: a extensão recusa passou sem ao menos um arquivo anexado): a tela do emulador já está sendo gravada; anexe também prints e arquivos de resultado (log Robot, junit, relatório): ${QA_STATE} evidencia ${c.id} <arquivo...>.\n` +
  (exige.length
    ? `Este cenário exercita gravação em tabela (${exige.join(', ')}) da implementação: anexe a consulta SQL (arquivo .sql com o nome da tabela) e o resultado dela (arquivo resultado-<tabela>.txt ou .csv), consultando só por SELECT.\n`
    : '') +
  `OBRIGATÓRIO ao final: ${QA_STATE} cenario ${c.id} concluir --status passou|falhou|sem-massa --nota "<1 frase: o que foi visto>". ${REGRAS}`;

module.exports = { promptCenario };
