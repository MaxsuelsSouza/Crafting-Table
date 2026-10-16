// @ts-check
// Decisões e falas do Claude: o pedido que vai em todo prompt, as linhas "DECISÃO:" e o modo de teste (Read/Bash viram decisão).
const { linhaFerramenta } = require('./textos');

// Fala do Claude: a primeira frase vira a linha; o texto inteiro fica no detalhe (passar o mouse).
// Decisões do Claude: toda execução em segundo plano recebe esta instrução; as linhas "DECISÃO: título | motivo" viram linha 'decisao' no Ao vivo,
// que o componente (ao-vivo.js) também grava na aba Decisões.
const PEDIDO_DECISAO = '\n\nDecisões: sempre que tomar uma decisão relevante (escolher entre alternativas, interpretar algo ambíguo, assumir uma premissa, desviar do pedido), escreva numa linha própria, no formato: DECISÃO: <título curto> | <o que decidiu, por quê e o que descartou>. Só decisões de verdade, não passos de rotina.';
const RE_DECISAO = /^\s*[*_`#>\s-]*DECIS[ÃA]O[*_`\s]*:[*_`\s]*(.+?)\s*$/i;
const decisao = (l) => { const [titulo, ...motivo] = l.split(/\s+[|—]\s+/); return { tipo: 'decisao', texto: titulo.replace(/[*`]/g, '').trim().slice(0, 120), detalhe: (motivo.join(' — ') || titulo).replace(/[*`]/g, '').trim().slice(0, 1500) }; };
const falas = (t) => {
  const ls = t.split('\n'), achadas = ls.map((l) => l.match(RE_DECISAO)?.[1]).filter(Boolean);
  const resto = ls.filter((l) => !RE_DECISAO.test(l)).join('\n').trim();
  return [...(resto ? [fala(resto)] : []), ...achadas.map(decisao)];
};
const fala = (t) => ({ tipo: 'fala', texto: (t.replace(/[*`#>]/g, '').split(/(?<=[.!?:])\s|\n/)[0] || t).trim().slice(0, 180), detalhe: t.slice(0, 2000) });

// MODO DE TESTE (ligado): todo arquivo que o Claude lê (Read) e todo comando que ele tenta rodar (Bash) vira uma decisão na aba Decisões, para conferir a
// ligação Ao vivo → Decisões sem depender de o modelo escrever "DECISÃO:". Desligue com CRAFTING_DECISOES_TESTE=0 no ambiente do VS Code.
const DECISOES_DE_TESTE = process.env.CRAFTING_DECISOES_TESTE !== '0';
const decisaoDeTeste = (c) => {
  const l = linhaFerramenta(c);
  if (!l || !DECISOES_DE_TESTE || !['Read', 'Bash'].includes(c.name)) return [l].filter(Boolean);
  return [{ ...l, tipo: 'decisao', detalhe: String(c.name === 'Read' ? c.input?.file_path : c.input?.command || l.texto).slice(0, 1500) }];
};

module.exports = { PEDIDO_DECISAO, RE_DECISAO, decisao, falas, fala, DECISOES_DE_TESTE, decisaoDeTeste };
