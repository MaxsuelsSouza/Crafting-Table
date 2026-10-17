// @ts-check
// Leitura dos cenários do plano em Markdown (CT01, Cenário 1, Exploratório 1…): o formato que o planejamento grava e o mapa lê.
// Usado pelo QA (janelas/qa/etapas/02-cenarios/regras/parser.js reexporta) e pela Implementação (teste na aplicação).
// Cada cenário: { id, titulo, resumo, texto, hash, criticidade, tipo }. criticidade (critica|alta|normal) e tipo (aceite|regressao|borda)
// vêm das linhas "Criticidade: …" e "Tipo: …" do corpo (METODO_ENTREGA); planos sem elas (os do QA) ficam normal/aceite.
const crypto = require('crypto');

const hashDe = (t) => crypto.createHash('sha1').update(t.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12);
// Início de cenário: título (#### CT01 – Validar …) ou linha só em negrito (**Cenário 1: …**, **Exploratório 2: …**).
// CT n / Cenário n / Caso de teste n → CTnn; Exploratório n → EXnn (fica no fim da fila, como no plano).
const INICIO =
  /^(?:(#{1,6})\s*|\*\*\s*)(?:\*\*)?\s*(CT-?\s*|cen[aá]rio\s+|caso\s+de\s+teste\s+|explorat[oó]rio\s+)(\d+)\b\s*[-–—:.]?\s*(.*?)\s*(?:\*\*)?\s*$/i;
const CRITICIDADES = ['critica', 'alta', 'normal'],
  TIPOS = ['aceite', 'regressao', 'borda'];
const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Valor de "Campo: valor" numa linha do corpo (negrito, lista e acento não importam); fora da lista → padrão.
function campo(linhas, nome, validos, padrao) {
  const re = new RegExp(`^${nome}\\s*:\\s*([a-z]+)`);
  for (const l of linhas) {
    const m = semAcento(l.replace(/[*_`]/g, '').replace(/^\s*[-•]\s*/, '').trim()).match(re);
    if (m) return validos.includes(m[1]) ? m[1] : padrao;
  }
  return padrao;
}
function cenariosDo(md) {
  const linhas = md.split('\n'),
    achados = [];
  linhas.forEach((l, i) => {
    const m = l.match(INICIO);
    if (m && (m[1] || l.trim().endsWith('**') || /^\*\*[^*]+\*\*/.test(l.trim())))
      achados.push({
        i,
        nivel: m[1]?.length || 0,
        id: `${/^explorat/i.test(m[2]) ? 'EX' : 'CT'}${m[3].padStart(2, '0')}`,
        titulo: m[4].replace(/\*\*$/, '').trim()
      });
  });
  return achados
    .map((a, k) => {
      // Corpo até o próximo cenário; título: até o próximo título de nível igual ou maior; negrito: até qualquer título ou ---.
      let fim = achados[k + 1]?.i ?? linhas.length;
      for (let j = a.i + 1; j < fim; j++) {
        const h = linhas[j].match(/^(#{1,6})\s/);
        if ((h && (!a.nivel || h[1].length <= a.nivel)) || (!a.nivel && /^\s*---+\s*$/.test(linhas[j]))) {
          fim = j;
          break;
        }
      }
      const corpo = linhas
        .slice(a.i + 1, fim)
        .join('\n')
        .trim();
      const gherkin = corpo
        .split('\n')
        .map((l) =>
          l
            .replace(/[*_`]/g, '')
            .replace(/^\s*[-•]\s*/, '')
            .trim()
        )
        .filter((l) => /^(dado|quando|então|entao|e)\b/i.test(l));
      return {
        id: a.id,
        titulo: a.titulo,
        resumo: gherkin.join(' · ').slice(0, 400),
        texto: corpo,
        hash: hashDe(a.titulo + corpo),
        criticidade: campo(corpo.split('\n'), 'criticidade', CRITICIDADES, 'normal'),
        tipo: campo(corpo.split('\n'), 'tipo', TIPOS, 'aceite')
      };
    })
    .filter((c, k, l) => l.findIndex((x) => x.id === c.id) === k);
}

module.exports = { INICIO, hashDe, cenariosDo, CRITICIDADES, TIPOS };
