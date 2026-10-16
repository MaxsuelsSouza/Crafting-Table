// @ts-check
// Estado mutável comum a todo o orquestrador: os serviços do painel (`s`, recebidos em iniciar), os cards em alteração e as
// respostas ainda não entregues ao Claude. `s` repassa ao objeto de serviços atual, então quem usa escreve s.render(), s.gravar()…
let atual;
/** @type {any} */
const s = new Proxy({}, { get: (_, k) => atual?.[k] });
const usar = (servicos) => {
  atual = servicos;
};
const alterando = new Set();
const respondidas = []; // respostas ainda não entregues ao Claude

module.exports = { s, usar, alterando, respondidas };
