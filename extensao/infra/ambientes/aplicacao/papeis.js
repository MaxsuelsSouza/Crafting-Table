// @ts-check
// Papéis da aplicação que um ambiente sobe pelos Comandos das Configurações: qual Comando sobe a API, o Metro, o app (Start) e o front web.
// Escolha por pontos: nome do botão (2) vale mais que o comando (1). `yarn/npm start` NÃO conta como Metro: no wms-mobile ele é
// `yarn android` (compila e instala o app), não o bundler; por isso o Start é papel à parte.
// Usado por: infra/ambientes/{emulador,aparelho,web}/subir.js e saude.js; QA (03-ambiente, 04-precondicao) e Incidentes (5.3) leem daqui.
// Uniu janelas/qa/etapas/03-ambiente/regras/papeis.js e a cópia de janelas/incidentes/etapas/05-reproducao/subetapas/5.3-ambiente.js.

const PAPEIS = {
  api: { nome: 'API', porta: 5111, espera: 240, pelo_nome: /\bapi\b|backend/i, pelo_cmd: /dotnet\s+(run|watch)|5111/i },
  metro: {
    nome: 'Metro',
    porta: 8081,
    espera: 120,
    pelo_nome: /\bmetro\b|bundler/i,
    pelo_cmd: /react-native\s+start|\bmetro\b|--port[=\s]+8081/i
  },
  start: {
    nome: 'Start',
    porta: 0, // pronto = app instalado no aparelho (não há porta)
    espera: 600,
    pelo_nome: /\bstart\b|\bandroid\b|\bapp\b/i,
    pelo_cmd: /(yarn|npm)\s+(run\s+)?(android|start)|run-android/i
  },
  // porta padrão; a real vem de craftingTable.webUrl (web/index.js)
  web: { nome: 'Web', porta: 9009, espera: 240, pelo_nome: /\bweb\b|front/i, pelo_cmd: /rspack|npm\s+run\s+dev|9009/i }
};
const pontos = (b, p) => (p.pelo_nome.test(b.nome) ? 2 : 0) + (p.pelo_cmd.test(b.comando || '') ? 1 : 0);
/** O Comando de mais pontos para o papel, ou null. */
const comandoDo = (lista, p) =>
  lista
    .map((b) => [b, pontos(b, p)])
    .filter(([, n]) => n > 0)
    .sort((x, y) => y[1] - x[1])[0]?.[0] || null;
/** { api: Comando|null, metro: Comando|null, ... } só com as chaves pedidas (padrão: API e Metro, como o QA sempre usou). */
const papeisDe = (lista, chaves = ['api', 'metro']) => Object.fromEntries(chaves.map((k) => [k, comandoDo(lista, PAPEIS[k])]));

module.exports = { PAPEIS, pontos, comandoDo, papeisDe };
