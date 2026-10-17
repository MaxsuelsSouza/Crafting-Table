// @ts-check
// Prompts da Etapa 6: 6.1 (o Claude escreve o roteiro do cenário; a extensão roda) e 6.3 (diagnóstico de uma jornada que falhou).
const path = require('path');
const vagas = require('../../../../infra/agentes/etapas');
const { areaIA } = require('../../../../infra/agentes/area-ia');
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

// Com os flows de início validados (aba Conhecimentos), o roteiro começa na tela de início: sem launchApp nem login.
const inicioTexto = (nome = 'emulador') => {
  const k = require('../../conhecimentos');
  return k.flow(`${nome}:inicio`)
    ? `TELA DE INÍCIO: antes do seu roteiro a extensão já deixa o app logado na tela de início (${k.ler().telaInicio || 'menu principal'}). ` +
        'Seus flows começam DALI: NÃO escreva launchApp, clearState, login nem escolha de filial.\n'
    : '';
};

const massaTexto = (itens) =>
  itens.length
    ? JSON.stringify(itens.map((i) => ({ id: i.id, papel: i.papel, dados: i.dados })))
    : 'nenhuma registrada';

const ROTEIRO = (c, amb, dir) =>
  `ROTEIRO (JSON) que a extensão executa sem você: { "descricao": "<1 frase: o que o roteiro faz e o que prova>", "variaveis": {"NOME": "\${CHAVE_DA_MASSA}"}, "etapas": [ ` +
  `{"tipo":"flow","arquivo":"<flow.yaml relativo ao JSON>","env":{"K":"V"}} | {"tipo":"bipe","codigo":"\${CODIGO}","segundos":1} | {"tipo":"espera","segundos":2} | ` +
  `{"tipo":"consulta","nome":"antes","sql":"SELECT … WHERE k = :k ORDER BY 1","binds":{"k":"\${CODIGO}"}} | ` +
  `{"tipo":"consulta","nome":"depois","sql":"<a MESMA consulta>","binds":{…},"comparar_com":"antes","esperado":"igual|diferente"} ] }.\n` +
  `- Escreva o JSON e os flows Maestro em ${path.join(areaIA(dir || '.'), 'roteiros', c.id)}/; subflows da skill (login, bipar, voltar-para-bipe) em ${amb.mobile ? path.join(amb.mobile, '.maestro', 'subflows') : '<mobile>/.maestro/subflows'} (runFlow com caminho relativo ao flow).\n` +
  `- Os dados da massa entram como \${CHAVE} (as chaves de "dados"): nunca crave ID no roteiro nem no flow. MATRICULA, SENHA e APP_ID chegam por -e: não declare env: no cabeçalho do flow; name: sem " < > : | ? *.\n` +
  `- Cada estado que o cenário assere: assertVisible/assertNotVisible + takeScreenshot "${c.id}-<momento>". Efeito no banco (ou "não grava") = a mesma consulta antes e depois com comparar_com. Consulta só SELECT.\n` +
  `- O roteiro tem que conseguir REPROVAR: o resultado esperado do cenário vira assert no flow ou comparação de consulta, não só navegação.\n`;

const promptCenario = (chave, c, amb, itens, dir = '', exige = []) =>
  `[segundo plano · Crafting Table · QA de ${chave}] Prepare o ROTEIRO do cenário ${c.id} do planejamento de QA, ` +
  `seguindo o método de jornada da skill testes-funcionais (leia SÓ ${SKILL()}/references/jornada-mobile-maestro.md; o SKILL.md inteiro não é preciso). NÃO execute a jornada: ` +
  `a extensão roda o roteiro (Maestro, bipe, consultas), grava o vídeo e anexa as evidências.${vagas.aviso('qa.execucao')}${citarRespostas(dir)}${citarDossie(dir)}${citarCodigo(dir)}${citarConhecimentos()}\n\n` +
  `Cenário ${c.id} · ${c.titulo}\n${c.texto}\n\n` +
  (c.instrucao ? `INSTRUÇÃO DO HUMANO para esta nova tentativa (siga): ${c.instrucao}\n\n` : '') +
  `Ambiente já preparado (não rode preparar-ambiente): backend ${amb.backend || '?'} · mobile ${amb.mobile || '?'} · ref ${amb.ref || '?'} · ${ambientes.obter(amb.nome).texto(amb)}. ` +
  `${ambientes.obter(amb.nome).guia()}, sem executar o cenário.\n` +
  inicioTexto(amb.nome) +
  `Massa válida para este cenário: ${massaTexto(itens)}. ` +
  `Use SÓ essa massa (a da Etapa 4): nunca procure nem registre massa nova (massa add é recusado aqui). A extensão já validou no banco que o registro existe (Validar massa); confira só o que a consulta não cobre (o estado que o cenário exige); ` +
  `se não estiver, ${QA_STATE} massa <ID> invalida e use outro item válido da lista; se não houver outro, NÃO falhe o cenário: conclua com --status sem-massa --nota "<o que mudou no registro>" ` +
  `(a extensão refaz o levantamento e volta aqui). Cenário que não precisa de massa segue sem ela. ` +
  `Se o cenário alterar o registro, ${QA_STATE} massa <ID> consumida.\n\n` +
  ROTEIRO(c, amb, dir) +
  (exige.length
    ? `- Este cenário exercita gravação em tabela (${exige.join(', ')}) da implementação: o roteiro PRECISA ter a consulta dessa tabela antes e depois (vira a evidência OBRIGATÓRIA).\n`
    : '') +
  `\nRegistre: ${QA_STATE} roteiro ${c.id} <arquivo.json> (valida na hora com a massa; se recusar, corrija e registre de novo) e TERMINE.\n` +
  `Só se o cenário não cabe num roteiro (só API/Robot, sem tela nem banco): execute você mesmo; evidências OBRIGATÓRIAS para passou (${QA_STATE} evidencia ${c.id} <arquivo...>) e ` +
  `${QA_STATE} cenario ${c.id} concluir --status passou|falhou|sem-massa --nota "<1 frase: o que foi visto>". ${REGRAS}`;

// 6.3: a jornada falhou. De que lado está a falha (RV-7): código → falhou; massa → sem-massa; roteiro → refazer (a extensão pede outro roteiro uma vez).
const promptDiagnostico = (chave, c, amb, itens, dir, pasta, detalhes) =>
  `[segundo plano · Crafting Table · QA de ${chave}] A jornada do cenário ${c.id} (roteiro executado pela extensão) FALHOU. Diga de que lado está a falha, sem executar o cenário de novo.\n\n` +
  `Cenário ${c.id} · ${c.titulo}\n${c.texto}\n\n` +
  `O que a jornada registrou:\n${detalhes.join('\n')}\n\n` +
  `Evidências da execução (roteiro.json, jornada.txt, saída e junit de cada flow, consulta-*.txt, prints, vídeo): ${pasta}. Mobile ${amb.mobile || '?'} · backend ${amb.backend || '?'}. ` +
  `Massa usada: ${massaTexto(itens)}. Pode ler o código e consultar o banco (só SELECT) para decidir.${citarRespostas(dir)}${citarCodigo(dir)}${citarConhecimentos()}\n\n` +
  `Decida UMA e TERMINE:\n` +
  `- o app/a API não fez o que o cenário espera (defeito do código): ${QA_STATE} cenario ${c.id} concluir --status falhou --nota "<o que era esperado × o que aconteceu, com a evidência>"\n` +
  `- a massa não serve mais (registro mudou): ${QA_STATE} massa <ID> invalida e ${QA_STATE} cenario ${c.id} concluir --status sem-massa --nota "<o que mudou>"\n` +
  `- o problema é do roteiro (seletor, espera curta, consulta ou comparação erradas): ${QA_STATE} roteiro ${c.id} refazer --nota "<o que corrigir>"\n` +
  `- não dá para decidir pelas fontes: ${QA_STATE} pausa (pergunta ao humano).\n${REGRAS}`;

// Resposta do humano à pergunta feita no roteiro: continua a MESMA sessão (--resume), que já tem o método e o que descobriu.
const promptContinuar = (c, resposta) =>
  `O humano respondeu à sua pergunta sobre o cenário ${c.id}: ${resposta}\n` +
  `Continue de onde parou: registre o roteiro com ${QA_STATE} roteiro ${c.id} <arquivo.json> (o cenário foi reaberto) e TERMINE. ` +
  `Se ainda faltar algo que só o humano sabe, pergunte de novo com ${QA_STATE} pausa.`;

module.exports = { promptCenario, promptDiagnostico, promptContinuar, massaTexto, ROTEIRO, inicioTexto };
