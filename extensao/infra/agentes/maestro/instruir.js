// @ts-check
// ⚡ Instrução direta: retoma a mesma sessão (--resume) com a mensagem e as opções da etapa; refaz uma vez a partida travada.
const { anotar, anexarConversa } = require('../../../componentes/ao-vivo'); // caixa "Ao vivo": o que o claude -p faz vai para lá
const { rodando, ultimas, reiniciando, rodandoEm } = require('./estado');
const { rodar } = require('./rodar');

// ⚡ Instrução direta: mata o claude -p desta pasta (se estiver rodando) e retoma a mesma sessão (--resume) com a mensagem, com as mesmas opções
// e o mesmo aoMudar da etapa, então o fim dela segue o fluxo normal do módulo. Só vale para execução desta janela (as opções ficam em memória).
const podeInstruir = (dir) => ultimas.has(dir);
// Partida travada: depois de uma retomada o claude pode não emitir nem o init (visto: 5 min mudo, a CLI só se reiniciou sozinha); sem saída em
// VIGIA_MS a retomada é refeita uma vez e o Ao vivo avisa.
const VIGIA_MS = Number(process.env.CRAFTING_VIGIA_MS) || 45000;
async function instruir(dir, texto, tentativa = 1) {
  const o = ultimas.get(dir);
  texto = String(texto || '').trim();
  if (!o || !texto) return false;
  const p = rodando.get(dir);
  if (p) {
    reiniciando.add(dir);
    await new Promise((ok) => { p.once('close', ok); p.kill('SIGTERM'); });
    reiniciando.delete(dir);
  } else if (rodandoEm(dir)) return false; // claude de outra janela: não dá para retomar daqui
  const ok = rodar(dir, { ...o, continuar: true, titulo: `${o.titulo || 'Claude trabalhando'} · instrução`,
    prompt: `Instrução direta do usuário, vale mais que o que você estava fazendo; atenda e depois retome a etapa de onde parou:\n${texto}` });
  ultimas.set(dir, o); // a próxima instrução parte das opções da etapa, não desta retomada
  if (!ok) return false;
  if (tentativa === 1) anotar(dir, { tipo: 'voce', texto });
  const novo = rodando.get(dir);
  setTimeout(() => {
    if (rodando.get(dir) !== novo || novo.viuSaida) return;
    if (tentativa === 1) { anotar(dir, { tipo: 'aviso', texto: 'O Claude não iniciou a tempo: tentando de novo' }); instruir(dir, texto, 2); }
    else anotar(dir, { tipo: 'aviso', texto: 'O Claude ainda não iniciou: pause e retome, ou recarregue a janela' });
  }, VIGIA_MS).unref?.();
  return true;
}

module.exports = { podeInstruir, VIGIA_MS, instruir };
