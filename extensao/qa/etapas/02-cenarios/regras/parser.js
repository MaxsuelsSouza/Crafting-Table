// @ts-check
// Leitura dos cenários do plano em Markdown (CT01, Cenário 1, Exploratório 1…): o formato que o planejamento grava e o mapa lê.
const crypto = require('crypto');

const hashDe = (t) => crypto.createHash('sha1').update(t.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12);
// Início de cenário: título (#### CT01 – Validar …) ou linha só em negrito (**Cenário 1: …**, **Exploratório 2: …**).
// CT n / Cenário n / Caso de teste n → CTnn; Exploratório n → EXnn (fica no fim da fila, como no plano).
const INICIO =
  /^(?:(#{1,6})\s*|\*\*\s*)(?:\*\*)?\s*(CT-?\s*|cen[aá]rio\s+|caso\s+de\s+teste\s+|explorat[oó]rio\s+)(\d+)\b\s*[-–—:.]?\s*(.*?)\s*(?:\*\*)?\s*$/i;
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
        hash: hashDe(a.titulo + corpo)
      };
    })
    .filter((c, k, l) => l.findIndex((x) => x.id === c.id) === k);
}

module.exports = { INICIO, hashDe, cenariosDo };
