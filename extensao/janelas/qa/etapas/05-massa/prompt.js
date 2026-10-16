// @ts-check
const vagas = require('../../../../infra/agentes/etapas');
const {
  SKILL,
  QA_STATE,
  REGRAS,
  citarRespostas,
  citarDossie,
  citarConhecimentos
} = require('../../orquestrador/prompt-comum');

const MASSA_BUSCA_MIN = 5;
// direto: o banco vem pelo MCP do SQLcl e a IA faz o UPDATE (sempre com WHERE pela chave) ela mesma; sem isso, propõe e o humano aprova.
const DIRETO = (q) =>
  'Faça você mesmo, pelo MCP sqlcl: leia por SELECT os valores originais do registro, rode UM UPDATE por chamada com WHERE pela chave (nunca sem WHERE; INSERT e DELETE são recusados), ' +
  `depois COMMIT, confira por SELECT que o registro ficou como o cenário precisa e registre: ${q} massa add --papel "<papel>" --cenarios CT01 --dados '<json do registro como ficou>' ` +
  '--consulta "<SELECT que acha este registro>" --desfazer "<UPDATE que devolve os valores originais>". Mexa no mínimo de registros e nunca em registro que outro cenário usa. ';
const promptMassa = (
  chave,
  cens,
  dir = '',
  banco = '',
  mapa = '',
  escreve = false,
  naAba = [],
  fase = '',
  direto = false
) =>
  `[segundo plano · Crafting Table · QA de ${chave}] Levante a massa de dados para estes cenários, seguindo o método ` +
  `de massa da skill testes-funcionais (do ${SKILL()}/SKILL.md leia SÓ o trecho de massa: Grep -n "massa" e leia as linhas em volta, não o arquivo inteiro; consultas só de leitura na cópia de produção):${vagas.aviso('qa.execucao')}${citarRespostas(dir)}${citarDossie(dir)}${citarConhecimentos()}\n` +
  `Banco: ${banco || 'NÃO configurado: não consulte banco; registre como pendência'}${mapa ? `. Consulte SOMENTE por ${mapa}/bin/mapa-db (SELECT, máx. 50 linhas, colunas sensíveis mascaradas)` : ''}. Junte as perguntas ao banco: uma consulta que traz candidatos e o estado deles vale mais que várias pequenas.\n` +
  (fase === 'buscar'
    ? `FASE 1 · BUSCA (só leitura, no máximo ${MASSA_BUSCA_MIN} minutos): ache registros que sirvam; NÃO proponha alteração de banco agora. Cenário que não precisa de massa: ${QA_STATE} massa dispensa --cenarios CT01. Não achou: termine sem registrar (a fase 2 tenta produzir a massa).\n`
    : '') +
  (fase === 'produzir' && direto
    ? `FASE 2 · PRODUZIR A MASSA: a busca não achou registro para estes cenários. Produza a massa ajustando um registro existente SÓ por UPDATE. ${DIRETO(QA_STATE)}` +
      `Se o UPDATE não for possível (falta registro-base, regra de negócio, risco), DESISTA: ${QA_STATE} massa desistir --cenarios CT01 --nota "<por quê>". Cenário que não precisa de massa: ${QA_STATE} massa dispensa --cenarios CT01. TERMINE em seguida.\n`
    : '') +
  (fase === 'produzir' && !direto
    ? `FASE 2 · PRODUZIR A MASSA: a busca não achou registro para estes cenários. Produza a massa ajustando um registro existente SÓ por UPDATE: leia antes, por SELECT, os valores originais e PROPONHA com ${QA_STATE} massa proposta --papel "<papel>" --cenarios CT01 ` +
      `--dados '<json do registro que vai ficar>' --sql "<UPDATE ... WHERE <chave>>" --desfazer "<UPDATE que devolve os valores originais>" --porque "<por que esse ajuste>" (INSERT e DELETE são recusados nesta fase). ` +
      'Você NÃO executa escrita: o humano lê e aprova. Mexa no mínimo de registros e nunca em registro que outro cenário usa. ' +
      `Se o UPDATE não for possível (falta registro-base, regra de negócio, risco), DESISTA: ${QA_STATE} massa desistir --cenarios CT01 --nota "<por quê>"; o QA segue para o próximo cenário. Cenário que não precisa de massa: ${QA_STATE} massa dispensa --cenarios CT01. TERMINE em seguida.\n`
    : fase === 'produzir'
      ? ''
      : escreve && direto
        ? `Se não existir registro que sirva, MONTE a massa ajustando um registro existente por UPDATE. ${DIRETO(QA_STATE)}\n`
        : escreve
          ? `Se não existir registro que sirva, MONTE a massa ajustando os dados: leia antes, por SELECT, os valores originais e PROPONHA o lote com ${QA_STATE} massa proposta --papel "<papel>" --cenarios CT01 ` +
            `--dados '<json do registro que vai ficar>' --sql "<INSERT/UPDATE/DELETE separados por ;>" --desfazer "<instruções que devolvem os valores originais>" --porque "<por que esse ajuste>". ` +
            'Você NÃO executa escrita: a extensão roda o lote depois que o humano ler e aprovar; proposta recusada ou sem WHERE por chave volta com o motivo. TERMINE em seguida. ' +
            'Mexa no mínimo de registros e nunca em registro que outro cenário usa.\n'
          : '') +
  cens.map((c) => `- ${c.id} · ${c.titulo}${c.resumo ? ` (${c.resumo})` : ''}`).join('\n') +
  (naAba.length
    ? `\nJá válidos na aba Massa (NÃO consulte nem registre de novo estes registros; escolha outros): ${JSON.stringify(naAba.map((i) => ({ id: i.id, papel: i.papel, cenarios: i.cenarios })))}.`
    : '') +
  `\nPara cada papel encontrado: ${QA_STATE} massa add --papel "<papel>" --cenarios CT01,CT02 --dados '<json com os campos>' --consulta "<SQL usado>". ` +
  'Traga 2 registros por papel quando der (reserva: um cenário pode consumir o registro). Cenário que não precisa de massa: não registre nada. ' +
  `Se o banco não responder, termine dizendo isso. ${REGRAS}`;
module.exports = { MASSA_BUSCA_MIN, promptMassa };
