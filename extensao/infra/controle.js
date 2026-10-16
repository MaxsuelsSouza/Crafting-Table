// @ts-check
// Controle de rodada das esteiras (Incidentes, Implementações, Refinamento): cada partida (Iniciar/Continuar/Retomar) abre uma rodada nova
// e Pausar cancela a atual. Quem está no meio da cadeia confere `valida` entre os passos e para sem marcar erro. Em memória: vale nesta janela.
// Sem rodada informada (testes, chamadas diretas) tudo vale.
const rodadas = new Map(); // pasta da aba -> número da rodada vigente
const CANCELADO = 'rodada-cancelada';
const nova = (dir) => { const n = (rodadas.get(dir) || 0) + 1; rodadas.set(dir, n); return n; };
const cancelar = nova; // pausar = abrir uma rodada que ninguém segue: as cadeias antigas deixam de valer
const valida = (dir, n) => n === undefined || rodadas.get(dir) === n;
module.exports = { nova, cancelar, valida, CANCELADO };
