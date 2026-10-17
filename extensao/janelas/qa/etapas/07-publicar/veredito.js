// @ts-check
// Nível do resultado, por regra (a IA do relatório justifica; você pode mudar com motivo, que fica em Decisões).
// Cenário: passou · passou com aviso (passou e tem aviso registrado) · falhou · não verificável · bloqueado/pendente (não concluído).
// Card:
//   nao-concluido           cenário pendente, executando ou bloqueado: ainda não dá para publicar
//   reprovado               algum cenário falhou
//   aprovado-com-ressalvas  nenhum falhou, mas há aviso, não verificável ou divergência do plano
//   aprovado                todos passaram, sem aviso
// Nível de um cenário: mora em infra/testes/nivel.js (o QA e a Implementação usam).
const { nivelCenario } = require('../../../../infra/testes');

const NIVEIS = {
  aprovado: '✅ Aprovado',
  'aprovado-com-ressalvas': '⚠️ Aprovado com ressalvas',
  reprovado: '❌ Reprovado',
  'nao-concluido': '⏳ Não concluído'
};
const ROTULO_CENARIO = {
  passou: '✅ Passou',
  'passou-com-aviso': '⚠️ Passou com aviso',
  falhou: '❌ Falhou',
  'nao-verificavel': '👁 Não verificável',
  bloqueado: '⛔ Bloqueado',
  pendente: '⏳ Pendente'
};

/** @param {any[]} lista cenários (.cenarios.json) @param {{ divergencias?: number }} [o] */
function veredito(lista, { divergencias = 0 } = {}) {
  const ativos = lista.filter((c) => !c.arquivado),
    n = ativos.map((c) => ({ id: c.id, nivel: nivelCenario(c) })),
    de = (x) => n.filter((c) => c.nivel === x).map((c) => c.id);
  const motivos = [];
  let nivel;
  if (!ativos.length) nivel = 'nao-concluido';
  else if (de('pendente').length || de('bloqueado').length) {
    nivel = 'nao-concluido';
    motivos.push(
      ...[
        de('pendente').length && `pendentes: ${de('pendente').join(', ')}`,
        de('bloqueado').length && `bloqueados: ${de('bloqueado').join(', ')}`
      ].filter(Boolean)
    );
  } else if (de('falhou').length) {
    nivel = 'reprovado';
    motivos.push(`falharam: ${de('falhou').join(', ')}`);
  } else if (de('passou-com-aviso').length || de('nao-verificavel').length || divergencias) {
    nivel = 'aprovado-com-ressalvas';
    if (de('passou-com-aviso').length) motivos.push(`com aviso: ${de('passou-com-aviso').join(', ')}`);
    if (de('nao-verificavel').length) motivos.push(`não verificáveis: ${de('nao-verificavel').join(', ')}`);
    if (divergencias) motivos.push(`${divergencias} divergência(s) do plano`);
  } else nivel = 'aprovado';
  if (de('passou').length && de('passou').length === n.length) motivos.push('todos os cenários passaram');
  return { nivel, rotulo: NIVEIS[nivel], motivos, publicavel: nivel !== 'nao-concluido', cenarios: n };
}

module.exports = { NIVEIS, ROTULO_CENARIO, nivelCenario, veredito };
