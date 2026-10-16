// @ts-check
// Execução viva: nesta janela (ativos), pausada (estado) ou em outra janela (pid da janela dona).
const maestro = require('../../painel/maestro');
const { estado } = require('../estado');

const ativos = new Set();
const pausado = (dir) => estado(dir).execucao === 'pausado';
const vivoPid = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
// Rodando: nesta janela (memória) ou em outra (estado com o pid da janela dona ainda vivo, ou claude com .ao-vivo.pid vivo).
const qaRodando = (dir) => rodando(dir); // html() tem uma variável local chamada rodando
const rodando = (dir) => {
  if (ativos.has(dir) || maestro.rodando(dir)) return true;
  const e = estado(dir);
  return e.execucao === 'rodando' && e.host !== process.pid && vivoPid(e.host);
};

module.exports = { ativos, pausado, vivoPid, qaRodando, rodando };
