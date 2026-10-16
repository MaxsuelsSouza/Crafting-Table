// @ts-check
// Nome do arquivo, rótulos e utilidades usados pelas seções do refinamento.md.
const fs = require('fs');

const ARQUIVO = 'refinamento.md';
// Decisão "de rotina": no modo de teste do maestro todo Read/Bash vira decisão; aqui ficam só as que o Claude escreveu como DECISÃO: ou que vieram de você.
const ROTINA =
  /^(\p{L}+ndo\b|Passo \d+ ·|Pergunta para você|Dúvida registrada|Análise do comentário|Mudança aplicada|Tarefa \w+:|Achado |Comentário classificado|Tentou aprovar)/u;
const STATUS = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  aguardando_revisao: 'Aguardando revisão',
  aprovado: 'Aprovado',
  desatualizado: 'Desatualizado'
};
const dia = (v) => (v ? String(v).slice(0, 10) : '');
const lerTexto = (f) => {
  try {
    return fs.readFileSync(f, 'utf8').trim();
  } catch {
    return '';
  }
};
const secao = (titulo, corpo) => (corpo ? `\n## ${titulo}\n\n${corpo}\n` : '');
// Títulos do arquivo embutido descem um nível para não brigar com os do pacote.
const embutir = (texto) => texto.replace(/^(#{1,5}) /gm, '#$1 ');

module.exports = { ARQUIVO, ROTINA, STATUS, dia, lerTexto, secao, embutir };
