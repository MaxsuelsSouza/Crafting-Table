// @ts-check
const aoVivo = require('./ao-vivo');

// Componente "Aba Central": a aba do menu do ticket que todo módulo tem. "Central" é um nome genérico: o id é 'central' e o nome
// mostrado no menu é livre (cada módulo escolhe como chamar). Por padrão traz só a caixa "Ao vivo"
// (componentes/ao-vivo.js); cada módulo pode acrescentar o que for dele antes ou depois, mas a caixa não sai.
// Para usar: corpo(dir, rodando, alvo, controles) no corpoAba (painel.js). CSS e script já vêm do ao-vivo (moldura.js).
//   dir: pasta da aba do ticket (pastaAba) · rodando: o Claude está trabalhando · alvo: nome do módulo para o Ver tudo/Recolher
//   controles: ver ao-vivo.js (pausar, retomar, conversa)
const corpo = (dir, rodando, alvo, controles) => aoVivo.caixa(dir, rodando, alvo, { conversa: true, ...controles })
  || '<div class="folha"><div class="vazio-aba">Nada ao vivo ainda.</div></div>';

module.exports = { corpo };
