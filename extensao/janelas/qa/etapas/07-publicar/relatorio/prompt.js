// @ts-check
// Prompt do relatório (Etapa 7): a IA escreve o texto no formato do moldes/relatorio-qa.md da skill, em cima dos dados que a extensão
// montou (relatorio-dados.json). Na conversa do 6.0 Gerar (--resume) quando existe: ela já conhece o card, a massa e os roteiros.
const path = require('path');
const { areaIA } = require('../../../../../infra/agentes/area-ia');
const { SKILL, QA_STATE, REGRAS } = require('../../../orquestrador/prompt-comum');

const promptRelatorio = (chave, dir, dadosArq, v) =>
  `[segundo plano · Crafting Table · QA de ${chave}] A execução terminou. Escreva o RELATÓRIO DO QA para quem valida (QA/PO), em Markdown, ` +
  `seguindo o molde ${SKILL()}/moldes/relatorio-qa.md (leia o molde; não precisa reler o método).\n` +
  `Dados da execução (fonte única, não invente nada fora dele; abra as evidências citadas lá quando precisar): ${dadosArq}\n` +
  `Nível calculado pela regra: ${v.rotulo}${v.motivos.length ? ` (${v.motivos.join('; ')})` : ''}.\n\n` +
  'O relatório tem, nesta ordem:\n' +
  '- Resultado geral em uma frase e "Como validar".\n' +
  '- Procedência (tabela: backend e mobile com sha, app, banco, executor e horário).\n' +
  '- Resumo (tabela: cenário com o título literal do plano, camada, resultado, evidência principal).\n' +
  '- Um bloco por cenário: o plano pede · massa (o registro; se foi MANIPULADA por SQL, o que mudou e se foi revertido) · execução (os passos que a jornada fez) · ' +
  'observado (o fato, com os números) · o que conferir no vídeo/prints (o momento que prova) · evidência (nomes EXATOS dos arquivos da lista "arquivos") · resultado e ressalva.\n' +
  '- Achados: divergências entre plano e código, comportamento estranho que não reprova, problema de ambiente; cada um com evidência e quem age.\n' +
  '- Escritas no banco (revertidas e as que ficam até o refresh) e o que não foi coberto, com o motivo.\n\n' +
  `Passou mas tem algo a conferir? Registre o aviso no cenário: ${QA_STATE} aviso <CT> --nota "<o quê>" (vira "passou com aviso").\n` +
  `Grave o texto em ${path.join(areaIA(dir), 'relatorio-qa.md')} e registre: ${QA_STATE} relatorio <arquivo.md> --nivel aprovado|aprovado-com-ressalvas|reprovado ` +
  '--porque "<1 frase: por que este nível>" [--divergencias <quantas divergências do plano você achou>]. O qa-state confere os arquivos citados; corrija se ele apontar algum. ' +
  `Não ponha o nível no texto (a extensão põe no topo, com a sua aprovação). TERMINE em seguida.\n${REGRAS}`;

module.exports = { promptRelatorio };
