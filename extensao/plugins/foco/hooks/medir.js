// PostToolUse (Write/Edit): mede o .md/.txt que o Claude acabou de gravar e, se passou dos limites, devolve
// (código 2 → o Claude lê) o que enxugar, com exemplos. Limites em ../limites.json. No máximo N avisos por
// arquivo por sessão, para não virar laço. Qualquer erro sai em silêncio (nunca atrapalha a gravação).
const fs = require('fs');
const os = require('os');
const path = require('path');

const ENCHIMENTO = /\b(vale (?:ressaltar|destacar|lembrar|mencionar)|é importante (?:notar|destacar|ressaltar|mencionar)|cabe (?:ressaltar|destacar)|este documento (?:tem como objetivo|visa|apresenta|descreve)|neste documento|em suma|de (?:forma|modo|maneira) geral|basicamente|como (?:mencionado|dito) anteriormente|conforme (?:mencionado|citado) anteriormente|é válido (?:ressaltar|destacar))\b/gi;

// Parágrafos de prosa: blocos de linhas seguidas que não são título, lista, tabela, citação nem código.
function paragrafos(texto) {
  const blocos = [];
  let atual = [], codigo = false;
  const fecha = () => { if (atual.length) blocos.push(atual.join(' ')); atual = []; };
  for (const l of texto.split('\n')) {
    if (/^\s*(```|~~~)/.test(l)) { codigo = !codigo; fecha(); continue; }
    if (codigo || !l.trim() || /^\s*(#|\||[-*+]\s|\d+[.)]\s|>|<!--)/.test(l)) { fecha(); continue; }
    atual.push(l.trim());
  }
  fecha();
  return blocos;
}
const palavras = (t) => (t.match(/\S+/g) || []).length;
const inicio = (t, n = 9) => t.split(/\s+/).slice(0, n).join(' ') + '…';

function medir(arquivo, texto, limites) {
  const achados = [];
  const nome = path.basename(arquivo);
  const maxLinhas = limites.linhas[nome] ?? limites.linhas.padrao;
  const linhas = texto.split('\n').length;
  if (linhas > maxLinhas) achados.push(`${linhas} linhas (limite ${maxLinhas} para ${nome}): corte o que não muda decisão e troque prosa por tabela/lista.`);
  const ps = paragrafos(texto);
  const longos = ps.filter((p) => palavras(p) > limites.palavrasPorParagrafo);
  if (longos.length) achados.push(`${longos.length} parágrafo(s) com mais de ${limites.palavrasPorParagrafo} palavras — quebre em lista. Ex.: "${inicio(longos[0])}" (${palavras(longos[0])} palavras)`);
  const frases = ps.flatMap((p) => p.split(/(?<=[.!?;])\s+/)).filter((f) => palavras(f) > limites.palavrasPorFrase);
  if (frases.length) achados.push(`${frases.length} frase(s) com mais de ${limites.palavrasPorFrase} palavras. Ex.: "${inicio(frases[0])}"`);
  const enchimento = [...new Set((texto.match(ENCHIMENTO) || []).map((x) => x.toLowerCase()))];
  if (enchimento.length) achados.push(`expressões de enchimento: ${enchimento.slice(0, 5).map((x) => `"${x}"`).join(', ')} — apague e diga direto.`);
  const contagem = {};
  for (const l of texto.split('\n').map((x) => x.trim()).filter((x) => x.length > 40 && !/^\|?[\s:|-]+\|?$/.test(x))) contagem[l] = (contagem[l] || 0) + 1;
  const repetidas = Object.entries(contagem).filter(([, n]) => n >= 3);
  if (repetidas.length) achados.push(`${repetidas.length} linha(s) repetida(s) 3+ vezes (ex.: "${inicio(repetidas[0][0])}") — diga uma vez e referencie.`);
  return achados;
}

function main() {
  const dados = JSON.parse(fs.readFileSync(0, 'utf8'));
  const arquivo = dados.tool_input?.file_path;
  if (!arquivo || !/\.(md|markdown|txt)$/i.test(arquivo) || !fs.existsSync(arquivo)) return 0;
  const limites = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'limites.json'), 'utf8'));
  const achados = medir(arquivo, fs.readFileSync(arquivo, 'utf8'), limites);
  if (!achados.length) return 0;
  // Teto de avisos por arquivo nesta sessão: depois disso, aceita (o conteúdo pode precisar ser assim).
  const estadoArq = path.join(os.tmpdir(), `foco-${String(dados.session_id || 'sem-sessao').replace(/\W/g, '')}.json`);
  let estado = {};
  try { estado = JSON.parse(fs.readFileSync(estadoArq, 'utf8')); } catch {}
  if ((estado[arquivo] || 0) >= limites.avisosPorArquivo) return 0;
  estado[arquivo] = (estado[arquivo] || 0) + 1;
  try { fs.writeFileSync(estadoArq, JSON.stringify(estado)); } catch {}
  process.stderr.write(`foco: ${path.basename(arquivo)} ficou longo demais para quem vai ler (aviso ${estado[arquivo]} de ${limites.avisosPorArquivo}).\n`
    + achados.map((a) => `- ${a}`).join('\n')
    + '\nReescreva enxugando sem perder requisito, critério de aceite, evidência ou decisão. Se o tamanho for necessário, siga.\n');
  return 2;
}

if (require.main === module) {
  let codigo = 0;
  try { codigo = main(); } catch { codigo = 0; }
  process.exit(codigo);
}
module.exports = { medir, paragrafos };
