// @ts-check
// O que vai no prompt: a regra (procurar antes, gravar o que descobrir) e o índice do que já existe (só tipo, chave e título;
// o conteúdo a IA busca pelo qa-state quando precisar, para não encher o prompt).
const { TIPOS, ler } = require('./arquivo');

const QA_STATE = () => require('../orquestrador/prompt-comum').QA_STATE; // ciclo: prompt-comum usa este arquivo

function regra() {
  const q = QA_STATE();
  return (
    `CONHECIMENTOS (aba Conhecimentos, vale para todos os tickets): ANTES de descobrir algo (colunas de tabela, seletor ou tela do app, caminho entre telas, endpoint, regra), ` +
    `procure: ${q} conhecimento buscar <termos>. Achou: use, sem consultar de novo. Não achou: descubra e GRAVE antes de seguir: ` +
    `${q} conhecimento add --tipo <${Object.keys(TIPOS).join('|')}> --chave "<nome único: SFC.TABELA, tela.botao, rota>" --titulo "<curto>" --conteudo "<o que serve para a próxima vez>" [--fonte "<arquivo:linha ou consulta>"] [--sha <commit do mobile, para seletor>]. ` +
    'Grave só fato confirmado (no código, no banco ou na tela), nunca suposição.'
  );
}

function indice(max = 120) {
  const d = ler(),
    itens = d.itens.slice().sort((a, b) => (b.usos || 0) - (a.usos || 0));
  if (!itens.length && !d.telaInicio) return '\nConhecimentos já registrados: nenhum ainda.';
  const linhas = itens.slice(0, max).map((i) => `- [${i.tipo}] ${i.chave}: ${i.titulo}`);
  return (
    `\nConhecimentos já registrados (${itens.length}; conteúdo com conhecimento buscar):\n${linhas.join('\n')}` +
    (itens.length > max ? `\n… e mais ${itens.length - max}: use a busca.` : '') +
    (d.telaInicio ? `\nTela de início dos testes: ${d.telaInicio}.` : '')
  );
}

module.exports = { regra, indice };
