// @ts-check
// Quais Comandos das Configurações sobem os papéis pedidos. Falta um obrigatório → { parou_em: 'comandos', falta: 'comandos', erro }.
// Usado por: infra/ambientes/{emulador,aparelho,web}/subir.js. ctx.comandos: { lista() → [{ nome, comando, pasta? }], rodar(nome) }.
const { PAPEIS, papeisDe } = require('./papeis');

/** @returns {{ achou: Record<string, any> } | { parou_em: string, falta: string, erro: string, fonte: string }} */
function acharComandos(ctx, vivo, obrigatorios, opcionais = []) {
  const lista = ctx.comandos?.lista() || [],
    achou = papeisDe(lista, [...obrigatorios, ...opcionais]);
  vivo(
    'acao',
    lista.length
      ? `Comandos nas Configurações: ${lista.map((b) => b.nome).join(', ')}`
      : 'Nenhum comando cadastrado em Configurações → Comandos'
  );
  const faltam = obrigatorios.filter((k) => !achou[k]);
  if (faltam.length) {
    const erro = `Falta comando em Configurações → Comandos para ${faltam.map((k) => PAPEIS[k].nome).join(' e ')}`;
    vivo('aviso', erro);
    return { parou_em: 'comandos', falta: 'comandos', erro, fonte: 'comandos' };
  }
  vivo('acao', `Suficiente: ${obrigatorios.map((k) => `${PAPEIS[k].nome} por “${achou[k].nome}”`).join(' e ')}`);
  return { achou };
}

module.exports = { acharComandos };
