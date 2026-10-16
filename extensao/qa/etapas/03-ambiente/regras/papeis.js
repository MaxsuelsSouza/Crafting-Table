// @ts-check
// Qual Comando das Configurações sobe a API e qual sobe o Metro (escolha por pontos).

const PAPEIS = {
  api: { nome: 'API', porta: 5111, espera: 240, pelo_nome: /\bapi\b|backend/i, pelo_cmd: /dotnet\s+(run|watch)|5111/i },
  metro: {
    nome: 'Metro',
    porta: 8081,
    espera: 120,
    pelo_nome: /\bmetro\b|bundler/i,
    pelo_cmd: /react-native\s+start|\bmetro\b|--port[=\s]+8081/i
  }
};
const pontos = (b, p) => (p.pelo_nome.test(b.nome) ? 2 : 0) + (p.pelo_cmd.test(b.comando || '') ? 1 : 0);
const papeisDe = (lista) =>
  Object.fromEntries(
    Object.entries(PAPEIS).map(([k, p]) => [
      k,
      lista
        .map((b) => [b, pontos(b, p)])
        .filter(([, n]) => n > 0)
        .sort((x, y) => y[1] - x[1])[0]?.[0] || null
    ])
  );

module.exports = { PAPEIS, pontos, papeisDe };
