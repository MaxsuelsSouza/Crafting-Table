// @ts-check
const aoVivo = require('../../../componentes/ao-vivo');
const { estado, mudar } = require('../../estado');
const { cenarios } = require('../02-cenarios/mapa');
const { iniciarCenario, concluirCenario, bloquearSemMassa } = require('../06-execucao/cenario');

// Desistência da massa de um cenário (fase 2 sem UPDATE possível): fica bloqueado com a nota e a fila segue para o próximo; não pausa o QA.
function desistirMassa(dir, id, nota) {
  const c = cenarios(dir).cenarios.find((x) => x.id === id);
  mudar(dir, { massaDesfecho: { ...estado(dir).massaDesfecho, [id]: { tipo: 'desistiu', nota } } });
  if (!c || !['pendente', 'desatualizado'].includes(c.status)) return;
  iniciarCenario(dir, id, null);
  concluirCenario(dir, id, 'sem-massa', nota);
  bloquearSemMassa(dir, id, `Sem massa: ${nota}`);
  aoVivo.anotar(dir, { tipo: 'aviso', texto: `${id} bloqueado sem massa (${nota}): seguindo para o próximo` });
}

module.exports = { desistirMassa };
