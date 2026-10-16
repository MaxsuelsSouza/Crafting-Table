// @ts-check

// Confere o contrato do plano (a extensão não confia na fala da IA): avisos, sem bloquear. Vira linha 'aviso' no Ao vivo.
const conferirPlano = (md) => [
  ...(/crit[ée]rios de aceite cobertos/i.test(md)
    ? []
    : ['O plano não tem a seção "Critérios de aceite cobertos" (rastreio critério → cenário)']),
  ...(/\b(aprovado|gerado|bruto|verbal|inferido)\b/i.test(md)
    ? []
    : ['O plano não diz a fonte e a confiança (aprovado, gerado, bruto, verbal, inferido) dos critérios'])
];

module.exports = { conferirPlano };
