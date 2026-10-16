// @ts-check
const fs = require('fs');
const path = require('path');
const { ehLocal, onde } = require('./dependencias');
const { PAUSA, citarRespostas, citarDossie } = require('../../orquestrador/prompt-comum');
const { PLANO_LOCAL, CONTEXTO } = require('./subetapas/1.2-plano-local');

// Só para documento: o original e o texto extraído (infra/ticket/contexto.js; só cita o que já existe na pasta do ticket).
function blocoDocumento(dir) {
  if (!ehLocal(dir)) return '';
  const raiz = path.dirname(dir),
    ex = (f) => fs.existsSync(path.join(raiz, f));
  const t = require('../../../../infra/ticket/tickets').ler(path.basename(raiz)),
    orig = t?.documento?.arquivo;
  const itens = [
    orig && `o documento original ${path.join(raiz, orig)}`,
    ex('.documento-extraido.md') && `o texto extraído dele ${path.join(raiz, '.documento-extraido.md')}`,
    ex('.documento-paginas') && `as páginas renderizadas (imagens) em ${path.join(raiz, '.documento-paginas')}`
  ].filter(Boolean);
  return itens.length
    ? ` Este ticket é um DOCUMENTO sem Jira: a fonte da verdade é ${itens.join(', ')}. Leia-os (imagens com Read) antes de montar os casos.`
    : '';
}

// Método do planejamento (o do jira-qa-planner, sem a parte que publica): casos de teste no formato que cenariosDo() entende.
const METODO =
  'MÉTODO: ANTES de criar do zero, procure nas fontes (subtarefas de QA, descrição, comentários, anexos) um planejamento já existente, em qualquer formato: se houver, transcreva-o fielmente em vez de inventar outro. Leia a descrição, os critérios de aceite e os comentários e monte os casos de teste que os cobrem. ' +
  'Estrutura do arquivo: "## Cenários de Teste" com um título "#### CT01 – <o que valida>" por caso (numeração contínua CT01, CT02…); ' +
  'em cada caso, o passo a passo em Gherkin, uma linha por item em negrito no início: **Dado que** …, **Quando** …, **Então** … (**E** … para continuar); ' +
  'depois "Validações:" com os pontos a conferir. Cubra o caminho feliz, as regras de negócio e os critérios de aceite, os limites e erros, e as regressões prováveis. ' +
  'Casos que dependem de exploração livre vão ao final como "#### Exploratório 1 – …". Termine com "## Critérios de aceite cobertos" (tabela CA × CT) e "## Riscos e pré-requisitos" ' +
  '(massa de dados, perfis/permissões, ambiente). Um cenário por comportamento verificável; sem inventar regra que não esteja nas fontes (o que faltar vai em Riscos). ' +
  'Na tabela de critérios use as colunas Critério | Cenários | Fonte (arquivo ou campo do ticket) | Confiança (aprovado, gerado, bruto, verbal ou inferido): critério que você deduziu é "inferido". ' +
  'Se a implementação (impl/implementacao.md, impl/plano-mudanca.md) grava em uma tabela (log, auditoria, histórico), crie um cenário que consulte essa tabela e cite o nome dela no título ou no corpo.';
const REGRAS_PLANO = (dir, rasc = dir) =>
  `Regras: português; você roda em segundo plano, sem ninguém para aprovar; use SÓ o contexto local (nada de ferramentas do ${onde(dir)}). ` +
  `Leia ${path.join(dir, CONTEXTO)} (ticket, subtarefas e comentários) e, se houver, os arquivos baixados do ticket (pasta ${path.join(dir, '..')}) e as specs na pasta do ticket (Glob/Read). ` +
  `${citarDossie(dir)}${citarRespostas(dir)}\n${blocoDocumento(dir)}Grave o plano completo, só o conteúdo do planejamento (sem cabeçalho de versão), em ${path.join(rasc, PLANO_LOCAL)}. NÃO publique, NÃO crie subtarefa nem comentário: a Crafting Table publica só depois de o humano ler e aprovar. ` +
  `Se faltar algo que só o humano sabe e nenhuma fonte responde, NÃO invente: grave ${path.join(rasc, PAUSA)} com {"motivo":"...","pergunta":"...","opcoes":["..."]} (opcoes pode ser vazio), não grave o plano e termine.`;
// Criar: o clique em "Criar planejamento" é o OK do humano. rasc: onde a IA pode escrever (infra/agentes/area-ia.js); a extensão copia para dir.
// Interpretar: o texto de QA já existe (subtarefa, descrição, comentário, anexo) mas em formato livre: o Claude identifica e normaliza, sem inventar.
const promptInterpretar = (dir, rasc = dir) =>
  `[segundo plano · Crafting Table] Este ticket JÁ TEM material de planejamento de testes de QA, em formato livre (pode ser tabela, lista, prosa, Gherkin ou outro). ` +
  'NÃO crie casos novos: procure nas fontes (subtarefas de QA, descrição, comentários e arquivos anexos) tudo o que for caso de teste/cenário, leia e reescreva cada um, fielmente, no formato abaixo, preservando o sentido e a ordem. ' +
  `Só o que as fontes não trazem (critérios cobertos, riscos) pode ser completado a partir delas.\n\n${METODO}\n\n${REGRAS_PLANO(dir, rasc)} Se NÃO houver nenhum caso de teste nas fontes, grave a pausa perguntando como proceder. Termine dizendo em uma frase quantos casos encontrou.`;
const promptCriar = (dir, rasc = dir) =>
  `[segundo plano · Crafting Table] Planejamento de testes de QA do ticket. O humano pediu o plano ao clicar em "Criar planejamento" e vai ler e aprovar o arquivo antes de qualquer publicação.\n\n${METODO}\n\n${REGRAS_PLANO(dir, rasc)}` +
  ' Termine dizendo em uma frase quantos casos montou.';
// Pedir mudança: a IA edita o arquivo local; a extensão republica.
const promptMudanca = (dir, pedido, rasc = dir) =>
  `[segundo plano · Crafting Table] O humano pediu esta mudança no planejamento de QA, que está em ${path.join(rasc, PLANO_LOCAL)}: "${pedido}".\n` +
  'Aplique o pedido editando esse arquivo (não pergunte nada): mantenha o formato e a numeração dos cenários que não mudaram e continue a numeração nos novos.\n\n' +
  `${METODO}\n\n${REGRAS_PLANO(dir, rasc)} Não crie outro arquivo. Termine dizendo em uma frase o que mudou.`;
// Ferramentas liberadas: só leitura do contexto local e escrita/edição do plano. Nada do provedor.
const FERRAMENTAS_PLANO = ['Read', 'Glob', 'Grep', 'Write', 'Edit'];

module.exports = {
  METODO,
  REGRAS_PLANO,
  blocoDocumento,
  promptInterpretar,
  promptCriar,
  promptMudanca,
  FERRAMENTAS_PLANO
};
