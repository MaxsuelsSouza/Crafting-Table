// @ts-check
// Modo refinamento no cabeçalho do ticket: botão ▶ ⏸ Dar início, pill e os controles da caixa Ao vivo.
const { IC } = require('../../../../componentes/icones');
const pill = require('../../../../componentes/pill');
const orq = require('../../orquestrador');

// O vigia do plugin sdd lê o mesmo estado (janelas/refinamento/estado.js): parado não acorda o Claude; rodando acorda a cada aprovação.
function botaoRefino(t, b) {
  const modo = t.refinamento?.estado;
  if (modo === 'aguardando_inicio')
    return t.specPronta
      ? `<button class="ct-dar" ${b('darInicio')} title="O Claude criou a spec: clique para ele começar os passos">Dar início</button>`
      : '<button class="ct-dar" disabled title="O Claude está criando a spec">Preparando…</button>';
  // "rodando" sem o Claude e sem ninguém esperando você é uma execução interrompida: o ▶ continua (mesmo comportamento da esteira).
  if (modo === 'rodando' && orq.situacao(t).parado)
    return `<button class="ct-ico ct-play" ${b('retomar')} title="O Claude não está rodando: continuar o refinamento de onde parou">${IC.play}</button>`;
  if (modo === 'rodando')
    return `<button class="ct-ico ct-pausa" ${b('pausar')} title="Pausar refinamento: o Claude para agora e a etapa recomeça ao retomar">${IC.pausa}</button>`;
  if (modo === 'pausado')
    return `<button class="ct-ico ct-play" ${b('retomar')} title="Retomar refinamento">${IC.play}</button>`;
  return `<button class="ct-ico ct-play" ${b('refinar')} title="${t.spec?.dir ? 'Continuar refinamento (spec)' : 'Iniciar refinamento (spec)'}">${IC.play}</button>`;
}
function pillRefino(t) {
  const modo = t.refinamento?.estado;
  const [texto, dica] =
    modo === 'aguardando_inicio'
      ? t.specPronta
        ? ['Spec pronta', 'Modo refinamento: o Claude criou a spec. Clique em Dar início para ele começar os passos.']
        : ['Preparando spec', 'Modo refinamento: o Claude está criando a spec no repositório de specs.']
      : modo === 'rodando' && orq.situacao(t).parado
        ? [
            'Parado',
            'O refinamento está ligado, mas o Claude não está rodando (execução interrompida). ▶ no topo continua de onde parou.'
          ]
        : modo === 'rodando'
          ? [
              'Refinando',
              'Modo refinamento: o Claude trabalha nos passos da spec e segue sozinho a cada aprovação. ⏸ no topo pausa.'
            ]
          : [
              'Refinamento pausado',
              'Modo refinamento pausado: o Claude parou e a etapa recomeça ao retomar. ▶ no topo retoma.'
            ];
  return pill.pill(texto, { cor: modo === 'pausado' ? 'pausada' : 'ia', dica, grande: true });
}
const modo = (chave, estado) => orq.mudarEstado(chave, estado);
// ⏸/▶ da caixa Ao vivo (os mesmos comandos do cabeçalho: os dois nunca discordam).
const controlesDe = (t) => ({
  pausar: 'pausar',
  dicaPausar: 'Pausar o refinamento: o Claude para agora e a etapa recomeça ao retomar',
  retomar: ['pausado'].includes(t.refinamento?.estado) || orq.situacao(t).parado ? 'retomar' : null,
  dicaRetomar: 'Continuar o refinamento de onde parou'
});

module.exports = { botaoRefino, pillRefino, modo, controlesDe };
